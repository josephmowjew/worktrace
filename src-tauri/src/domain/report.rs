use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct GeneratedReport {
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Report {
    pub id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub recipient_name: Option<String>,
    pub content: String,
    pub created_at: String,
}
