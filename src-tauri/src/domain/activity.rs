use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListActivityInput {
    pub from: String,
    pub to: String,
    pub activity_type: Option<String>,
    pub project_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDay {
    pub date: String,
    pub items: Vec<ActivityItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityItem {
    pub id: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub activity_type: String,
    pub summary: String,
    pub occurred_at: String,
    pub included_in_report: bool,
    pub commit_hash: Option<String>,
    pub author_name: Option<String>,
    pub author_email: Option<String>,
    pub branch: Option<String>,
    pub files_changed: Option<i64>,
    pub insertions: Option<i64>,
    pub deletions: Option<i64>,
}
