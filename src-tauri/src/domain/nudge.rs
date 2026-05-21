use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NudgeDismissal {
    pub id: String,
    pub nudge_key: String,
    pub scope: Option<String>,
    pub dismissed_for_date: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListNudgeDismissalsInput {
    pub dismissed_for_date: String,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DismissNudgeInput {
    pub nudge_key: String,
    pub scope: Option<String>,
    pub dismissed_for_date: String,
}
