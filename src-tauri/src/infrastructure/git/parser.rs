use crate::domain::commit::Commit;

pub const GIT_FIELD_SEPARATOR: char = '\u{1f}';
pub const GIT_RECORD_SEPARATOR: char = '\u{1e}';

pub struct ParsedGitCommit {
    pub commit_hash: String,
    pub author_name: Option<String>,
    pub author_email: Option<String>,
    pub committed_at: String,
    pub message: String,
}

pub fn parse_git_log(output: &str) -> Vec<ParsedGitCommit> {
    output
        .split(GIT_RECORD_SEPARATOR)
        .filter(|block| !block.trim().is_empty())
        .filter_map(|block| {
            let parts = block.splitn(5, GIT_FIELD_SEPARATOR).collect::<Vec<_>>();

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_single_commit_with_single_line_message() {
        let input = format!(
            "abc123{fs}Test User{fs}test@example.com{fs}2026-05-20T10:00:00+00:00{fs}feat: add feature{rs}",
            fs = GIT_FIELD_SEPARATOR,
            rs = GIT_RECORD_SEPARATOR
        );

        let commits = parse_git_log(&input);
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].commit_hash, "abc123");
        assert_eq!(commits[0].author_name, Some("Test User".to_string()));
        assert_eq!(commits[0].message, "feat: add feature");
    }

    #[test]
    fn parses_commit_with_multiline_body() {
        let body = "feat: add feature\n\n- Updated file A\n- Updated file B\n- Added tests";
        let input = format!(
            "abc123{fs}Test User{fs}test@example.com{fs}2026-05-20T10:00:00+00:00{fs}{body}{rs}",
            fs = GIT_FIELD_SEPARATOR,
            rs = GIT_RECORD_SEPARATOR
        );

        let commits = parse_git_log(&input);
        assert_eq!(commits.len(), 1);
        assert!(commits[0].message.contains("feat: add feature"));
        assert!(commits[0].message.contains("- Updated file A"));
        assert!(commits[0].message.contains("- Added tests"));
    }

    #[test]
    fn parses_multiple_commits() {
        let input = format!(
            "abc{fs}User A{fs}a@x.com{fs}2026-05-20T10:00:00+00:00{fs}feat: first{rs}\
             def{fs}User B{fs}b@x.com{fs}2026-05-20T11:00:00+00:00{fs}fix: second{rs}",
            fs = GIT_FIELD_SEPARATOR,
            rs = GIT_RECORD_SEPARATOR
        );

        let commits = parse_git_log(&input);
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].commit_hash, "abc");
        assert_eq!(commits[1].commit_hash, "def");
    }

    #[test]
    fn skips_empty_blocks() {
        let input = format!(
            "{rs}abc{fs}User{fs}u@x.com{fs}2026-05-20T10:00:00+00:00{fs}msg{rs}{rs}",
            fs = GIT_FIELD_SEPARATOR,
            rs = GIT_RECORD_SEPARATOR
        );

        let commits = parse_git_log(&input);
        assert_eq!(commits.len(), 1);
    }
}
