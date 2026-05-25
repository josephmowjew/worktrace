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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReportAiProvider {
    LocalLlamaCpp,
    OpenrouterFree,
    Groq,
}

impl ReportAiProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::LocalLlamaCpp => "local_llama_cpp",
            Self::OpenrouterFree => "openrouter_free",
            Self::Groq => "groq",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportPolishInput {
    pub draft: String,
    pub start_date: String,
    pub end_date: String,
    pub recipient_name: Option<String>,
    pub project_ids: Option<Vec<String>>,
    pub include_hidden: Option<bool>,
    pub provider: Option<ReportAiProvider>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportPolishResult {
    pub content: String,
    pub provider: String,
    pub model: String,
    pub used_fallback: bool,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportReadinessInput {
    pub start_date: String,
    pub end_date: String,
    pub project_ids: Option<Vec<String>>,
    pub include_hidden: Option<bool>,
    pub provider: Option<ReportAiProvider>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportReadinessFinding {
    pub severity: String,
    pub title: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportReadinessAnalysis {
    pub provider: String,
    pub model: String,
    pub score: i32,
    pub summary: String,
    pub findings: Vec<ReportReadinessFinding>,
    pub used_fallback: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportAiProviderStatus {
    pub provider: String,
    pub available: bool,
    pub configured: bool,
    pub online: bool,
    pub model: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportAiStatus {
    pub enabled: bool,
    pub preferred_provider: String,
    pub providers: Vec<ReportAiProviderStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportAiModel {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub context_length: Option<i64>,
    pub description: Option<String>,
    pub input_price: Option<String>,
    pub output_price: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportAiModelList {
    pub provider: String,
    pub models: Vec<ReportAiModel>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectReportAiProviderInput {
    pub provider: ReportAiProvider,
    pub api_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestReportAiProviderInput {
    pub provider: ReportAiProvider,
}
