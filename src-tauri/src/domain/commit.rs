use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub id: String,
    pub project_id: String,
    pub commit_hash: String,
    pub message: String,
    pub author_name: Option<String>,
    pub author_email: Option<String>,
    pub branch: Option<String>,
    pub committed_at: String,
    pub files_changed: Option<i64>,
    pub insertions: Option<i64>,
    pub deletions: Option<i64>,
    pub included_in_report: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncCommitsInput {
    pub from: Option<String>,
    pub to: Option<String>,
    pub author_email: Option<String>,
    pub project_ids: Option<Vec<String>>,
    pub mode: Option<SyncMode>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SyncMode {
    Auto,
    Full,
    EvidenceRepair,
}

impl Default for SyncMode {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncCommitsResult {
    pub scanned_projects: i64,
    pub skipped_projects: i64,
    pub skipped_fresh_projects: i64,
    pub incremental_projects: i64,
    pub full_projects: i64,
    pub unchanged_projects: i64,
    pub fallback_rescans: i64,
    pub new_commits: i64,
    pub updated_commits: i64,
    pub evidence_repaired: i64,
    pub diff_snippets_collected: i64,
    pub duration_ms: i64,
    pub slow_projects: Vec<String>,
    pub errors: Vec<String>,
}
