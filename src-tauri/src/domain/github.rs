use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIntegrationStatus {
    pub connected: bool,
    pub username: Option<String>,
    pub connected_at: Option<String>,
    pub last_validated_at: Option<String>,
    pub has_token: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectGitHubPatInput {
    pub token: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGitHubPullRequestInput {
    pub project_id: String,
    pub base_branch: String,
    pub new_branch: String,
    pub title: String,
    pub body: String,
    pub commit_hashes: Vec<String>,
    pub draft: Option<bool>,
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
