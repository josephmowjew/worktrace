use std::path::Path;
use std::process::Command;

use crate::domain::commit::Commit;
use crate::infrastructure::git::parser::{parse_git_log, with_project, GIT_FIELD_SEPARATOR};

pub struct GitScanner;

impl GitScanner {
    pub fn scan(
        project_id: &str,
        repo_path: &str,
        from: &str,
        to: &str,
        author_email: Option<&str>,
    ) -> Result<Vec<Commit>, GitScanError> {
        if !Path::new(repo_path).exists() {
            return Err(GitScanError::RepoNotFound(repo_path.to_string()));
        }

        let branch = current_branch(repo_path).ok();
        let mut args = vec![
            "-C".to_string(),
            repo_path.to_string(),
            "log".to_string(),
            format!("--since={from}"),
            format!("--until={to}"),
            "--date=iso-strict".to_string(),
            format!(
                "--pretty=format:%H{separator}%an{separator}%ae{separator}%aI{separator}%s",
                separator = GIT_FIELD_SEPARATOR
            ),
        ];

        if let Some(author_email) = author_email.filter(|value| !value.trim().is_empty()) {
            args.push(format!("--author={author_email}"));
        }

        let output = Command::new("git")
            .args(args)
            .output()
            .map_err(|source| GitScanError::CommandFailed(source.to_string()))?;

        if !output.status.success() {
            return Err(GitScanError::CommandFailed(
                String::from_utf8_lossy(&output.stderr).trim().to_string(),
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut commits = parse_git_log(&stdout)
            .into_iter()
            .map(|parsed| with_project(parsed, project_id, branch.clone()))
            .collect::<Vec<_>>();

        for commit in &mut commits {
            if let Ok(stats) = commit_stats(repo_path, &commit.commit_hash) {
                commit.files_changed = Some(stats.files_changed);
                commit.insertions = Some(stats.insertions);
                commit.deletions = Some(stats.deletions);
            }
        }

        Ok(commits)
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
}

fn current_branch(repo_path: &str) -> Result<String, GitScanError> {
    let output = Command::new("git")
        .args(["-C", repo_path, "branch", "--show-current"])
        .output()
        .map_err(|source| GitScanError::CommandFailed(source.to_string()))?;

    if !output.status.success() {
        return Err(GitScanError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn commit_stats(repo_path: &str, commit_hash: &str) -> Result<CommitStats, GitScanError> {
    let output = Command::new("git")
        .args([
            "-C",
            repo_path,
            "show",
            "--numstat",
            "--format=",
            commit_hash,
        ])
        .output()
        .map_err(|source| GitScanError::CommandFailed(source.to_string()))?;

    if !output.status.success() {
        return Err(GitScanError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let mut stats = CommitStats {
        files_changed: 0,
        insertions: 0,
        deletions: 0,
    };

    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let parts = line.split_whitespace().collect::<Vec<_>>();
        if parts.len() < 3 {
            continue;
        }

        stats.files_changed += 1;
        stats.insertions += parts[0].parse::<i64>().unwrap_or_default();
        stats.deletions += parts[1].parse::<i64>().unwrap_or_default();
    }

    Ok(stats)
}
