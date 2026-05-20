use crate::domain::commit::{SyncCommitsInput, SyncCommitsResult};
use crate::infrastructure::database::repositories::{
    CommitRepository, CommitUpsertResult, ProjectRepository,
};
use crate::infrastructure::git::scanner::GitScanner;

pub struct GitSyncService;

impl GitSyncService {
    pub async fn sync(
        project_repository: &ProjectRepository<'_>,
        commit_repository: &CommitRepository<'_>,
        input: SyncCommitsInput,
    ) -> Result<SyncCommitsResult, GitSyncServiceError> {
        let projects = project_repository
            .list_active()
            .await
            .map_err(GitSyncServiceError::Database)?;

        let mut result = SyncCommitsResult {
            scanned_projects: 0,
            skipped_projects: 0,
            new_commits: 0,
            updated_commits: 0,
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

            match GitScanner::scan(
                &project.id,
                &repo_path,
                input.from.as_deref(),
                input.to.as_deref(),
                input.author_email.as_deref(),
            ) {
                Ok(commits) => {
                    result.scanned_projects += 1;

                    for commit in commits {
                        match commit_repository.upsert(&commit).await {
                            Ok(CommitUpsertResult::Inserted) => result.new_commits += 1,
                            Ok(CommitUpsertResult::Updated) => result.updated_commits += 1,
                            Err(error) => result.errors.push(format!(
                                "{}: failed to save commit {}: {}",
                                project.name, commit.commit_hash, error
                            )),
                        }
                    }
                }
                Err(error) => {
                    result.errors.push(format!("{}: {}", project.name, error));
                }
            }
        }

        Ok(result)
    }
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
        let activity_repository = ActivityRepository::new(&pool);

        let project = project_repository
            .create(CreateProjectInput {
                name: "Phase 5 Test Repo".to_string(),
                repo_path: Some(repo_path.to_string_lossy().to_string()),
                github_url: None,
                project_type: Some("Company".to_string()),
            })
            .await
            .expect("create project");

        let result = GitSyncService::sync(
            &project_repository,
            &commit_repository,
            SyncCommitsInput {
                from: Some("2026-05-19".to_string()),
                to: Some("2026-05-21".to_string()),
                author_email: Some("tester@worktrace.local".to_string()),
                project_ids: Some(vec![project.id]),
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
