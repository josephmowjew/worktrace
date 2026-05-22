use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedReport {
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub recipient_name: Option<String>,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateReportInput {
    pub start_date: String,
    pub end_date: String,
    pub recipient_name: Option<String>,
    pub project_ids: Option<Vec<String>>,
    pub include_commits: Option<bool>,
    pub include_manual_logs: Option<bool>,
    pub include_weekly_tasks: Option<bool>,
    pub include_hidden: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub recipient_name: Option<String>,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportSummary {
    pub id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub recipient_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReportInput {
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub recipient_name: Option<String>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportItem {
    pub id: String,
    pub report_id: String,
    pub project_id: Option<String>,
    pub source_type: String,
    pub source_id: Option<String>,
    pub summary: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReportItemInput {
    pub report_id: String,
    pub project_id: Option<String>,
    pub source_type: String,
    pub source_id: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportNote {
    pub id: String,
    pub project_id: Option<String>,
    pub note_type: String,
    pub date: String,
    pub content: String,
    pub included_in_report: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListReportNotesInput {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReportNoteInput {
    pub project_id: Option<String>,
    pub note_type: String,
    pub date: String,
    pub content: String,
    pub included_in_report: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReportNoteInput {
    pub project_id: Option<String>,
    pub note_type: Option<String>,
    pub date: Option<String>,
    pub content: Option<String>,
    pub included_in_report: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDailyReviewNoteInput {
    pub date: String,
    pub finished: String,
    pub blocked: String,
    pub carry_into_tomorrow: String,
    pub included_in_report: Option<bool>,
}
