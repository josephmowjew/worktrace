use std::collections::{HashMap, HashSet};
use std::path::Path;

use chrono::Utc;

use crate::domain::commit::Commit;
use crate::domain::git_metadata::{
    CommitDiffSnippet, CommitFileChange, CommitRef, CommitWorktreeRef, GitRef, GitRefKind,
    GitWorktree,
};
use crate::infrastructure::git::parser::{
    parse_git_log, with_project, ParsedGitCommit, GIT_FIELD_SEPARATOR, GIT_RECORD_SEPARATOR,
};
use crate::infrastructure::git::runner;

pub struct GitScanner;

pub struct GitScanResult {
    pub commits: Vec<Commit>,
    pub file_changes: Vec<CommitFileChange>,
    pub diff_snippets: Vec<CommitDiffSnippet>,
    pub refs: Vec<GitRef>,
    pub commit_refs: Vec<CommitRef>,
    pub commit_worktree_refs: Vec<CommitWorktreeRef>,
    pub worktrees: Vec<GitWorktree>,
}

pub struct GitScanOptions {
    pub collect_evidence: bool,
    pub evidence_commit_hashes: Option<HashSet<String>>,
    pub check_worktree_clean: bool,
    pub revision_sources: Option<Vec<GitRevisionSource>>,
}

#[derive(Debug, Clone)]
pub struct GitRevisionSource {
    pub source_kind: String,
    pub source_name: String,
    pub repo_path: String,
    pub rev: String,
}

#[derive(Debug, Clone)]
pub struct GitSourceHead {
    pub source_kind: String,
    pub source_name: String,
    pub repo_path: String,
    pub rev: String,
    pub head_commit: Option<String>,
}

impl Default for GitScanOptions {
    fn default() -> Self {
        Self {
            collect_evidence: true,
            evidence_commit_hashes: None,
            check_worktree_clean: true,
            revision_sources: None,
        }
    }
}

impl GitScanner {
    pub fn scan(
        project_id: &str,
        repo_path: &str,
        from: Option<&str>,
        to: Option<&str>,
        author_email: Option<&str>,
    ) -> Result<GitScanResult, GitScanError> {
        Self::scan_with_options(
            project_id,
            repo_path,
            from,
            to,
            author_email,
            GitScanOptions::default(),
        )
    }

    pub fn ref_fingerprint(project_id: &str, repo_path: &str) -> Result<String, GitScanError> {
        if !Path::new(repo_path).exists() {
            return Err(GitScanError::RepoNotFound(repo_path.to_string()));
        }
        let scanned_at = Utc::now().to_rfc3339();
        let refs = discover_refs(project_id, repo_path, &scanned_at)?;
        let worktrees = discover_worktrees(project_id, repo_path, &scanned_at, false)?;
        Ok(ref_fingerprint(&refs, &worktrees))
    }

    pub fn discover_source_heads(
        project_id: &str,
        repo_path: &str,
    ) -> Result<Vec<GitSourceHead>, GitScanError> {
        if !Path::new(repo_path).exists() {
            return Err(GitScanError::RepoNotFound(repo_path.to_string()));
        }
        let scanned_at = Utc::now().to_rfc3339();
        let refs = discover_refs(project_id, repo_path, &scanned_at)?;
        let worktrees = discover_worktrees(project_id, repo_path, &scanned_at, false)?;
        let mut heads = refs
            .iter()
            .filter_map(|git_ref| {
                git_ref.last_seen_commit.as_ref().map(|head| GitSourceHead {
                    source_kind: format!("ref:{}", git_ref.kind.as_storage_value()),
                    source_name: git_ref.name.clone(),
                    repo_path: repo_path.to_string(),
                    rev: git_ref.full_name.clone(),
                    head_commit: Some(head.clone()),
                })
            })
            .collect::<Vec<_>>();
        heads.extend(worktrees.iter().filter_map(|worktree| {
            worktree.head_commit.as_ref().map(|head| GitSourceHead {
                source_kind: "worktree".to_string(),
                source_name: worktree.path.clone(),
                repo_path: worktree.path.clone(),
                rev: worktree.branch.clone().unwrap_or_else(|| head.clone()),
                head_commit: Some(head.clone()),
            })
        }));
        if heads.is_empty() {
            let head = rev_parse(repo_path, "HEAD").ok();
            heads.push(GitSourceHead {
                source_kind: "head".to_string(),
                source_name: "HEAD".to_string(),
                repo_path: repo_path.to_string(),
                rev: "HEAD".to_string(),
                head_commit: head,
            });
        }
        Ok(heads)
    }

    pub fn is_ancestor(repo_path: &str, ancestor: &str, descendant: &str) -> bool {
        runner::run_git(
            repo_path,
            &["merge-base", "--is-ancestor", ancestor, descendant],
        )
        .map(|output| output.status.success())
        .unwrap_or(false)
    }

    pub fn scan_with_options(
        project_id: &str,
        repo_path: &str,
        from: Option<&str>,
        to: Option<&str>,
        author_email: Option<&str>,
        options: GitScanOptions,
    ) -> Result<GitScanResult, GitScanError> {
        if !Path::new(repo_path).exists() {
            return Err(GitScanError::RepoNotFound(repo_path.to_string()));
        }

        let scanned_at = Utc::now().to_rfc3339();
        let refs = discover_refs(project_id, repo_path, &scanned_at)?;
        let worktrees = discover_worktrees(
            project_id,
            repo_path,
            &scanned_at,
            options.check_worktree_clean,
        )?;
        let mut commits_by_hash: HashMap<String, ParsedGitCommit> = HashMap::new();
        let mut stats_by_hash: HashMap<String, CommitStats> = HashMap::new();
        let mut refs_by_commit: HashMap<String, Vec<CommitRef>> = HashMap::new();

        if let Some(revision_sources) = &options.revision_sources {
            let mut commit_worktree_refs = Vec::new();
            for source in revision_sources {
                let stdout = run_git_log(&source.repo_path, &source.rev, from, to, author_email)?;
                for parsed in parse_git_log(&stdout) {
                    if source.source_kind == "worktree" {
                        commit_worktree_refs.push(CommitWorktreeRef {
                            project_id: project_id.to_string(),
                            commit_hash: parsed.commit_hash.clone(),
                            worktree_path: source.source_name.clone(),
                            branch: Some(source.rev.clone()),
                        });
                    } else {
                        let ref_kind = if source.source_kind == "ref:remote" {
                            GitRefKind::Remote
                        } else {
                            GitRefKind::Local
                        };
                        refs_by_commit
                            .entry(parsed.commit_hash.clone())
                            .or_default()
                            .push(CommitRef {
                                project_id: project_id.to_string(),
                                commit_hash: parsed.commit_hash.clone(),
                                ref_name: source.source_name.clone(),
                                ref_kind,
                            });
                    }
                    commits_by_hash
                        .entry(parsed.commit_hash.clone())
                        .or_insert(parsed);
                }
                if options.collect_evidence {
                    for (hash, stats) in load_commit_stats(
                        project_id,
                        &source.repo_path,
                        &source.rev,
                        from,
                        to,
                        author_email,
                        &scanned_at,
                        options.evidence_commit_hashes.as_ref(),
                    )? {
                        stats_by_hash.entry(hash).or_insert(stats);
                    }
                }
            }

            commit_worktree_refs.sort_by(|left, right| {
                left.commit_hash
                    .cmp(&right.commit_hash)
                    .then_with(|| left.worktree_path.cmp(&right.worktree_path))
            });
            commit_worktree_refs.dedup_by(|left, right| {
                left.commit_hash == right.commit_hash && left.worktree_path == right.worktree_path
            });
            let mut commit_refs = refs_by_commit
                .values()
                .flat_map(|refs| refs.iter().cloned())
                .collect::<Vec<_>>();
            commit_refs.sort_by(|left, right| {
                left.commit_hash
                    .cmp(&right.commit_hash)
                    .then_with(|| left.ref_name.cmp(&right.ref_name))
            });
            commit_refs.dedup_by(|left, right| {
                left.commit_hash == right.commit_hash
                    && left.ref_name == right.ref_name
                    && left.ref_kind == right.ref_kind
            });
            let commits = commits_by_hash
                .into_iter()
                .map(|(commit_hash, parsed)| {
                    let branch = preferred_branch(&commit_hash, &refs_by_commit, &refs);
                    let mut commit = with_project(parsed, project_id, branch);
                    if let Some(commit_stats) = stats_by_hash.get(&commit.commit_hash) {
                        commit.files_changed = Some(commit_stats.files_changed);
                        commit.insertions = Some(commit_stats.insertions);
                        commit.deletions = Some(commit_stats.deletions);
                    }
                    commit
                })
                .collect::<Vec<_>>();
            let file_changes = collect_file_changes(&stats_by_hash);
            let diff_snippets =
                collect_diff_snippets(repo_path, project_id, &file_changes, &scanned_at);
            return Ok(GitScanResult {
                commits,
                file_changes,
                diff_snippets,
                refs,
                commit_refs,
                commit_worktree_refs,
                worktrees,
            });
        }

        for git_ref in &refs {
            let stdout = run_git_log(repo_path, &git_ref.full_name, from, to, author_email)?;
            for parsed in parse_git_log(&stdout) {
                refs_by_commit
                    .entry(parsed.commit_hash.clone())
                    .or_default()
                    .push(CommitRef {
                        project_id: project_id.to_string(),
                        commit_hash: parsed.commit_hash.clone(),
                        ref_name: git_ref.name.clone(),
                        ref_kind: git_ref.kind.clone(),
                    });
                commits_by_hash
                    .entry(parsed.commit_hash.clone())
                    .or_insert(parsed);
            }

            if options.collect_evidence {
                for (hash, stats) in load_commit_stats(
                    project_id,
                    repo_path,
                    &git_ref.full_name,
                    from,
                    to,
                    author_email,
                    &scanned_at,
                    options.evidence_commit_hashes.as_ref(),
                )? {
                    stats_by_hash.entry(hash).or_insert(stats);
                }
            }
        }

        if refs.is_empty() {
            let branch = current_branch(repo_path)
                .ok()
                .filter(|branch| !branch.is_empty());
            let stdout = run_git_log(repo_path, "HEAD", from, to, author_email)?;
            for parsed in parse_git_log(&stdout) {
                commits_by_hash
                    .entry(parsed.commit_hash.clone())
                    .or_insert(parsed);
            }
            if options.collect_evidence {
                for (hash, stats) in load_commit_stats(
                    project_id,
                    repo_path,
                    "HEAD",
                    from,
                    to,
                    author_email,
                    &scanned_at,
                    options.evidence_commit_hashes.as_ref(),
                )? {
                    stats_by_hash.entry(hash).or_insert(stats);
                }
            }
            let commit_worktree_refs = scan_worktree_commits(
                project_id,
                &worktrees,
                from,
                to,
                author_email,
                &mut commits_by_hash,
                &mut stats_by_hash,
                &options,
            )?;
            let commits = commits_by_hash
                .into_values()
                .map(|parsed| {
                    let mut commit = with_project(parsed, project_id, branch.clone());
                    if let Some(commit_stats) = stats_by_hash.get(&commit.commit_hash) {
                        commit.files_changed = Some(commit_stats.files_changed);
                        commit.insertions = Some(commit_stats.insertions);
                        commit.deletions = Some(commit_stats.deletions);
                    }
                    commit
                })
                .collect::<Vec<_>>();

            let file_changes = collect_file_changes(&stats_by_hash);
            let diff_snippets =
                collect_diff_snippets(repo_path, project_id, &file_changes, &scanned_at);

            return Ok(GitScanResult {
                commits,
                file_changes,
                diff_snippets,
                refs,
                commit_refs: Vec::new(),
                commit_worktree_refs,
                worktrees,
            });
        }

        let commit_worktree_refs = scan_worktree_commits(
            project_id,
            &worktrees,
            from,
            to,
            author_email,
            &mut commits_by_hash,
            &mut stats_by_hash,
            &options,
        )?;
        let mut commit_refs = refs_by_commit
            .values()
            .flat_map(|refs| refs.iter().cloned())
            .collect::<Vec<_>>();
        commit_refs.sort_by(|left, right| {
            left.commit_hash
                .cmp(&right.commit_hash)
                .then_with(|| left.ref_name.cmp(&right.ref_name))
        });
        commit_refs.dedup_by(|left, right| {
            left.commit_hash == right.commit_hash
                && left.ref_name == right.ref_name
                && left.ref_kind == right.ref_kind
        });

        let commits = commits_by_hash
            .into_iter()
            .map(|(commit_hash, parsed)| {
                let branch = preferred_branch(&commit_hash, &refs_by_commit, &refs);
                let mut commit = with_project(parsed, project_id, branch);
                if let Some(commit_stats) = stats_by_hash.get(&commit.commit_hash) {
                    commit.files_changed = Some(commit_stats.files_changed);
                    commit.insertions = Some(commit_stats.insertions);
                    commit.deletions = Some(commit_stats.deletions);
                }
                commit
            })
            .collect::<Vec<_>>();

        let file_changes = collect_file_changes(&stats_by_hash);
        let diff_snippets =
            collect_diff_snippets(repo_path, project_id, &file_changes, &scanned_at);

        Ok(GitScanResult {
            commits,
            file_changes,
            diff_snippets,
            refs,
            commit_refs,
            commit_worktree_refs,
            worktrees,
        })
    }
}

#[derive(Debug)]
pub enum GitScanError {
    RepoNotFound(String),
    CommandFailed(String),
}

impl std::fmt::Display for GitScanError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RepoNotFound(path) => write!(formatter, "repository path was not found: {path}"),
            Self::CommandFailed(message) => write!(formatter, "git command failed: {message}"),
        }
    }
}

impl std::error::Error for GitScanError {}

struct CommitStats {
    files_changed: i64,
    insertions: i64,
    deletions: i64,
    file_changes: Vec<CommitFileChange>,
}

fn discover_refs(
    project_id: &str,
    repo_path: &str,
    scanned_at: &str,
) -> Result<Vec<GitRef>, GitScanError> {
    let current_branch = current_branch(repo_path)
        .ok()
        .map(|branch| branch.trim().to_string())
        .filter(|branch| !branch.is_empty());
    let output = runner::run_git(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(refname)\u{1f}%(refname:short)\u{1f}%(objectname)\u{1f}%(HEAD)",
            "refs/heads",
            "refs/remotes",
        ],
    )
    .map_err(|source| GitScanError::CommandFailed(source.to_string()))?;

    if !output.status.success() {
        return Err(GitScanError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let mut refs = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let parts = line.splitn(4, GIT_FIELD_SEPARATOR).collect::<Vec<_>>();
            if parts.len() != 4 {
                return None;
            }

            let full_name = parts[0].trim();
            let name = parts[1].trim();
            if full_name.is_empty()
                || name.is_empty()
                || full_name.ends_with("/HEAD")
                || name.ends_with("/HEAD")
                || name.contains(" -> ")
            {
                return None;
            }

            let kind = if full_name.starts_with("refs/heads/") {
                GitRefKind::Local
            } else if full_name.starts_with("refs/remotes/") {
                GitRefKind::Remote
            } else {
                return None;
            };
            let head_marker = parts[3].trim();
            let is_current = matches!(kind, GitRefKind::Local)
                && (head_marker == "*" || current_branch.as_deref() == Some(name));

            Some(GitRef {
                project_id: project_id.to_string(),
                name: name.to_string(),
                full_name: full_name.to_string(),
                kind,
                is_current,
                is_head: head_marker == "*",
                last_seen_commit: normalize(parts[2]),
                last_scanned_at: scanned_at.to_string(),
            })
        })
        .collect::<Vec<_>>();

    refs.sort_by(|left, right| {
        ref_kind_rank(&left.kind)
            .cmp(&ref_kind_rank(&right.kind))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(refs)
}

fn run_git_log(
    repo_path: &str,
    rev: &str,
    from: Option<&str>,
    to: Option<&str>,
    author_email: Option<&str>,
) -> Result<String, GitScanError> {
    let mut args = vec![
        "log".to_string(),
        "--date=iso-strict".to_string(),
        format!(
            "--pretty=format:%H{fs}%an{fs}%ae{fs}%aI{fs}%B{rs}",
            fs = GIT_FIELD_SEPARATOR,
            rs = GIT_RECORD_SEPARATOR
        ),
    ];

    append_filters(&mut args, from, to, author_email);
    args.push(rev.to_string());

    let output = runner::run_git_owned(repo_path, &args)
        .map_err(|source| GitScanError::CommandFailed(source.to_string()))?;

    if !output.status.success() {
        return Err(GitScanError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn current_branch(repo_path: &str) -> Result<String, GitScanError> {
    let output = runner::run_git(repo_path, &["branch", "--show-current"])
        .map_err(|source| GitScanError::CommandFailed(source.to_string()))?;

    if !output.status.success() {
        return Err(GitScanError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn rev_parse(repo_path: &str, rev: &str) -> Result<String, GitScanError> {
    let output = runner::run_git(repo_path, &["rev-parse", rev])
        .map_err(|source| GitScanError::CommandFailed(source.to_string()))?;

    if !output.status.success() {
        return Err(GitScanError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn load_commit_stats(
    project_id: &str,
    repo_path: &str,
    rev: &str,
    from: Option<&str>,
    to: Option<&str>,
    author_email: Option<&str>,
    collected_at: &str,
    only_hashes: Option<&HashSet<String>>,
) -> Result<std::collections::HashMap<String, CommitStats>, GitScanError> {
    let mut args = vec![
        "log".to_string(),
        "--numstat".to_string(),
        format!("--pretty=format:{rs}%H", rs = GIT_RECORD_SEPARATOR),
    ];

    append_filters(&mut args, from, to, author_email);
    args.push(rev.to_string());

    let output = runner::run_git_owned(repo_path, &args)
        .map_err(|source| GitScanError::CommandFailed(source.to_string()))?;
    if !output.status.success() {
        return Err(GitScanError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let mut map = std::collections::HashMap::new();
    for block in String::from_utf8_lossy(&output.stdout).split(GIT_RECORD_SEPARATOR) {
        let trimmed = block.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut lines = trimmed.lines();
        let Some(hash) = lines.next().map(str::trim) else {
            continue;
        };
        if !is_full_commit_hash(hash) {
            continue;
        }
        if only_hashes.is_some_and(|hashes| !hashes.contains(hash)) {
            continue;
        }
        let mut stats = CommitStats {
            files_changed: 0,
            insertions: 0,
            deletions: 0,
            file_changes: Vec::new(),
        };
        for line in lines {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 3 {
                continue;
            }
            let path = parts[2..].join(" ");
            let is_binary = parts[0] == "-" || parts[1] == "-";
            let additions = if is_binary {
                0
            } else {
                parts[0].parse::<i64>().unwrap_or_default()
            };
            let deletions = if is_binary {
                0
            } else {
                parts[1].parse::<i64>().unwrap_or_default()
            };
            stats.files_changed += 1;
            stats.insertions += additions;
            stats.deletions += deletions;
            let normalized_path = normalize_git_path(&path);
            stats.file_changes.push(CommitFileChange {
                project_id: project_id.to_string(),
                commit_hash: hash.to_string(),
                path: normalized_path.clone(),
                old_path: None,
                change_kind: "modified".to_string(),
                additions,
                deletions,
                is_binary,
                language: language_for_path(&normalized_path),
                top_level_dir: top_level_dir(&normalized_path),
                is_test: is_test_path(&normalized_path),
                is_docs: is_docs_path(&normalized_path),
                is_config: is_config_path(&normalized_path),
                is_migration: is_migration_path(&normalized_path),
                is_generated: is_generated_path(&normalized_path),
                collected_at: collected_at.to_string(),
            });
        }
        map.insert(hash.to_string(), stats);
    }
    Ok(map)
}

fn collect_file_changes(stats_by_hash: &HashMap<String, CommitStats>) -> Vec<CommitFileChange> {
    let mut changes = stats_by_hash
        .values()
        .flat_map(|stats| stats.file_changes.iter().cloned())
        .filter(|change| is_full_commit_hash(&change.commit_hash))
        .collect::<Vec<_>>();
    changes.sort_by(|left, right| {
        left.commit_hash
            .cmp(&right.commit_hash)
            .then_with(|| left.path.cmp(&right.path))
    });
    changes.dedup_by(|left, right| {
        left.project_id == right.project_id
            && left.commit_hash == right.commit_hash
            && left.path == right.path
    });
    changes
}

fn collect_diff_snippets(
    repo_path: &str,
    project_id: &str,
    changes: &[CommitFileChange],
    collected_at: &str,
) -> Vec<CommitDiffSnippet> {
    let mut snippets = Vec::new();
    let mut per_commit_count: HashMap<&str, usize> = HashMap::new();
    for change in changes {
        if !is_full_commit_hash(&change.commit_hash) {
            continue;
        }
        if change.is_binary || change.is_generated || change.is_docs {
            continue;
        }
        let count = per_commit_count.entry(&change.commit_hash).or_default();
        if *count >= 8 {
            continue;
        }
        *count += 1;

        let Ok(output) = runner::run_git(
            repo_path,
            &[
                "show",
                "--format=",
                "--unified=3",
                "--no-ext-diff",
                &change.commit_hash,
                "--",
                &change.path,
            ],
        ) else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        let snippet = bounded_diff_text(&String::from_utf8_lossy(&output.stdout));
        if snippet.trim().is_empty() {
            continue;
        }
        snippets.push(CommitDiffSnippet {
            project_id: project_id.to_string(),
            commit_hash: change.commit_hash.clone(),
            path: change.path.clone(),
            snippet,
            collected_at: collected_at.to_string(),
        });
    }
    snippets
}

fn bounded_diff_text(diff: &str) -> String {
    diff.lines()
        .filter(|line| {
            line.starts_with("@@")
                || line.starts_with('+')
                || line.starts_with('-')
                || line.starts_with("diff --git")
        })
        .filter(|line| !line.starts_with("+++") && !line.starts_with("---"))
        .take(80)
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(4_000)
        .collect()
}

fn is_full_commit_hash(value: &str) -> bool {
    value.len() == 40 && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn normalize_git_path(path: &str) -> String {
    path.trim()
        .trim_matches('"')
        .replace('\\', "/")
        .split(" => ")
        .last()
        .unwrap_or(path)
        .trim_matches('{')
        .trim_matches('}')
        .to_string()
}

fn top_level_dir(path: &str) -> Option<String> {
    path.split('/')
        .next()
        .filter(|segment| !segment.trim().is_empty())
        .map(|segment| segment.to_lowercase())
}

fn language_for_path(path: &str) -> Option<String> {
    let extension = Path::new(path)
        .extension()?
        .to_string_lossy()
        .to_lowercase();
    let language = match extension.as_str() {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" => "javascript",
        "css" | "scss" => "css",
        "html" => "html",
        "sql" => "sql",
        "md" | "mdx" => "markdown",
        "json" | "toml" | "yaml" | "yml" => "config",
        "cs" => "csharp",
        "php" => "php",
        "py" => "python",
        _ => extension.as_str(),
    };
    Some(language.to_string())
}

fn is_test_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("test")
        || lower.contains("spec")
        || lower.contains("__tests__")
        || lower.contains("/tests/")
}

fn is_docs_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".md") || lower.starts_with("docs/") || lower.contains("/docs/")
}

fn is_config_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".json")
        || lower.ends_with(".toml")
        || lower.ends_with(".yml")
        || lower.ends_with(".yaml")
        || lower.contains("config")
        || lower.contains("package-lock")
}

fn is_migration_path(path: &str) -> bool {
    path.to_lowercase().contains("migration")
}

fn is_generated_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("node_modules/")
        || lower.contains("/vendor/")
        || lower.contains("/dist/")
        || lower.contains("/target/")
        || lower.ends_with("package-lock.json")
        || lower.ends_with("pnpm-lock.yaml")
        || lower.ends_with("cargo.lock")
}

fn discover_worktrees(
    project_id: &str,
    repo_path: &str,
    scanned_at: &str,
    check_clean: bool,
) -> Result<Vec<GitWorktree>, GitScanError> {
    let output = runner::run_git(repo_path, &["worktree", "list", "--porcelain"])
        .map_err(|source| GitScanError::CommandFailed(source.to_string()))?;

    if !output.status.success() {
        return Err(GitScanError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let mut worktrees = Vec::new();
    let mut path: Option<String> = None;
    let mut head: Option<String> = None;
    let mut branch: Option<String> = None;
    let mut is_prunable = false;
    let mut is_locked = false;

    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if let Some(worktree_path) = path.take() {
                worktrees.push(GitWorktree {
                    project_id: project_id.to_string(),
                    is_clean: if check_clean {
                        worktree_clean(&worktree_path).ok()
                    } else {
                        None
                    },
                    path: worktree_path,
                    branch: branch.take(),
                    head_commit: head.take(),
                    is_prunable,
                    is_locked,
                    last_scanned_at: scanned_at.to_string(),
                });
            }
            is_prunable = false;
            is_locked = false;
            continue;
        }

        if let Some(value) = trimmed.strip_prefix("worktree ") {
            path = Some(value.to_string());
        } else if let Some(value) = trimmed.strip_prefix("HEAD ") {
            head = normalize(value);
        } else if let Some(value) = trimmed.strip_prefix("branch ") {
            branch = Some(short_ref_name(value));
        } else if trimmed.starts_with("prunable") {
            is_prunable = true;
        } else if trimmed.starts_with("locked") {
            is_locked = true;
        }
    }

    if let Some(worktree_path) = path.take() {
        worktrees.push(GitWorktree {
            project_id: project_id.to_string(),
            is_clean: if check_clean {
                worktree_clean(&worktree_path).ok()
            } else {
                None
            },
            path: worktree_path,
            branch,
            head_commit: head,
            is_prunable,
            is_locked,
            last_scanned_at: scanned_at.to_string(),
        });
    }

    Ok(worktrees)
}

fn scan_worktree_commits(
    project_id: &str,
    worktrees: &[GitWorktree],
    from: Option<&str>,
    to: Option<&str>,
    author_email: Option<&str>,
    commits_by_hash: &mut HashMap<String, ParsedGitCommit>,
    stats_by_hash: &mut HashMap<String, CommitStats>,
    options: &GitScanOptions,
) -> Result<Vec<CommitWorktreeRef>, GitScanError> {
    let mut commit_refs = Vec::new();

    for worktree in worktrees {
        let revision = worktree
            .branch
            .as_deref()
            .filter(|branch| !branch.trim().is_empty())
            .unwrap_or("HEAD");
        let stdout = run_git_log(&worktree.path, revision, from, to, author_email)?;
        for parsed in parse_git_log(&stdout) {
            commit_refs.push(CommitWorktreeRef {
                project_id: project_id.to_string(),
                commit_hash: parsed.commit_hash.clone(),
                worktree_path: worktree.path.clone(),
                branch: worktree.branch.clone(),
            });
            commits_by_hash
                .entry(parsed.commit_hash.clone())
                .or_insert(parsed);
        }

        if options.collect_evidence {
            let collected_at = Utc::now().to_rfc3339();
            for (hash, stats) in load_commit_stats(
                project_id,
                &worktree.path,
                revision,
                from,
                to,
                author_email,
                &collected_at,
                options.evidence_commit_hashes.as_ref(),
            )? {
                stats_by_hash.entry(hash).or_insert(stats);
            }
        }
    }

    commit_refs.sort_by(|left, right| {
        left.commit_hash
            .cmp(&right.commit_hash)
            .then_with(|| left.worktree_path.cmp(&right.worktree_path))
    });
    commit_refs.dedup_by(|left, right| {
        left.commit_hash == right.commit_hash && left.worktree_path == right.worktree_path
    });

    Ok(commit_refs)
}

fn worktree_clean(path: &str) -> Result<bool, GitScanError> {
    let output = runner::run_git(path, &["status", "--porcelain"])
        .map_err(|source| GitScanError::CommandFailed(source.to_string()))?;

    if !output.status.success() {
        return Err(GitScanError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().is_empty())
}

fn append_filters(
    args: &mut Vec<String>,
    from: Option<&str>,
    to: Option<&str>,
    author_email: Option<&str>,
) {
    if let Some(from) = from.filter(|value| !value.trim().is_empty()) {
        args.push(format!("--since={from} 00:00:00"));
    }
    if let Some(to) = to.filter(|value| !value.trim().is_empty()) {
        args.push(format!("--until={to} 23:59:59"));
    }
    if let Some(author_email) = author_email.filter(|value| !value.trim().is_empty()) {
        args.push(format!("--author={author_email}"));
    }
}

fn preferred_branch(
    commit_hash: &str,
    refs_by_commit: &HashMap<String, Vec<CommitRef>>,
    refs: &[GitRef],
) -> Option<String> {
    let memberships = refs_by_commit.get(commit_hash)?;
    refs.iter()
        .find(|git_ref| {
            git_ref.is_current
                && memberships.iter().any(|membership| {
                    membership.ref_name == git_ref.name && membership.ref_kind == git_ref.kind
                })
        })
        .or_else(|| {
            refs.iter().find(|git_ref| {
                matches!(git_ref.kind, GitRefKind::Local)
                    && memberships.iter().any(|membership| {
                        membership.ref_name == git_ref.name && membership.ref_kind == git_ref.kind
                    })
            })
        })
        .or_else(|| {
            refs.iter().find(|git_ref| {
                memberships.iter().any(|membership| {
                    membership.ref_name == git_ref.name && membership.ref_kind == git_ref.kind
                })
            })
        })
        .map(|git_ref| git_ref.name.clone())
}

fn short_ref_name(value: &str) -> String {
    value
        .strip_prefix("refs/heads/")
        .or_else(|| value.strip_prefix("refs/remotes/"))
        .unwrap_or(value)
        .to_string()
}

fn normalize(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn ref_kind_rank(kind: &GitRefKind) -> u8 {
    match kind {
        GitRefKind::Local => 0,
        GitRefKind::Remote => 1,
    }
}

fn ref_fingerprint(refs: &[GitRef], worktrees: &[GitWorktree]) -> String {
    let mut parts = refs
        .iter()
        .map(|git_ref| {
            format!(
                "ref:{}:{}:{}",
                git_ref.kind.as_storage_value(),
                git_ref.full_name,
                git_ref.last_seen_commit.as_deref().unwrap_or("")
            )
        })
        .chain(worktrees.iter().map(|worktree| {
            format!(
                "worktree:{}:{}",
                worktree.branch.as_deref().unwrap_or(""),
                worktree.head_commit.as_deref().unwrap_or("")
            )
        }))
        .collect::<Vec<_>>();
    parts.sort();
    parts.join("|")
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{GitScanOptions, GitScanner};

    #[test]
    fn scanner_reads_real_git_commit_with_stats() {
        let repo_path = create_temp_repo_path();
        fs::create_dir_all(&repo_path).expect("create temp repo");
        run_git(&repo_path, &["init"]);
        run_git(&repo_path, &["config", "user.name", "WorkTrace Tester"]);
        run_git(
            &repo_path,
            &["config", "user.email", "tester@worktrace.local"],
        );

        fs::write(repo_path.join("activity.txt"), "first line\nsecond line\n")
            .expect("write commit file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &["commit", "-m", "feat: verify git scanner"],
            "2026-05-20T10:00:00+00:00",
        );

        let scan = GitScanner::scan(
            "project_test",
            repo_path.to_str().expect("repo path string"),
            Some("2026-05-19"),
            Some("2026-05-21"),
            Some("tester@worktrace.local"),
        )
        .expect("scan commits");
        let commits = scan.commits;

        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].message, "feat: verify git scanner");
        assert_eq!(commits[0].files_changed, Some(1));
        assert_eq!(commits[0].insertions, Some(2));
        assert_eq!(scan.file_changes.len(), 1);
        assert_eq!(scan.file_changes[0].commit_hash, commits[0].commit_hash);
        assert_eq!(scan.file_changes[0].path, "activity.txt");

        fs::remove_dir_all(repo_path).ok();
    }

    #[test]
    fn scanner_can_skip_expensive_evidence_collection() {
        let repo_path = create_temp_repo_path();
        fs::create_dir_all(&repo_path).expect("create temp repo");
        run_git(&repo_path, &["init"]);
        run_git(&repo_path, &["config", "user.name", "WorkTrace Tester"]);
        run_git(
            &repo_path,
            &["config", "user.email", "tester@worktrace.local"],
        );

        fs::write(repo_path.join("activity.txt"), "first line\nsecond line\n")
            .expect("write commit file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &["commit", "-m", "feat: cheap scan"],
            "2026-05-20T10:00:00+00:00",
        );

        let scan = GitScanner::scan_with_options(
            "project_test",
            repo_path.to_str().expect("repo path string"),
            Some("2026-05-19"),
            Some("2026-05-21"),
            Some("tester@worktrace.local"),
            GitScanOptions {
                collect_evidence: false,
                evidence_commit_hashes: None,
                check_worktree_clean: false,
                revision_sources: None,
            },
        )
        .expect("scan commits");

        assert_eq!(scan.commits.len(), 1);
        assert!(scan.file_changes.is_empty());
        assert!(scan.diff_snippets.is_empty());
        assert_eq!(scan.commits[0].files_changed, None);

        fs::remove_dir_all(repo_path).ok();
    }

    #[test]
    fn scanner_keys_multiple_numstat_blocks_by_real_commit_hashes() {
        let repo_path = create_temp_repo_path();
        fs::create_dir_all(&repo_path).expect("create temp repo");
        run_git(&repo_path, &["init"]);
        run_git(&repo_path, &["config", "user.name", "WorkTrace Tester"]);
        run_git(
            &repo_path,
            &["config", "user.email", "tester@worktrace.local"],
        );

        fs::write(repo_path.join("first.txt"), "first\n").expect("write first file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &["commit", "-m", "feat: first grouped evidence"],
            "2026-05-20T10:00:00+00:00",
        );
        fs::write(repo_path.join("second.txt"), "second\n").expect("write second file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &["commit", "-m", "feat: second grouped evidence"],
            "2026-05-20T10:10:00+00:00",
        );

        let scan = GitScanner::scan(
            "project_test",
            repo_path.to_str().expect("repo path string"),
            Some("2026-05-19"),
            Some("2026-05-21"),
            Some("tester@worktrace.local"),
        )
        .expect("scan commits");

        assert_eq!(scan.commits.len(), 2);
        assert_eq!(scan.file_changes.len(), 2);
        for change in &scan.file_changes {
            assert_eq!(change.commit_hash.len(), 40);
            assert!(change
                .commit_hash
                .chars()
                .all(|character| character.is_ascii_hexdigit()));
            assert!(!change.commit_hash.contains('\t'));
        }

        fs::remove_dir_all(repo_path).ok();
    }

    #[test]
    fn scanner_includes_commits_on_selected_end_date() {
        let repo_path = create_temp_repo_path();
        fs::create_dir_all(&repo_path).expect("create temp repo");
        run_git(&repo_path, &["init"]);
        run_git(&repo_path, &["config", "user.name", "WorkTrace Tester"]);
        run_git(
            &repo_path,
            &["config", "user.email", "tester@worktrace.local"],
        );

        fs::write(repo_path.join("friday.txt"), "work shipped\n").expect("write commit file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &["commit", "-m", "feat: end date visibility"],
            "2026-05-22T10:00:00+00:00",
        );

        let scan = GitScanner::scan(
            "project_test",
            repo_path.to_str().expect("repo path string"),
            Some("2026-05-18"),
            Some("2026-05-22"),
            Some("tester@worktrace.local"),
        )
        .expect("scan commits");
        let commits = scan.commits;

        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].message, "feat: end date visibility");

        fs::remove_dir_all(repo_path).ok();
    }

    #[test]
    fn scanner_captures_multiline_commit_body() {
        let repo_path = create_temp_repo_path();
        fs::create_dir_all(&repo_path).expect("create temp repo");
        run_git(&repo_path, &["init"]);
        run_git(&repo_path, &["config", "user.name", "WorkTrace Tester"]);
        run_git(
            &repo_path,
            &["config", "user.email", "tester@worktrace.local"],
        );

        fs::write(repo_path.join("multi.txt"), "content\n").expect("write commit file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &[
                "commit",
                "-m",
                "feat: add multi-line commit",
                "-m",
                "- Updated file A\n- Updated file B\n- Added tests",
            ],
            "2026-05-20T12:00:00+00:00",
        );

        let scan = GitScanner::scan(
            "project_test",
            repo_path.to_str().expect("repo path string"),
            Some("2026-05-19"),
            Some("2026-05-21"),
            Some("tester@worktrace.local"),
        )
        .expect("scan commits");
        let commits = scan.commits;

        assert_eq!(commits.len(), 1);
        assert!(commits[0].message.contains("feat: add multi-line commit"));
        assert!(commits[0].message.contains("- Updated file A"));
        assert!(commits[0].message.contains("- Updated file B"));
        assert!(commits[0].message.contains("- Added tests"));

        fs::remove_dir_all(repo_path).ok();
    }

    #[test]
    fn scanner_tracks_commit_membership_across_branches() {
        let repo_path = create_temp_repo_path();
        fs::create_dir_all(&repo_path).expect("create temp repo");
        run_git(&repo_path, &["init"]);
        run_git(&repo_path, &["checkout", "-b", "main"]);
        run_git(&repo_path, &["config", "user.name", "WorkTrace Tester"]);
        run_git(
            &repo_path,
            &["config", "user.email", "tester@worktrace.local"],
        );

        fs::write(repo_path.join("base.txt"), "base\n").expect("write base file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &["commit", "-m", "feat: shared base"],
            "2026-05-20T10:00:00+00:00",
        );
        let base_hash = git_stdout(&repo_path, &["rev-parse", "HEAD"]);

        run_git(&repo_path, &["checkout", "-b", "feature/context"]);
        fs::write(repo_path.join("feature.txt"), "feature\n").expect("write feature file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &["commit", "-m", "feat: feature branch"],
            "2026-05-20T11:00:00+00:00",
        );
        let feature_hash = git_stdout(&repo_path, &["rev-parse", "HEAD"]);

        let scan = GitScanner::scan(
            "project_test",
            repo_path.to_str().expect("repo path string"),
            Some("2026-05-19"),
            Some("2026-05-21"),
            Some("tester@worktrace.local"),
        )
        .expect("scan commits");

        assert_eq!(scan.commits.len(), 2);
        let base_refs = scan
            .commit_refs
            .iter()
            .filter(|commit_ref| commit_ref.commit_hash == base_hash)
            .map(|commit_ref| commit_ref.ref_name.as_str())
            .collect::<Vec<_>>();
        assert!(base_refs.contains(&"main"));
        assert!(base_refs.contains(&"feature/context"));

        let feature_refs = scan
            .commit_refs
            .iter()
            .filter(|commit_ref| commit_ref.commit_hash == feature_hash)
            .map(|commit_ref| commit_ref.ref_name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(feature_refs, vec!["feature/context"]);

        fs::remove_dir_all(repo_path).ok();
    }

    #[test]
    fn scanner_discovers_worktrees_for_repository() {
        let repo_path = create_temp_repo_path();
        let worktree_path = repo_path.with_extension("feature-worktree");
        fs::create_dir_all(&repo_path).expect("create temp repo");
        run_git(&repo_path, &["init"]);
        run_git(&repo_path, &["checkout", "-b", "main"]);
        run_git(&repo_path, &["config", "user.name", "WorkTrace Tester"]);
        run_git(
            &repo_path,
            &["config", "user.email", "tester@worktrace.local"],
        );

        fs::write(repo_path.join("main.txt"), "main\n").expect("write main file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &["commit", "-m", "feat: main worktree"],
            "2026-05-20T10:00:00+00:00",
        );
        let main_hash = git_stdout(&repo_path, &["rev-parse", "HEAD"]);
        run_git(&repo_path, &["checkout", "-b", "feature/worktree"]);
        fs::write(repo_path.join("feature.txt"), "feature\n").expect("write feature file");
        run_git(&repo_path, &["add", "."]);
        run_git_with_dates(
            &repo_path,
            &["commit", "-m", "feat: worktree branch"],
            "2026-05-20T11:00:00+00:00",
        );
        let feature_hash = git_stdout(&repo_path, &["rev-parse", "HEAD"]);
        run_git(&repo_path, &["checkout", "main"]);
        run_git(
            &repo_path,
            &[
                "worktree",
                "add",
                worktree_path.to_str().expect("worktree path"),
                "feature/worktree",
            ],
        );

        let scan = GitScanner::scan(
            "project_test",
            repo_path.to_str().expect("repo path string"),
            Some("2026-05-19"),
            Some("2026-05-21"),
            Some("tester@worktrace.local"),
        )
        .expect("scan commits");

        assert!(scan
            .worktrees
            .iter()
            .any(|worktree| worktree.branch.as_deref() == Some("main")));
        assert!(scan
            .worktrees
            .iter()
            .any(|worktree| worktree.branch.as_deref() == Some("feature/worktree")));
        assert!(scan.commit_worktree_refs.iter().any(|commit_ref| {
            commit_ref.commit_hash == main_hash && commit_ref.branch.as_deref() == Some("main")
        }));
        assert!(scan.commit_worktree_refs.iter().any(|commit_ref| {
            commit_ref.commit_hash == feature_hash
                && commit_ref.branch.as_deref() == Some("feature/worktree")
        }));

        run_git(
            &repo_path,
            &[
                "worktree",
                "remove",
                "--force",
                worktree_path.to_str().expect("worktree path"),
            ],
        );
        fs::remove_dir_all(worktree_path).ok();
        fs::remove_dir_all(repo_path).ok();
    }

    fn create_temp_repo_path() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();

        std::env::temp_dir().join(format!("worktrace_git_scanner_test_{nanos}"))
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

    fn git_stdout(repo_path: &Path, args: &[&str]) -> String {
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

        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }
}
