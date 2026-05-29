use serde::{Deserialize, Serialize};

use crate::domain::git_metadata::{CommitRefSummary, CommitWorktreeSummary};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub repo_path: Option<String>,
    pub github_url: Option<String>,
    pub github_account_id: Option<String>,
    pub project_type: Option<String>,
    pub workspace_id: Option<String>,
    pub workspace_relative_path: Option<String>,
    pub classification: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    pub description: Option<String>,
    pub repo_path: Option<String>,
    pub github_url: Option<String>,
    pub github_account_id: Option<String>,
    pub project_type: Option<String>,
    pub classification: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub repo_path: Option<String>,
    pub github_url: Option<String>,
    pub github_account_id: Option<String>,
    pub project_type: Option<String>,
    pub workspace_id: Option<String>,
    pub workspace_relative_path: Option<String>,
    pub classification: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStats {
    pub project_id: String,
    pub project_name: String,
    pub commits_this_week: i64,
    pub last_sync: Option<String>,
    pub hours_tracked: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryDistribution {
    pub category: String,
    pub count: i64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentCommit {
    pub project_id: String,
    pub project_name: String,
    pub repo_path: Option<String>,
    pub commit_hash: String,
    pub message: String,
    pub author_name: Option<String>,
    pub branch: Option<String>,
    pub committed_at: String,
    pub refs: Vec<CommitRefSummary>,
    pub worktree: Option<CommitWorktreeSummary>,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopContributor {
    pub author_name: String,
    pub author_email: Option<String>,
    pub commit_count: i64,
}
