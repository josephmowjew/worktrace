use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ActivityDay {
    pub date: String,
    pub items: Vec<ActivityItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivityItem {
    pub id: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub activity_type: String,
    pub summary: String,
    pub occurred_at: String,
    pub included_in_report: bool,
}
