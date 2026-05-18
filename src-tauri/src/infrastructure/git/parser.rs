use crate::domain::commit::Commit;

pub const GIT_FIELD_SEPARATOR: char = '\u{1f}';

pub struct ParsedGitCommit {
    pub commit_hash: String,
    pub author_name: Option<String>,
    pub author_email: Option<String>,
    pub committed_at: String,
    pub message: String,
}

pub fn parse_git_log(output: &str) -> Vec<ParsedGitCommit> {
    output
        .lines()
        .filter_map(|line| {
            let parts = line.split(GIT_FIELD_SEPARATOR).collect::<Vec<_>>();

            if parts.len() != 5 || parts[0].trim().is_empty() {
                return None;
            }

            Some(ParsedGitCommit {
                commit_hash: parts[0].trim().to_string(),
                author_name: normalize(parts[1]),
                author_email: normalize(parts[2]),
                committed_at: parts[3].trim().to_string(),
                message: parts[4].trim().to_string(),
            })
        })
        .collect()
}

pub fn with_project(parsed: ParsedGitCommit, project_id: &str, branch: Option<String>) -> Commit {
    Commit {
        id: format!("commit_{}_{}", project_id, parsed.commit_hash),
        project_id: project_id.to_string(),
        commit_hash: parsed.commit_hash,
        message: parsed.message,
        author_name: parsed.author_name,
        author_email: parsed.author_email,
        branch,
        committed_at: parsed.committed_at,
        files_changed: None,
        insertions: None,
        deletions: None,
        included_in_report: true,
    }
}

fn normalize(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
