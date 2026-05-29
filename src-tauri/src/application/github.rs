use std::path::Path;

use chrono::Utc;
use keyring::Entry;
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use serde_json::json;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tempfile::Builder;

use crate::domain::github::{
    CompleteGitHubDeviceAuthInput, CompleteGitHubDeviceAuthOutput, ConnectGitHubPatInput,
    CreateGitHubPullRequestInput, CreateGitHubPullRequestOutput, GitHubAccountRecord,
    GitHubIntegrationStatus, GitHubIssueRecord, GitHubPullRequestRecord,
    StartGitHubDeviceAuthOutput, SyncGitHubProjectActivityInput, SyncGitHubProjectActivityOutput,
};
use crate::domain::settings::UpdateSettingsInput;
use crate::infrastructure::database::repositories::{
    GitHubRepository, ProjectRepository, SettingsRepository,
};
use crate::infrastructure::git::runner;

const KEYRING_SERVICE: &str = "WorkTrace";
const PAT_KEYRING_USER: &str = "github_pat";
const OAUTH_KEYRING_USER: &str = "github_oauth_access_token";
const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_SCOPE: &str = "repo read:user";
const BUNDLED_GITHUB_CLIENT_ID: &str = "WORKTRACE_GITHUB_CLIENT_ID_REQUIRED";

pub struct GitHubService;

impl GitHubService {
    pub async fn status(
        settings_repository: &SettingsRepository<'_>,
        github_repository: &GitHubRepository<'_>,
    ) -> Result<GitHubIntegrationStatus, GitHubServiceError> {
        if let Some(account) = github_repository
            .active_account()
            .await
            .map_err(GitHubServiceError::Database)?
        {
            return Ok(status_from_account(account, true));
        }

        let settings = settings_repository
            .get()
            .await
            .map_err(GitHubServiceError::Database)?;

        Ok(GitHubIntegrationStatus {
            connected: settings.github_connected,
            username: empty_to_none(settings.github_username),
            connected_at: empty_to_none(settings.github_connected_at),
            last_validated_at: empty_to_none(settings.github_last_validated_at),
            has_token: pat_token().is_ok(),
            auth_method: if settings.github_connected {
                Some("pat".to_string())
            } else {
                None
            },
            scopes: None,
            status: if settings.github_connected {
                Some("connected".to_string())
            } else {
                Some("disconnected".to_string())
            },
            last_synced_at: None,
            last_error: None,
        })
    }

    pub async fn start_device_auth(
        app: &AppHandle,
    ) -> Result<StartGitHubDeviceAuthOutput, GitHubServiceError> {
        let client_id = github_client_id()?;
        let response = github_client()
            .post(GITHUB_DEVICE_CODE_URL)
            .header("Accept", "application/json")
            .form(&[("client_id", client_id.as_str()), ("scope", GITHUB_SCOPE)])
            .send()
            .await
            .map_err(|error| GitHubServiceError::GitHub(error.to_string()))?;
        let body: GitHubDeviceCodeResponse =
            parse_github_response(response, "GitHub device authorization failed").await?;

        app.opener()
            .open_url(&body.verification_uri, None::<&str>)
            .map_err(|error| GitHubServiceError::GitHub(error.to_string()))?;

        Ok(StartGitHubDeviceAuthOutput {
            device_code: body.device_code,
            user_code: body.user_code,
            verification_uri: body.verification_uri,
            expires_in: body.expires_in,
            interval: body.interval.unwrap_or(5),
            client_id,
            scope: GITHUB_SCOPE.to_string(),
        })
    }

    pub async fn complete_device_auth(
        settings_repository: &SettingsRepository<'_>,
        github_repository: &GitHubRepository<'_>,
        input: CompleteGitHubDeviceAuthInput,
    ) -> Result<CompleteGitHubDeviceAuthOutput, GitHubServiceError> {
        if input.device_code.trim().is_empty() {
            return Err(GitHubServiceError::Validation(
                "GitHub device code is required".to_string(),
            ));
        }

        let client_id = github_client_id()?;
        let response = github_client()
            .post(GITHUB_ACCESS_TOKEN_URL)
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id.as_str()),
                ("device_code", input.device_code.trim()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|error| GitHubServiceError::GitHub(error.to_string()))?;

        if !response.status().is_success() {
            return Err(github_http_error(response, "GitHub device authorization failed").await);
        }

        let token = response
            .json::<GitHubDeviceTokenResponse>()
            .await
            .map_err(|error| GitHubServiceError::GitHub(error.to_string()))?;

        if let Some(error) = token.error.as_deref() {
            let (status, message, retry_after_seconds) = match error {
                "authorization_pending" => {
                    ("pending", "Waiting for GitHub authorization.", Some(5))
                }
                "slow_down" => (
                    "pending",
                    "GitHub asked WorkTrace to poll more slowly.",
                    Some(10),
                ),
                "expired_token" => (
                    "expired",
                    "GitHub authorization expired. Start sign-in again.",
                    None,
                ),
                "access_denied" => ("denied", "GitHub authorization was denied.", None),
                _ => (
                    "error",
                    token.error_description.as_deref().unwrap_or(error),
                    None,
                ),
            };
            return Ok(CompleteGitHubDeviceAuthOutput {
                status: status.to_string(),
                message: message.to_string(),
                retry_after_seconds,
                integration: None,
            });
        }

        let Some(access_token) = token.access_token.as_deref() else {
            return Ok(CompleteGitHubDeviceAuthOutput {
                status: "pending".to_string(),
                message: "Waiting for GitHub authorization.".to_string(),
                retry_after_seconds: Some(5),
                integration: None,
            });
        };

        let user = fetch_user(access_token).await?;
        set_secret(OAUTH_KEYRING_USER, access_token)?;
        let scopes = token.scope.or_else(|| Some(GITHUB_SCOPE.to_string()));
        let account = github_repository
            .upsert_account(
                Some(user.login.clone()),
                OAUTH_KEYRING_USER.to_string(),
                "oauth_device",
                scopes,
                "connected",
                None,
            )
            .await
            .map_err(GitHubServiceError::Database)?;
        persist_legacy_settings_connection(settings_repository, &user.login).await?;

        Ok(CompleteGitHubDeviceAuthOutput {
            status: "connected".to_string(),
            message: "GitHub connected.".to_string(),
            retry_after_seconds: None,
            integration: Some(status_from_account(account, true)),
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
        set_secret(PAT_KEYRING_USER, token)?;
        persist_legacy_settings_connection(settings_repository, &user.login).await?;

        Ok(GitHubIntegrationStatus {
            connected: true,
            username: Some(user.login),
            connected_at: Some(Utc::now().to_rfc3339()),
            last_validated_at: Some(Utc::now().to_rfc3339()),
            has_token: true,
            auth_method: Some("pat".to_string()),
            scopes: None,
            status: Some("connected".to_string()),
            last_synced_at: None,
            last_error: None,
        })
    }

    pub async fn test_connection(
        settings_repository: &SettingsRepository<'_>,
        github_repository: &GitHubRepository<'_>,
    ) -> Result<GitHubIntegrationStatus, GitHubServiceError> {
        let token = preferred_token(github_repository).await?;
        let user = fetch_user(&token).await?;
        persist_legacy_settings_connection(settings_repository, &user.login).await?;
        Self::status(settings_repository, github_repository).await
    }

    pub async fn disconnect(
        settings_repository: &SettingsRepository<'_>,
        github_repository: &GitHubRepository<'_>,
    ) -> Result<GitHubIntegrationStatus, GitHubServiceError> {
        delete_secret(PAT_KEYRING_USER);
        delete_secret(OAUTH_KEYRING_USER);
        github_repository
            .disconnect_accounts()
            .await
            .map_err(GitHubServiceError::Database)?;

        settings_repository
            .update(UpdateSettingsInput {
                github_connected: Some(false),
                github_username: Some(String::new()),
                github_connected_at: Some(String::new()),
                github_last_validated_at: Some(String::new()),
                ..Default::default()
            })
            .await
            .map_err(GitHubServiceError::Database)?;

        Self::status(settings_repository, github_repository).await
    }

    pub async fn sync_project_activity(
        project_repository: &ProjectRepository<'_>,
        github_repository: &GitHubRepository<'_>,
        input: SyncGitHubProjectActivityInput,
    ) -> Result<SyncGitHubProjectActivityOutput, GitHubServiceError> {
        let token = preferred_token(github_repository).await?;
        let projects = if let Some(project_id) = input.project_id.as_deref() {
            project_repository
                .find(project_id)
                .await
                .map_err(GitHubServiceError::Database)?
                .into_iter()
                .collect::<Vec<_>>()
        } else {
            project_repository
                .list_active()
                .await
                .map_err(GitHubServiceError::Database)?
        };

        let mut synced_projects = 0;
        let mut imported_pull_requests = 0;
        let mut imported_issues = 0;
        let mut updated_pull_requests = 0;
        let mut updated_issues = 0;
        let mut last_error = None;

        for project in projects {
            let Some(remote_url) = project
                .github_url
                .clone()
                .filter(|url| !url.trim().is_empty())
                .or_else(|| {
                    project.repo_path.as_deref().and_then(|repo_path| {
                        run_git(repo_path, &["remote", "get-url", "origin"]).ok()
                    })
                })
            else {
                continue;
            };
            let repo = match parse_github_repo(&remote_url) {
                Ok(repo) => repo,
                Err(error) => {
                    last_error = Some(error.to_string());
                    continue;
                }
            };

            match sync_single_project(&token, github_repository, &project.id, &repo).await {
                Ok(result) => {
                    synced_projects += 1;
                    imported_pull_requests += result.imported_pull_requests;
                    updated_pull_requests += result.updated_pull_requests;
                    imported_issues += result.imported_issues;
                    updated_issues += result.updated_issues;
                }
                Err(error) => {
                    let message = error.to_string();
                    github_repository
                        .update_sync_state(
                            &project.id,
                            &repo.owner,
                            &repo.repo,
                            None,
                            None,
                            Some(message.clone()),
                        )
                        .await
                        .map_err(GitHubServiceError::Database)?;
                    last_error = Some(message);
                }
            }
        }

        github_repository
            .mark_account_synced(last_error.clone())
            .await
            .map_err(GitHubServiceError::Database)?;

        Ok(SyncGitHubProjectActivityOutput {
            synced_projects,
            imported_pull_requests,
            imported_issues,
            updated_pull_requests,
            updated_issues,
            message: if let Some(error) = last_error {
                format!("GitHub sync finished with an error: {error}")
            } else {
                format!(
                    "Synced {synced_projects} GitHub project(s): {imported_pull_requests} new PRs, {imported_issues} new issues."
                )
            },
        })
    }

    pub async fn create_pull_request(
        project_repository: &ProjectRepository<'_>,
        github_repository: &GitHubRepository<'_>,
        input: CreateGitHubPullRequestInput,
    ) -> Result<CreateGitHubPullRequestOutput, GitHubServiceError> {
        let token = preferred_token(github_repository).await?;
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

async fn sync_single_project(
    token: &str,
    github_repository: &GitHubRepository<'_>,
    project_id: &str,
    repo: &GitHubRepo,
) -> Result<ProjectSyncCounts, GitHubServiceError> {
    let state = github_repository
        .sync_state(project_id)
        .await
        .map_err(GitHubServiceError::Database)?;
    let since_prs = state
        .as_ref()
        .and_then(|state| state.pull_requests_cursor.as_deref())
        .unwrap_or("1970-01-01T00:00:00Z");
    let since_issues = state
        .as_ref()
        .and_then(|state| state.issues_cursor.as_deref())
        .unwrap_or("1970-01-01T00:00:00Z");

    let repo_meta = fetch_repo(token, repo).await.ok();
    github_repository
        .upsert_project_repository(
            project_id,
            &repo.owner,
            &repo.repo,
            repo_meta
                .as_ref()
                .and_then(|meta| meta.default_branch.clone()),
            repo_meta.as_ref().and_then(|meta| meta.html_url.clone()),
            None,
        )
        .await
        .map_err(GitHubServiceError::Database)?;

    let prs = fetch_pull_requests(token, repo, since_prs).await?;
    let issues = fetch_issues(token, repo, since_issues).await?;
    let pr_records = prs
        .into_iter()
        .map(|item| map_pull_request(project_id, repo, item))
        .collect::<Vec<_>>();
    let issue_records = issues
        .into_iter()
        .filter(|item| item.pull_request.is_none())
        .map(|item| map_issue(project_id, repo, item))
        .collect::<Vec<_>>();
    let pull_requests_cursor = pr_records
        .iter()
        .map(|record| record.updated_at_remote.clone())
        .max();
    let issues_cursor = issue_records
        .iter()
        .map(|record| record.updated_at_remote.clone())
        .max();
    let (imported_pull_requests, updated_pull_requests) = github_repository
        .upsert_pull_requests(&pr_records)
        .await
        .map_err(GitHubServiceError::Database)?;
    let (imported_issues, updated_issues) = github_repository
        .upsert_issues(&issue_records)
        .await
        .map_err(GitHubServiceError::Database)?;

    github_repository
        .update_sync_state(
            project_id,
            &repo.owner,
            &repo.repo,
            pull_requests_cursor,
            issues_cursor,
            None,
        )
        .await
        .map_err(GitHubServiceError::Database)?;

    Ok(ProjectSyncCounts {
        imported_pull_requests,
        imported_issues,
        updated_pull_requests,
        updated_issues,
    })
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
        return Err(github_http_error(response, "GitHub PR creation failed").await);
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

    parse_github_response(response, "GitHub token validation failed").await
}

async fn fetch_repo(
    token: &str,
    repo: &GitHubRepo,
) -> Result<GitHubRepoResponse, GitHubServiceError> {
    let response = github_client()
        .get(format!(
            "https://api.github.com/repos/{}/{}",
            repo.owner, repo.repo
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| GitHubServiceError::GitHub(error.to_string()))?;
    parse_github_response(response, "GitHub repository lookup failed").await
}

async fn fetch_pull_requests(
    token: &str,
    repo: &GitHubRepo,
    since: &str,
) -> Result<Vec<GitHubPullRequestApiItem>, GitHubServiceError> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls?state=all&sort=updated&direction=desc&per_page=100",
        repo.owner, repo.repo
    );
    let mut items: Vec<GitHubPullRequestApiItem> =
        github_get_json(token, &url, "GitHub pull request sync failed").await?;
    items.retain(|item| item.updated_at.as_deref().unwrap_or("") >= since);
    Ok(items)
}

async fn fetch_issues(
    token: &str,
    repo: &GitHubRepo,
    since: &str,
) -> Result<Vec<GitHubIssueApiItem>, GitHubServiceError> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/issues?state=all&sort=updated&direction=desc&since={}&per_page=100",
        repo.owner,
        repo.repo,
        urlencoding::encode(since)
    );
    github_get_json(token, &url, "GitHub issue sync failed").await
}

async fn github_get_json<T: for<'de> Deserialize<'de>>(
    token: &str,
    url: &str,
    prefix: &str,
) -> Result<T, GitHubServiceError> {
    let response = github_client()
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| GitHubServiceError::GitHub(error.to_string()))?;
    parse_github_response(response, prefix).await
}

async fn parse_github_response<T: for<'de> Deserialize<'de>>(
    response: reqwest::Response,
    prefix: &str,
) -> Result<T, GitHubServiceError> {
    if !response.status().is_success() {
        return Err(github_http_error(response, prefix).await);
    }

    response
        .json()
        .await
        .map_err(|error| GitHubServiceError::GitHub(error.to_string()))
}

async fn github_http_error(response: reqwest::Response, prefix: &str) -> GitHubServiceError {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let message = if status == StatusCode::UNAUTHORIZED {
        format!("{prefix} with {status}. Reconnect GitHub.")
    } else if status == StatusCode::FORBIDDEN && body.contains("rate limit") {
        format!("{prefix} with {status}. GitHub rate limit was reached.")
    } else {
        format!("{prefix} with {status}: {body}")
    };
    GitHubServiceError::GitHub(message)
}

fn map_pull_request(
    project_id: &str,
    repo: &GitHubRepo,
    item: GitHubPullRequestApiItem,
) -> GitHubPullRequestRecord {
    let now = Utc::now().to_rfc3339();
    GitHubPullRequestRecord {
        id: crate::infrastructure::database::repositories::public_generate_id("github_pr"),
        project_id: project_id.to_string(),
        owner: repo.owner.clone(),
        repo: repo.repo.clone(),
        number: item.number,
        title: item
            .title
            .unwrap_or_else(|| format!("Pull request #{}", item.number)),
        body: item.body,
        state: item.state.unwrap_or_else(|| "open".to_string()),
        html_url: item.html_url,
        author: item.user.map(|user| user.login),
        head_ref: item.head.and_then(|head| head.ref_name),
        base_ref: item.base.and_then(|base| base.ref_name),
        draft: item.draft.unwrap_or(false),
        merged_at: item.merged_at,
        created_at_remote: item.created_at,
        updated_at_remote: item.updated_at.unwrap_or_else(|| now.clone()),
        closed_at: item.closed_at,
        labels_json: None,
        assignees_json: None,
        included_in_report: true,
        created_at: now.clone(),
        updated_at: now,
    }
}

fn map_issue(project_id: &str, repo: &GitHubRepo, item: GitHubIssueApiItem) -> GitHubIssueRecord {
    let now = Utc::now().to_rfc3339();
    GitHubIssueRecord {
        id: crate::infrastructure::database::repositories::public_generate_id("github_issue"),
        project_id: project_id.to_string(),
        owner: repo.owner.clone(),
        repo: repo.repo.clone(),
        number: item.number,
        title: item
            .title
            .unwrap_or_else(|| format!("Issue #{}", item.number)),
        body: item.body,
        state: item.state.unwrap_or_else(|| "open".to_string()),
        html_url: item.html_url,
        author: item.user.map(|user| user.login),
        created_at_remote: item.created_at,
        updated_at_remote: item.updated_at.unwrap_or_else(|| now.clone()),
        closed_at: item.closed_at,
        labels_json: serde_json::to_string(&item.labels).ok(),
        assignees_json: serde_json::to_string(&item.assignees).ok(),
        included_in_report: true,
        created_at: now.clone(),
        updated_at: now,
    }
}

fn github_client() -> Client {
    Client::builder()
        .user_agent("WorkTrace")
        .build()
        .expect("GitHub client")
}

fn github_client_id() -> Result<String, GitHubServiceError> {
    let value = std::env::var("WORKTRACE_GITHUB_CLIENT_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| BUNDLED_GITHUB_CLIENT_ID.to_string());
    if value == BUNDLED_GITHUB_CLIENT_ID {
        return Err(GitHubServiceError::Validation(
            "Set WORKTRACE_GITHUB_CLIENT_ID to the WorkTrace GitHub OAuth client id before using browser sign-in.".to_string(),
        ));
    }
    Ok(value)
}

async fn preferred_token(
    github_repository: &GitHubRepository<'_>,
) -> Result<String, GitHubServiceError> {
    if let Some(account) = github_repository
        .active_account()
        .await
        .map_err(GitHubServiceError::Database)?
    {
        if let Some(token_ref) = account.token_ref.as_deref() {
            return get_secret(token_ref);
        }
    }
    pat_token()
}

fn pat_token() -> Result<String, GitHubServiceError> {
    get_secret(PAT_KEYRING_USER)
        .map_err(|_| GitHubServiceError::Validation("GitHub is not connected.".to_string()))
}

fn get_secret(user: &str) -> Result<String, GitHubServiceError> {
    Entry::new(KEYRING_SERVICE, user)
        .map_err(|error| GitHubServiceError::SecretStorage(error.to_string()))?
        .get_password()
        .map_err(|error| GitHubServiceError::SecretStorage(error.to_string()))
}

fn set_secret(user: &str, token: &str) -> Result<(), GitHubServiceError> {
    Entry::new(KEYRING_SERVICE, user)
        .map_err(|error| GitHubServiceError::SecretStorage(error.to_string()))?
        .set_password(token)
        .map_err(|error| GitHubServiceError::SecretStorage(error.to_string()))
}

fn delete_secret(user: &str) {
    let _ = Entry::new(KEYRING_SERVICE, user).and_then(|entry| entry.delete_credential());
}

async fn persist_legacy_settings_connection(
    settings_repository: &SettingsRepository<'_>,
    username: &str,
) -> Result<(), GitHubServiceError> {
    let now = Utc::now().to_rfc3339();
    settings_repository
        .update(UpdateSettingsInput {
            github_connected: Some(true),
            github_username: Some(username.to_string()),
            github_connected_at: Some(now.clone()),
            github_last_validated_at: Some(now),
            ..Default::default()
        })
        .await
        .map_err(GitHubServiceError::Database)?;
    Ok(())
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

fn status_from_account(account: GitHubAccountRecord, has_token: bool) -> GitHubIntegrationStatus {
    GitHubIntegrationStatus {
        connected: account.status == "connected",
        username: account.username,
        connected_at: account.connected_at,
        last_validated_at: account.last_validated_at,
        has_token,
        auth_method: Some(account.auth_method),
        scopes: account.scopes,
        status: Some(account.status),
        last_synced_at: account.last_synced_at,
        last_error: account.last_error,
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

#[derive(Debug)]
struct ProjectSyncCounts {
    imported_pull_requests: i64,
    imported_issues: i64,
    updated_pull_requests: i64,
    updated_issues: i64,
}

#[derive(Debug, Deserialize)]
struct GitHubDeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: i64,
    interval: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct GitHubDeviceTokenResponse {
    access_token: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
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

#[derive(Debug, Deserialize)]
struct GitHubRepoResponse {
    default_branch: Option<String>,
    html_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubPullRequestApiItem {
    number: i64,
    title: Option<String>,
    body: Option<String>,
    state: Option<String>,
    html_url: Option<String>,
    user: Option<GitHubUserResponse>,
    head: Option<GitHubRefResponse>,
    base: Option<GitHubRefResponse>,
    draft: Option<bool>,
    merged_at: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    closed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubIssueApiItem {
    number: i64,
    title: Option<String>,
    body: Option<String>,
    state: Option<String>,
    html_url: Option<String>,
    user: Option<GitHubUserResponse>,
    created_at: Option<String>,
    updated_at: Option<String>,
    closed_at: Option<String>,
    #[serde(default)]
    labels: Vec<serde_json::Value>,
    #[serde(default)]
    assignees: Vec<serde_json::Value>,
    pull_request: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct GitHubRefResponse {
    #[serde(rename = "ref")]
    ref_name: Option<String>,
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
