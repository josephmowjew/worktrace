use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub enum ActivityType {
    Meeting,
    Development,
    BugFix,
    Testing,
    Deployment,
    Research,
    Documentation,
    Planning,
    Support,
    CodeReview,
    ClientFeedback,
}

#[derive(Debug, Clone, Serialize)]
pub struct ManualLog {
    pub id: String,
    pub project_id: Option<String>,
    pub date: String,
    pub activity_type: ActivityType,
    pub summary: String,
    pub outcome: Option<String>,
    pub duration_minutes: Option<i64>,
    pub follow_up: Option<String>,
    pub included_in_report: bool,
}
