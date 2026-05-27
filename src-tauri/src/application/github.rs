use std::path::Path;

use chrono::Utc;
use keyring::Entry;
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use tempfile::Builder;

use crate::domain::github::{
    ConnectGitHubPatInput, CreateGitHubPullRequestInput, CreateGitHubPullRequestOutput,
    GitHubIntegrationStatus,
};
use crate::domain::settings::UpdateSettingsInput;
use crate::infrastructure::database::repositories::{ProjectRepository, SettingsRepository};
use crate::infrastructure::git::runner;

const KEYRING_SERVICE: &str = "WorkTrace";
const KEYRING_USER: &str = "github_pat";

pub struct GitHubService;

impl GitHubService {
    pub async fn status(
        settings_repository: &SettingsRepository<'_>,
    ) -> Result<GitHubIntegrationStatus, GitHubServiceError> {
        let settings = settings_repository
            .get()
            .await
            .map_err(GitHubServiceError::Database)?;

        Ok(GitHubIntegrationStatus {
            connected: settings.github_connected,
            username: empty_to_none(settings.github_username),
            connected_at: empty_to_none(settings.github_connected_at),
            last_validated_at: empty_to_none(settings.github_last_validated_at),
            has_token: github_token().is_ok(),
        })
    }

    pub async fn connect_pat(
        settings_repository: &SettingsRepository<'_>,
        input: ConnectGitHubPatInput,
    ) -> Result<GitHubIntegrationStatus, GitHubServiceError> {
        let token = input.token.trim();
        if token.is_empty() {
            return Err(GitHubServiceError::Validation(
                "GitHub token is required".to_string(),
            ));
        }

        let user = fetch_user(token).await?;
        set_github_token(token)?;
        let now = Utc::now().to_rfc3339();

        settings_repository
            .update(UpdateSettingsInput {
                name: None,
                email: None,
                default_manager_name: None,
                git_author_email: None,
                default_report_template: None,
                working_days: None,
                daily_work_minutes: None,
                theme: None,
                backup_enabled: None,
                backup_schedule: None,
                backup_time: None,
                backup_day: None,
                backup_storage_mode: None,
                backup_storage_location: None,
                online_backup_status: None,
                online_backup_provider: None,
                github_connected: Some(true),
                github_username: Some(user.login),
                github_connected_at: Some(now.clone()),
                github_last_validated_at: Some(now),
                ..Default::default()
            })
            .await
            .map_err(GitHubServiceError::Database)?;

        Self::status(settings_repository).await
    }

    pub async fn test_connection(
        settings_repository: &SettingsRepository<'_>,
    ) -> Result<GitHubIntegrationStatus, GitHubServiceError> {
        let token = github_token()?;
        let user = fetch_user(&token).await?;
        let now = Utc::now().to_rfc3339();

        settings_repository
            .update(UpdateSettingsInput {
                name: None,
                email: None,
                default_manager_name: None,
                git_author_email: None,
                default_report_template: None,
                working_days: None,
                daily_work_minutes: None,
                theme: None,
                backup_enabled: None,
                backup_schedule: None,
                backup_time: None,
                backup_day: None,
                backup_storage_mode: None,
                backup_storage_location: None,
                online_backup_status: None,
                online_backup_provider: None,
                github_connected: Some(true),
                github_username: Some(user.login),
                github_connected_at: None,
                github_last_validated_at: Some(now),
                ..Default::default()
            })
            .await
            .map_err(GitHubServiceError::Database)?;

        Self::status(settings_repository).await
    }

    pub async fn disconnect(
        settings_repository: &SettingsRepository<'_>,
    ) -> Result<GitHubIntegrationStatus, GitHubServiceError> {
        delete_github_token().ok();

        settings_repository
            .update(UpdateSettingsInput {
                name: None,
                email: None,
                default_manager_name: None,
                git_author_email: None,
                default_report_template: None,
                working_days: None,
                daily_work_minutes: None,
                theme: None,
                backup_enabled: None,
                backup_schedule: None,
                backup_time: None,
                backup_day: None,
                backup_storage_mode: None,
                backup_storage_location: None,
                online_backup_status: None,
                online_backup_provider: None,
                github_connected: Some(false),
                github_username: Some(String::new()),
                github_connected_at: Some(String::new()),
                github_last_validated_at: Some(String::new()),
                ..Default::default()
            })
            .await
            .map_err(GitHubServiceError::Database)?;

        Self::status(settings_repository).await
    }

    pub async fn create_pull_request(
        project_repository: &ProjectRepository<'_>,
        input: CreateGitHubPullRequestInput,
    ) -> Result<CreateGitHubPullRequestOutput, GitHubServiceError> {
        let token = github_token()?;
        validate_pull_request_input(&input)?;

        let Some(project) = project_repository
            .find(&input.project_id)
            .await
            .map_err(GitHubServiceError::Database)?
        else {
            return Err(GitHubServiceError::Validation(
                "Project was not found".to_string(),
            ));
        };
        let Some(repo_path) = project.repo_path.filter(|path| !path.trim().is_empty()) else {
            return Err(GitHubServiceError::Validation(
                "This project has no local repository path configured.".to_string(),
            ));
        };

        if !Path::new(&repo_path).exists() {
            return Err(GitHubServiceError::Validation(
                "The configured repository path is unavailable.".to_string(),
            ));
        }
        if !run_git(&repo_path, &["status", "--porcelain"])?
            .trim()
            .is_empty()
        {
            return Err(GitHubServiceError::Validation(
                "The source repository must be clean before WorkTrace can create a PR.".to_string(),
            ));
        }

        let remote_url = match project.github_url.filter(|url| !url.trim().is_empty()) {
            Some(url) => url,
            None => run_git(&repo_path, &["remote", "get-url", "origin"])?,
        };
        let github_repo = parse_github_repo(remote_url.trim())?;
        let temp_dir = Builder::new()
            .prefix("worktrace-pr-")
            .tempdir()
            .map_err(|error| GitHubServiceError::Git(error.to_string()))?;
        let worktree_path = temp_dir.path().to_string_lossy().to_string();
        let base_branch = input.base_branch.trim().to_string();
        let new_branch = input.new_branch.trim().to_string();

        run_git(
            &repo_path,
            &[
                "worktree",
                "add",
                "-b",
                &new_branch,
                &worktree_path,
                &base_branch,
            ],
        )?;

        let result = create_pull_request_from_worktree(
            &token,
            &github_repo,
            &repo_path,
            &worktree_path,
            &input,
            &base_branch,
            &new_branch,
        )
        .await;

        let _ = run_git(
            &repo_path,
            &["worktree", "remove", "--force", &worktree_path],
        );

        result
    }
}

async fn create_pull_request_from_worktree(
    token: &str,
    github_repo: &GitHubRepo,
    source_repo_path: &str,
    worktree_path: &str,
    input: &CreateGitHubPullRequestInput,
    base_branch: &str,
    new_branch: &str,
) -> Result<CreateGitHubPullRequestOutput, GitHubServiceError> {
    for hash in &input.commit_hashes {
        run_git(worktree_path, &["cherry-pick", hash.trim()])?;
    }

    run_git(source_repo_path, &["push", "-u", "origin", new_branch]).map_err(|error| {
        GitHubServiceError::Git(format!(
            "{error}. WorkTrace uses your local Git credentials for pushing; confirm `git push` works for this repository."
        ))
    })?;

    let api_base_branch = normalize_api_base_branch(base_branch);
    let response = github_client()
        .post(format!(
            "https://api.github.com/repos/{}/{}/pulls",
            github_repo.owner, github_repo.repo
        ))
        .bearer_auth(token)
        .json(&json!({
            "title": input.title.trim(),
            "body": input.body,
            "head": new_branch,
            "base": api_base_branch,
            "draft": input.draft.unwrap_or(false),
        }))
        .send()
        .await
        .map_err(|error| GitHubServiceError::GitHub(error.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GitHubServiceError::GitHub(format!(
            "GitHub PR creation failed with {status}: {body}"
        )));
    }

    let created = response
        .json::<GitHubPullRequestResponse>()
        .await
        .map_err(|error| GitHubServiceError::GitHub(error.to_string()))?;

    Ok(CreateGitHubPullRequestOutput {
        number: created.number,
        url: created.html_url,
        head_branch: new_branch.to_string(),
        base_branch: api_base_branch,
        pushed_commit_count: input.commit_hashes.len(),
    })
}

fn validate_pull_request_input(
    input: &CreateGitHubPullRequestInput,
) -> Result<(), GitHubServiceError> {
    if input.project_id.trim().is_empty() {
        return Err(GitHubServiceError::Validation(
            "Project is required".to_string(),
        ));
    }
    if input.base_branch.trim().is_empty() {
        return Err(GitHubServiceError::Validation(
            "Base branch is required".to_string(),
        ));
    }
    if input.new_branch.trim().is_empty() {
        return Err(GitHubServiceError::Validation(
            "New branch is required".to_string(),
        ));
    }
    if input.title.trim().is_empty() {
        return Err(GitHubServiceError::Validation(
            "PR title is required".to_string(),
        ));
    }
    if input.commit_hashes.is_empty()
        || input
            .commit_hashes
            .iter()
            .any(|hash| hash.trim().is_empty())
    {
        return Err(GitHubServiceError::Validation(
            "Select at least one valid commit".to_string(),
        ));
    }

    Ok(())
}

async fn fetch_user(token: &str) -> Result<GitHubUserResponse, GitHubServiceError> {
    let response = github_client()
        .get("https://api.github.com/user")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| GitHubServiceError::GitHub(error.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GitHubServiceError::GitHub(format!(
            "GitHub token validation failed with {status}: {body}"
        )));
    }

    response
        .json::<GitHubUserResponse>()
        .await
        .map_err(|error| GitHubServiceError::GitHub(error.to_string()))
}

fn github_client() -> Client {
    Client::builder()
        .user_agent("WorkTrace")
        .build()
        .expect("GitHub client")
}

fn github_token() -> Result<String, GitHubServiceError> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| GitHubServiceError::SecretStorage(error.to_string()))?
        .get_password()
        .map_err(|_| GitHubServiceError::Validation("GitHub is not connected.".to_string()))
}

fn set_github_token(token: &str) -> Result<(), GitHubServiceError> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| GitHubServiceError::SecretStorage(error.to_string()))?
        .set_password(token)
        .map_err(|error| GitHubServiceError::SecretStorage(error.to_string()))
}

fn delete_github_token() -> Result<(), GitHubServiceError> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| GitHubServiceError::SecretStorage(error.to_string()))?
        .delete_credential()
        .map_err(|error| GitHubServiceError::SecretStorage(error.to_string()))
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, GitHubServiceError> {
    let output = runner::run_git(repo_path, args)
        .map_err(|source| GitHubServiceError::Git(source.to_string()))?;

    if !output.status.success() {
        return Err(GitHubServiceError::Git(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn parse_github_repo(value: &str) -> Result<GitHubRepo, GitHubServiceError> {
    let trimmed = value.trim().trim_end_matches(".git");
    let path = if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("http://github.com/") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        rest
    } else {
        return Err(GitHubServiceError::Validation(
            "Only github.com repository remotes are supported in this version.".to_string(),
        ));
    };

    let parts = path.split('/').collect::<Vec<_>>();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
        return Err(GitHubServiceError::Validation(
            "GitHub repository URL must include owner and repo.".to_string(),
        ));
    }

    Ok(GitHubRepo {
        owner: parts[0].to_string(),
        repo: parts[1].to_string(),
    })
}

fn normalize_api_base_branch(base_branch: &str) -> String {
    base_branch
        .strip_prefix("origin/")
        .unwrap_or(base_branch)
        .to_string()
}

fn empty_to_none(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

#[derive(Debug)]
pub enum GitHubServiceError {
    Validation(String),
    Database(sqlx::Error),
    Git(String),
    GitHub(String),
    SecretStorage(String),
}

impl std::fmt::Display for GitHubServiceError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(message) => write!(formatter, "{message}"),
            Self::Database(error) => write!(formatter, "{error}"),
            Self::Git(message) => write!(formatter, "Git command failed: {message}"),
            Self::GitHub(message) => write!(formatter, "GitHub request failed: {message}"),
            Self::SecretStorage(message) => write!(formatter, "Secret storage failed: {message}"),
        }
    }
}

#[derive(Debug)]
struct GitHubRepo {
    owner: String,
    repo: String,
}

#[derive(Debug, Deserialize)]
struct GitHubUserResponse {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GitHubPullRequestResponse {
    number: i64,
    html_url: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_github_urls() {
        let https = parse_github_repo("https://github.com/openai/worktrace.git").unwrap();
        assert_eq!(https.owner, "openai");
        assert_eq!(https.repo, "worktrace");

        let ssh = parse_github_repo("git@github.com:openai/worktrace.git").unwrap();
        assert_eq!(ssh.owner, "openai");
        assert_eq!(ssh.repo, "worktrace");
    }

    #[test]
    fn rejects_non_github_urls() {
        assert!(matches!(
            parse_github_repo("https://github.example.com/openai/worktrace"),
            Err(GitHubServiceError::Validation(_))
        ));
    }

    #[test]
    fn normalizes_origin_base_branch_for_api() {
        assert_eq!(normalize_api_base_branch("origin/main"), "main");
        assert_eq!(normalize_api_base_branch("release"), "release");
    }
}
