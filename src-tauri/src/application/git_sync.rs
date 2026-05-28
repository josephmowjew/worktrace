use std::collections::{HashMap, HashSet};
use std::time::Instant;

use chrono::{DateTime, Duration, Utc};

use crate::domain::commit::{SyncCommitsInput, SyncCommitsResult, SyncMode};
use crate::domain::git_metadata::{ProjectGitSyncCursor, ProjectGitSyncState};
use crate::infrastructure::database::repositories::{
    CommitRepository, GitMetadataRepository, ProjectRepository,
};
use crate::infrastructure::git::scanner::{GitRevisionSource, GitScanOptions, GitScanner};

pub struct GitSyncService;

const EVIDENCE_VERSION: &str = "git-evidence-v2";
const AUTO_FRESH_MINUTES: i64 = 5;
const SLOW_PROJECT_MS: u128 = 2_500;

impl GitSyncService {
    pub async fn sync(
        project_repository: &ProjectRepository<'_>,
        commit_repository: &CommitRepository<'_>,
        git_metadata_repository: &GitMetadataRepository<'_>,
        input: SyncCommitsInput,
    ) -> Result<SyncCommitsResult, GitSyncServiceError> {
        let started = Instant::now();
        let mode = input.mode.clone().unwrap_or_default();
        let projects = project_repository
            .list_active()
            .await
            .map_err(GitSyncServiceError::Database)?;

        let mut result = SyncCommitsResult {
            scanned_projects: 0,
            skipped_projects: 0,
            skipped_fresh_projects: 0,
            incremental_projects: 0,
            full_projects: 0,
            unchanged_projects: 0,
            fallback_rescans: 0,
            new_commits: 0,
            updated_commits: 0,
            evidence_repaired: 0,
            diff_snippets_collected: 0,
            duration_ms: 0,
            slow_projects: Vec::new(),
            errors: Vec::new(),
        };

        for project in projects {
            if let Some(project_ids) = &input.project_ids {
                if !project_ids.contains(&project.id) {
                    continue;
                }
            }

            let Some(repo_path) = project
                .repo_path
                .clone()
                .filter(|path| !path.trim().is_empty())
            else {
                result.skipped_projects += 1;
                continue;
            };

            let project_started = Instant::now();
            match sync_project(
                commit_repository,
                git_metadata_repository,
                &project.id,
                &project.name,
                &repo_path,
                &input,
                &mode,
            )
            .await
            {
                Ok(scan) => {
                    result.scanned_projects += 1;
                    result.skipped_fresh_projects += scan.skipped_fresh_projects;
                    result.incremental_projects += scan.incremental_projects;
                    result.full_projects += scan.full_projects;
                    result.unchanged_projects += scan.unchanged_projects;
                    result.fallback_rescans += scan.fallback_rescans;
                    result.new_commits += scan.new_commits;
                    result.updated_commits += scan.updated_commits;
                    result.evidence_repaired += scan.evidence_repaired;
                    result.diff_snippets_collected += scan.diff_snippets_collected;
                }
                Err(ProjectSyncOutcomeError::Fresh) => {
                    result.skipped_fresh_projects += 1;
                }
                Err(error) => {
                    result.errors.push(format!("{}: {}", project.name, error));
                }
            }
            let elapsed = project_started.elapsed().as_millis();
            if elapsed >= SLOW_PROJECT_MS {
                result.slow_projects.push(format!(
                    "{} took {:.1}s",
                    project.name,
                    elapsed as f64 / 1000.0
                ));
            }
        }

        result.duration_ms = started.elapsed().as_millis() as i64;
        Ok(result)
    }
}

struct ProjectSyncOutcome {
    skipped_fresh_projects: i64,
    incremental_projects: i64,
    full_projects: i64,
    unchanged_projects: i64,
    fallback_rescans: i64,
    new_commits: i64,
    updated_commits: i64,
    evidence_repaired: i64,
    diff_snippets_collected: i64,
}

#[derive(Debug)]
enum ProjectSyncOutcomeError {
    Fresh,
    Scan(String),
    Database(sqlx::Error),
}

impl std::fmt::Display for ProjectSyncOutcomeError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Fresh => write!(formatter, "fresh"),
            Self::Scan(message) => write!(formatter, "{message}"),
            Self::Database(error) => write!(formatter, "{error}"),
        }
    }
}

async fn sync_project(
    commit_repository: &CommitRepository<'_>,
    git_metadata_repository: &GitMetadataRepository<'_>,
    project_id: &str,
    _project_name: &str,
    repo_path: &str,
    input: &SyncCommitsInput,
    mode: &SyncMode,
) -> Result<ProjectSyncOutcome, ProjectSyncOutcomeError> {
    let can_use_cursors =
        matches!(mode, SyncMode::Auto) && input.from.is_none() && input.to.is_none();

    if matches!(mode, SyncMode::Auto) {
        let fingerprint = GitScanner::ref_fingerprint(project_id, repo_path)
            .map_err(|error| ProjectSyncOutcomeError::Scan(error.to_string()))?;
        if let Some(state) = git_metadata_repository
            .get_sync_state(
                project_id,
                input.from.as_deref(),
                input.to.as_deref(),
                input.author_email.as_deref(),
            )
            .await
            .map_err(ProjectSyncOutcomeError::Database)?
        {
            if state.ref_fingerprint == fingerprint
                && state.evidence_version == EVIDENCE_VERSION
                && is_recent(&state.last_scanned_at)
                && state.last_error.is_none()
            {
                return Err(ProjectSyncOutcomeError::Fresh);
            }
        }
    }

    let full = matches!(mode, SyncMode::Full);
    let mut fallback_rescans = 0;
    let mut incremental_sources = None;
    let mut cursor_updates = Vec::new();
    let mut unchanged_project = false;
    if can_use_cursors {
        let heads = GitScanner::discover_source_heads(project_id, repo_path)
            .map_err(|error| ProjectSyncOutcomeError::Scan(error.to_string()))?;
        let cursors = git_metadata_repository
            .list_sync_cursors(project_id)
            .await
            .map_err(ProjectSyncOutcomeError::Database)?
            .into_iter()
            .map(|cursor| {
                (
                    (cursor.source_kind.clone(), cursor.source_name.clone()),
                    cursor,
                )
            })
            .collect::<HashMap<_, _>>();
        let now = Utc::now().to_rfc3339();
        let mut revision_sources = Vec::new();
        for head in heads {
            let key = (head.source_kind.clone(), head.source_name.clone());
            let previous = cursors
                .get(&key)
                .and_then(|cursor| cursor.latest_head_commit.clone());
            let latest = head.head_commit.clone();
            let previous_head_for_cursor = previous.clone();
            if previous.is_some() && previous == latest {
                cursor_updates.push(ProjectGitSyncCursor {
                    project_id: project_id.to_string(),
                    source_kind: head.source_kind,
                    source_name: head.source_name,
                    previous_head_commit: previous_head_for_cursor,
                    latest_head_commit: latest,
                    last_synced_at: now.clone(),
                    last_full_synced_at: None,
                    last_error: None,
                    is_stale: false,
                });
                continue;
            }

            let rev = match (previous.as_deref(), latest.as_deref()) {
                (Some(old), Some(new)) if GitScanner::is_ancestor(&head.repo_path, old, new) => {
                    format!("{old}..{new}")
                }
                (Some(_old), Some(_new)) => {
                    fallback_rescans += 1;
                    head.rev.clone()
                }
                _ => head.rev.clone(),
            };
            revision_sources.push(GitRevisionSource {
                source_kind: head.source_kind.clone(),
                source_name: head.source_name.clone(),
                repo_path: head.repo_path.clone(),
                rev,
            });
            cursor_updates.push(ProjectGitSyncCursor {
                project_id: project_id.to_string(),
                source_kind: head.source_kind,
                source_name: head.source_name,
                previous_head_commit: previous_head_for_cursor,
                latest_head_commit: latest,
                last_synced_at: now.clone(),
                last_full_synced_at: None,
                last_error: None,
                is_stale: false,
            });
        }
        if revision_sources.is_empty() {
            unchanged_project = true;
        }
        incremental_sources = Some(revision_sources);
    }
    let cheap_scan = GitScanner::scan_with_options(
        project_id,
        repo_path,
        input.from.as_deref(),
        input.to.as_deref(),
        input.author_email.as_deref(),
        GitScanOptions {
            collect_evidence: full,
            evidence_commit_hashes: None,
            check_worktree_clean: full,
            revision_sources: incremental_sources.clone(),
        },
    )
    .map_err(|error| ProjectSyncOutcomeError::Scan(error.to_string()))?;

    let mut commits = cheap_scan.commits;
    let commit_hashes = commits
        .iter()
        .map(|commit| commit.commit_hash.clone())
        .collect::<Vec<_>>();

    let mut file_changes = cheap_scan.file_changes;
    let mut diff_snippets = cheap_scan.diff_snippets;
    let mut repaired_hashes = Vec::new();
    if !full {
        repaired_hashes = git_metadata_repository
            .missing_file_evidence_commit_hashes(project_id, &commit_hashes)
            .await
            .map_err(ProjectSyncOutcomeError::Database)?;
        if !repaired_hashes.is_empty() {
            let evidence_hashes = repaired_hashes.iter().cloned().collect::<HashSet<_>>();
            let evidence_scan = GitScanner::scan_with_options(
                project_id,
                repo_path,
                input.from.as_deref(),
                input.to.as_deref(),
                input.author_email.as_deref(),
                GitScanOptions {
                    collect_evidence: true,
                    evidence_commit_hashes: Some(evidence_hashes),
                    check_worktree_clean: false,
                    revision_sources: incremental_sources,
                },
            )
            .map_err(|error| ProjectSyncOutcomeError::Scan(error.to_string()))?;
            merge_commit_stats(&mut commits, evidence_scan.commits);
            file_changes = evidence_scan.file_changes;
            diff_snippets = evidence_scan.diff_snippets;
        }
    }

    git_metadata_repository
        .replace_refs(project_id, &cheap_scan.refs)
        .await
        .map_err(ProjectSyncOutcomeError::Database)?;
    git_metadata_repository
        .replace_commit_refs(project_id, &cheap_scan.commit_refs)
        .await
        .map_err(ProjectSyncOutcomeError::Database)?;
    git_metadata_repository
        .replace_commit_worktree_refs(project_id, &cheap_scan.commit_worktree_refs)
        .await
        .map_err(ProjectSyncOutcomeError::Database)?;
    git_metadata_repository
        .replace_worktrees(project_id, &cheap_scan.worktrees)
        .await
        .map_err(ProjectSyncOutcomeError::Database)?;

    if full {
        git_metadata_repository
            .replace_commit_file_changes(project_id, &file_changes)
            .await
            .map_err(ProjectSyncOutcomeError::Database)?;
        git_metadata_repository
            .replace_commit_diff_snippets(project_id, &diff_snippets)
            .await
            .map_err(ProjectSyncOutcomeError::Database)?;
    } else if !repaired_hashes.is_empty() {
        git_metadata_repository
            .replace_commit_file_changes_for_hashes(project_id, &repaired_hashes, &file_changes)
            .await
            .map_err(ProjectSyncOutcomeError::Database)?;
        git_metadata_repository
            .replace_commit_diff_snippets_for_hashes(project_id, &repaired_hashes, &diff_snippets)
            .await
            .map_err(ProjectSyncOutcomeError::Database)?;
    }

    let (new_commits, updated_commits) = commit_repository
        .upsert_many(&commits)
        .await
        .map_err(ProjectSyncOutcomeError::Database)?;

    let fingerprint = GitScanner::ref_fingerprint(project_id, repo_path)
        .map_err(|error| ProjectSyncOutcomeError::Scan(error.to_string()))?;
    let now = Utc::now().to_rfc3339();
    if full {
        let heads = GitScanner::discover_source_heads(project_id, repo_path)
            .map_err(|error| ProjectSyncOutcomeError::Scan(error.to_string()))?;
        cursor_updates = heads
            .into_iter()
            .map(|head| ProjectGitSyncCursor {
                project_id: project_id.to_string(),
                source_kind: head.source_kind,
                source_name: head.source_name,
                previous_head_commit: None,
                latest_head_commit: head.head_commit,
                last_synced_at: now.clone(),
                last_full_synced_at: Some(now.clone()),
                last_error: None,
                is_stale: false,
            })
            .collect();
    }
    if can_use_cursors || full {
        git_metadata_repository
            .upsert_sync_cursors(&cursor_updates)
            .await
            .map_err(ProjectSyncOutcomeError::Database)?;
    }
    git_metadata_repository
        .upsert_sync_state(&ProjectGitSyncState {
            project_id: project_id.to_string(),
            range_from: input.from.clone(),
            range_to: input.to.clone(),
            author_email: input.author_email.clone(),
            ref_fingerprint: fingerprint,
            evidence_version: EVIDENCE_VERSION.to_string(),
            last_scanned_at: now.clone(),
            last_full_scanned_at: if full { Some(now) } else { None },
            last_error: None,
        })
        .await
        .map_err(ProjectSyncOutcomeError::Database)?;

    Ok(ProjectSyncOutcome {
        skipped_fresh_projects: 0,
        incremental_projects: if !full { 1 } else { 0 },
        full_projects: if full { 1 } else { 0 },
        unchanged_projects: if unchanged_project { 1 } else { 0 },
        fallback_rescans,
        new_commits,
        updated_commits,
        evidence_repaired: repaired_hashes.len() as i64,
        diff_snippets_collected: diff_snippets.len() as i64,
    })
}

fn merge_commit_stats(
    commits: &mut [crate::domain::commit::Commit],
    evidence_commits: Vec<crate::domain::commit::Commit>,
) {
    let stats = evidence_commits
        .into_iter()
        .map(|commit| {
            (
                commit.commit_hash,
                (commit.files_changed, commit.insertions, commit.deletions),
            )
        })
        .collect::<HashMap<_, _>>();
    for commit in commits {
        if let Some((files_changed, insertions, deletions)) = stats.get(&commit.commit_hash) {
            commit.files_changed = *files_changed;
            commit.insertions = *insertions;
            commit.deletions = *deletions;
        }
    }
}

fn is_recent(timestamp: &str) -> bool {
    DateTime::parse_from_rfc3339(timestamp)
        .map(|parsed| {
            Utc::now().signed_duration_since(parsed.with_timezone(&Utc))
                < Duration::minutes(AUTO_FRESH_MINUTES)
        })
        .unwrap_or(false)
}

#[derive(Debug)]
pub enum GitSyncServiceError {
    Validation(String),
    Database(sqlx::Error),
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::SqlitePool;

    use super::*;
    use crate::domain::activity::ListActivityInput;
    use crate::domain::project::CreateProjectInput;
    use crate::infrastructure::database::migrations::run_migrations;
    use crate::infrastructure::database::repositories::ActivityRepository;

    #[tokio::test]
    async fn sync_scans_real_repo_and_activity_query_returns_commit() {
        let pool = test_pool().await;
        let repo_path = create_git_repo_with_commit();
        let project_repository = ProjectRepository::new(&pool);
        let commit_repository = CommitRepository::new(&pool);
        let git_metadata_repository = GitMetadataRepository::new(&pool);
        let activity_repository = ActivityRepository::new(&pool);

        let project = project_repository
            .create(CreateProjectInput {
                name: "Phase 5 Test Repo".to_string(),
                description: None,
                repo_path: Some(repo_path.to_string_lossy().to_string()),
                github_url: None,
                project_type: Some("Company".to_string()),
                classification: None,
            })
            .await
            .expect("create project");

        let result = GitSyncService::sync(
            &project_repository,
            &commit_repository,
            &git_metadata_repository,
            SyncCommitsInput {
                from: Some("2026-05-19".to_string()),
                to: Some("2026-05-21".to_string()),
                author_email: Some("tester@worktrace.local".to_string()),
                project_ids: Some(vec![project.id]),
                mode: None,
            },
        )
        .await
        .expect("sync commits");

        assert_eq!(result.scanned_projects, 1);
        assert_eq!(result.new_commits, 1);
        assert!(result.errors.is_empty());

        let activity = activity_repository
            .list(ListActivityInput {
                from: "2026-05-19".to_string(),
                to: "2026-05-21".to_string(),
                activity_type: Some("commit".to_string()),
                project_ids: None,
                workspace_ids: None,
                classification: None,
                git_refs: None,
                worktree_paths: None,
            })
            .await
            .expect("list activity");

        assert_eq!(activity.len(), 1);
        assert_eq!(activity[0].items.len(), 1);
        assert_eq!(activity[0].items[0].summary, "feat: verify sync service");

        fs::remove_dir_all(repo_path).ok();
    }

    async fn test_pool() -> SqlitePool {
        let options = SqliteConnectOptions::new()
            .filename(":memory:")
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .expect("create sqlite test pool");

        run_migrations(&pool).await.expect("run migrations");
        pool
    }

    fn create_git_repo_with_commit() -> PathBuf {
        let repo_path = create_temp_repo_path();
        fs::create_dir_all(&repo_path).expect("create temp repo");
        run_git(&repo_path, &["init"]);
        run_git(&repo_path, &["config", "user.name", "WorkTrace Tester"]);
        run_git(
            &repo_path,
            &["config", "user.email", "tester@worktrace.local"],
        );

        fs::write(repo_path.join("sync.txt"), "synced line\n").expect("write commit file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &["commit", "-m", "feat: verify sync service"],
            "2026-05-20T10:00:00+00:00",
        );

        repo_path
    }

    fn create_temp_repo_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();

        std::env::temp_dir().join(format!("worktrace_sync_service_test_{nanos}"))
    }

    fn run_git(repo_path: &Path, args: &[&str]) {
        let output = std::process::Command::new("git")
            .current_dir(repo_path)
            .args(args)
            .output()
            .expect("run git");

        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn run_git_with_dates(repo_path: &Path, args: &[&str], date: &str) {
        let output = std::process::Command::new("git")
            .current_dir(repo_path)
            .args(args)
            .env("GIT_AUTHOR_DATE", date)
            .env("GIT_COMMITTER_DATE", date)
            .output()
            .expect("run git");

        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
