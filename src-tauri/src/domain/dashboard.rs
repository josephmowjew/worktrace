use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub projects_worked_on: i64,
    pub projects_delta: i64,
    pub commits_this_week: i64,
    pub commits_delta_percent: f64,
    pub meetings_logged: i64,
    pub meetings_delta: i64,
    pub reports_generated: i64,
    pub reports_delta: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivityHours {
    pub day: String,
    pub date: String,
    pub hours: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBreakdown {
    pub project_id: String,
    pub project_name: String,
    pub hours: f64,
    pub percentage: f64,
}
