use std::path::Path;
use std::process::Command;

use crate::domain::commit::Commit;
use crate::infrastructure::git::parser::{parse_git_log, with_project, GIT_FIELD_SEPARATOR};

pub struct GitScanner;

impl GitScanner {
    pub fn scan(
        project_id: &str,
        repo_path: &str,
        from: Option<&str>,
        to: Option<&str>,
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
            "--date=iso-strict".to_string(),
            format!(
                "--pretty=format:%H{fs}%an{fs}%ae{fs}%aI{fs}%B{rs}",
                fs = GIT_FIELD_SEPARATOR,
                rs = '\u{1e}'
            ),
        ];

        if let Some(from) = from.filter(|value| !value.trim().is_empty()) {
            args.push(format!("--since={from} 00:00:00"));
        }

        if let Some(to) = to.filter(|value| !value.trim().is_empty()) {
            args.push(format!("--until={to} 23:59:59"));
        }

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

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::GitScanner;

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

        let commits = GitScanner::scan(
            "project_test",
            repo_path.to_str().expect("repo path string"),
            Some("2026-05-19"),
            Some("2026-05-21"),
            Some("tester@worktrace.local"),
        )
        .expect("scan commits");

        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].message, "feat: verify git scanner");
        assert_eq!(commits[0].files_changed, Some(1));
        assert_eq!(commits[0].insertions, Some(2));

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

        let commits = GitScanner::scan(
            "project_test",
            repo_path.to_str().expect("repo path string"),
            Some("2026-05-18"),
            Some("2026-05-22"),
            Some("tester@worktrace.local"),
        )
        .expect("scan commits");

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

        let commits = GitScanner::scan(
            "project_test",
            repo_path.to_str().expect("repo path string"),
            Some("2026-05-19"),
            Some("2026-05-21"),
            Some("tester@worktrace.local"),
        )
        .expect("scan commits");

        assert_eq!(commits.len(), 1);
        assert!(commits[0].message.contains("feat: add multi-line commit"));
        assert!(commits[0].message.contains("- Updated file A"));
        assert!(commits[0].message.contains("- Updated file B"));
        assert!(commits[0].message.contains("- Added tests"));

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
}
