use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub status: String,
    pub last_scanned_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceInput {
    pub name: String,
    pub root_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkspaceInput {
    pub name: Option<String>,
    pub root_path: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRepoDiscovery {
    pub repo_path: String,
    pub relative_path: String,
    pub suggested_name: String,
    pub status: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportWorkspaceRepositoriesInput {
    pub workspace_id: String,
    pub repositories: Vec<ImportWorkspaceRepositoryInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportWorkspaceRepositoryInput {
    pub repo_path: String,
    pub name: Option<String>,
    pub project_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRepositoryActionInput {
    pub workspace_id: String,
    pub repo_path: String,
}
