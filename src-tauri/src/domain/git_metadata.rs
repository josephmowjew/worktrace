use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitRef {
    pub project_id: String,
    pub name: String,
    pub full_name: String,
    pub kind: GitRefKind,
    pub is_current: bool,
    pub is_head: bool,
    pub last_seen_commit: Option<String>,
    pub last_scanned_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GitRefKind {
    Local,
    Remote,
}

impl GitRefKind {
    pub fn as_storage_value(&self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Remote => "remote",
        }
    }
}

impl TryFrom<String> for GitRefKind {
    type Error = ();

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "local" => Ok(Self::Local),
            "remote" => Ok(Self::Remote),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitRef {
    pub project_id: String,
    pub commit_hash: String,
    pub ref_name: String,
    pub ref_kind: GitRefKind,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitRefFilter {
    pub project_id: Option<String>,
    pub name: String,
    pub kind: GitRefKind,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitWorktreeRef {
    pub project_id: String,
    pub commit_hash: String,
    pub worktree_path: String,
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktree {
    pub project_id: String,
    pub path: String,
    pub branch: Option<String>,
    pub head_commit: Option<String>,
    pub is_clean: Option<bool>,
    pub is_prunable: bool,
    pub is_locked: bool,
    pub last_scanned_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitRefSummary {
    pub name: String,
    pub kind: GitRefKind,
    pub is_current: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitWorktreeSummary {
    pub path: String,
    pub branch: Option<String>,
    pub head_commit: Option<String>,
    pub is_clean: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitFileChange {
    pub project_id: String,
    pub commit_hash: String,
    pub path: String,
    pub old_path: Option<String>,
    pub change_kind: String,
    pub additions: i64,
    pub deletions: i64,
    pub is_binary: bool,
    pub language: Option<String>,
    pub top_level_dir: Option<String>,
    pub is_test: bool,
    pub is_docs: bool,
    pub is_config: bool,
    pub is_migration: bool,
    pub is_generated: bool,
    pub collected_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiffSnippet {
    pub project_id: String,
    pub commit_hash: String,
    pub path: String,
    pub snippet: String,
    pub collected_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGitFocus {
    pub project_id: String,
    pub refs: Vec<GitRefFilter>,
    pub worktree_paths: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectGitFocusInput {
    pub project_id: String,
    pub refs: Vec<GitRefFilter>,
    pub worktree_paths: Vec<String>,
}
