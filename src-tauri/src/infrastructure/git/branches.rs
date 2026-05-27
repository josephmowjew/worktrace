use std::path::Path;

use serde::Serialize;

use crate::infrastructure::git::runner;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub kind: GitBranchKind,
    pub is_current: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitBranchKind {
    Local,
    Remote,
}

pub fn list_branches(repo_path: &str) -> Result<Vec<GitBranch>, GitBranchListError> {
    if !Path::new(repo_path).exists() {
        return Err(GitBranchListError::RepoNotFound(repo_path.to_string()));
    }

    let current_branch = run_git(repo_path, &["branch", "--show-current"])
        .ok()
        .map(|output| output.trim().to_string())
        .filter(|output| !output.is_empty());

    let mut branches = parse_branch_output(
        &run_git(repo_path, &["branch", "--list"])?,
        GitBranchKind::Local,
        current_branch.as_deref(),
    );

    if let Ok(output) = run_git(repo_path, &["branch", "--remotes"]) {
        branches.extend(parse_branch_output(
            &output,
            GitBranchKind::Remote,
            current_branch.as_deref(),
        ));
    }

    Ok(branches)
}

fn parse_branch_output(
    output: &str,
    kind: GitBranchKind,
    current_branch: Option<&str>,
) -> Vec<GitBranch> {
    output
        .lines()
        .filter_map(|line| parse_branch_line(line, kind.clone(), current_branch))
        .collect()
}

fn parse_branch_line(
    line: &str,
    kind: GitBranchKind,
    current_branch: Option<&str>,
) -> Option<GitBranch> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    let (is_marked_current, name) = if let Some(rest) = trimmed.strip_prefix('*') {
        (true, rest.trim())
    } else {
        (false, trimmed)
    };

    if name.contains(" -> ") || name.is_empty() {
        return None;
    }

    let is_current = match kind {
        GitBranchKind::Local => {
            is_marked_current || current_branch.is_some_and(|current| current == name)
        }
        GitBranchKind::Remote => false,
    };

    Some(GitBranch {
        name: name.to_string(),
        kind,
        is_current,
    })
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, GitBranchListError> {
    let output = runner::run_git(repo_path, args)
        .map_err(|source| GitBranchListError::CommandFailed(source.to_string()))?;

    if !output.status.success() {
        return Err(GitBranchListError::CommandFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[derive(Debug)]
pub enum GitBranchListError {
    RepoNotFound(String),
    CommandFailed(String),
}

impl std::fmt::Display for GitBranchListError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RepoNotFound(path) => write!(formatter, "repository path was not found: {path}"),
            Self::CommandFailed(message) => {
                write!(formatter, "git branch command failed: {message}")
            }
        }
    }
}

impl std::error::Error for GitBranchListError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_local_branches_and_current_marker() {
        let branches =
            parse_branch_output("  develop\n* main\n", GitBranchKind::Local, Some("main"));

        assert_eq!(
            branches,
            vec![
                GitBranch {
                    name: "develop".to_string(),
                    kind: GitBranchKind::Local,
                    is_current: false,
                },
                GitBranch {
                    name: "main".to_string(),
                    kind: GitBranchKind::Local,
                    is_current: true,
                },
            ]
        );
    }

    #[test]
    fn excludes_symbolic_remote_head_refs() {
        let branches = parse_branch_output(
            "  origin/HEAD -> origin/main\n  origin/main\n  origin/release\n",
            GitBranchKind::Remote,
            Some("main"),
        );

        assert_eq!(branches.len(), 2);
        assert_eq!(branches[0].name, "origin/main");
        assert_eq!(branches[1].name, "origin/release");
        assert!(branches.iter().all(|branch| !branch.is_current));
    }
}
