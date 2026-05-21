use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListActivityInput {
    pub from: String,
    pub to: String,
    pub activity_type: Option<String>,
    pub project_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapInput {
    pub from: String,
    pub to: String,
    pub project_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekSummaryInput {
    pub from: String,
    pub to: String,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapCell {
    pub day: i64,
    pub hour: i64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapData {
    pub cells: Vec<HeatmapCell>,
    pub max_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopProject {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekSummary {
    pub total_activities: i64,
    pub total_activities_trend: f64,
    pub coding_time_minutes: i64,
    pub coding_time_trend: f64,
    pub meeting_count: i64,
    pub meeting_trend: f64,
    pub deployment_count: i64,
    pub deployment_trend: f64,
    pub top_project: TopProject,
    pub focus_time_minutes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyHighlight {
    pub title: String,
    pub description: String,
    pub trend: f64,
    pub icon: String,
}
