use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIntegrationStatus {
    pub connected: bool,
    pub username: Option<String>,
    pub account_id: Option<String>,
    pub connected_at: Option<String>,
    pub last_validated_at: Option<String>,
    pub has_token: bool,
    pub auth_method: Option<String>,
    pub scopes: Option<String>,
    pub status: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAccount {
    pub id: String,
    pub host: String,
    pub github_user_id: Option<i64>,
    pub username: Option<String>,
    pub token_ref: Option<String>,
    pub auth_method: String,
    pub scopes: Option<String>,
    pub status: String,
    pub connected_at: Option<String>,
    pub last_validated_at: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
    pub has_token: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAccountsStatus {
    pub connected: bool,
    pub accounts: Vec<GitHubAccount>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectGitHubPatInput {
    pub token: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartGitHubDeviceAuthOutput {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: i64,
    pub interval: i64,
    pub client_id: String,
    pub scope: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteGitHubDeviceAuthInput {
    pub device_code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteGitHubDeviceAuthOutput {
    pub status: String,
    pub message: String,
    pub retry_after_seconds: Option<i64>,
    pub integration: Option<GitHubIntegrationStatus>,
    pub account: Option<GitHubAccount>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncGitHubProjectActivityInput {
    pub project_id: Option<String>,
    pub account_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncGitHubProjectActivityOutput {
    pub synced_projects: i64,
    pub imported_pull_requests: i64,
    pub imported_issues: i64,
    pub updated_pull_requests: i64,
    pub updated_issues: i64,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct GitHubAccountRecord {
    pub id: String,
    pub host: String,
    pub github_user_id: Option<i64>,
    pub username: Option<String>,
    pub token_ref: Option<String>,
    pub auth_method: String,
    pub scopes: Option<String>,
    pub status: String,
    pub connected_at: Option<String>,
    pub last_validated_at: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct GitHubProjectRepositoryRecord {
    pub id: String,
    pub account_id: String,
    pub project_id: String,
    pub owner: String,
    pub repo: String,
    pub default_branch: Option<String>,
    pub html_url: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct GitHubPullRequestRecord {
    pub id: String,
    pub account_id: String,
    pub project_id: String,
    pub owner: String,
    pub repo: String,
    pub number: i64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: Option<String>,
    pub author: Option<String>,
    pub head_ref: Option<String>,
    pub base_ref: Option<String>,
    pub draft: bool,
    pub merged_at: Option<String>,
    pub created_at_remote: Option<String>,
    pub updated_at_remote: String,
    pub closed_at: Option<String>,
    pub labels_json: Option<String>,
    pub assignees_json: Option<String>,
    pub included_in_report: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct GitHubIssueRecord {
    pub id: String,
    pub account_id: String,
    pub project_id: String,
    pub owner: String,
    pub repo: String,
    pub number: i64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: Option<String>,
    pub author: Option<String>,
    pub created_at_remote: Option<String>,
    pub updated_at_remote: String,
    pub closed_at: Option<String>,
    pub labels_json: Option<String>,
    pub assignees_json: Option<String>,
    pub included_in_report: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct GitHubSyncStateRecord {
    pub account_id: String,
    pub project_id: String,
    pub owner: String,
    pub repo: String,
    pub pull_requests_cursor: Option<String>,
    pub issues_cursor: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGitHubPullRequestInput {
    pub account_id: Option<String>,
    pub project_id: String,
    pub base_branch: String,
    pub new_branch: String,
    pub title: String,
    pub body: String,
    pub commit_hashes: Vec<String>,
    pub draft: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAccountActionInput {
    pub account_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectProjectGitHubBindingInput {
    pub project_id: Option<String>,
    pub repo_path: Option<String>,
    pub github_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectProjectGitHubBindingOutput {
    pub github_url: Option<String>,
    pub owner: Option<String>,
    pub repo: Option<String>,
    pub account_id: Option<String>,
    pub account_username: Option<String>,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGitHubPullRequestOutput {
    pub number: i64,
    pub url: String,
    pub head_branch: String,
    pub base_branch: String,
    pub pushed_commit_count: usize,
}
