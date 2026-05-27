use serde::{Deserialize, Serialize};

use crate::domain::weekly_task::WeeklyTask;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparcForceConnection {
    pub id: String,
    pub base_url: String,
    pub status: String,
    pub account_email: String,
    pub remote_user_id: Option<i64>,
    pub remote_username: Option<String>,
    pub masked_email: Option<String>,
    pub access_token_ref: Option<String>,
    pub refresh_token_ref: Option<String>,
    pub otp_session_ref: Option<String>,
    pub access_expires_at: Option<String>,
    pub otp_expires_at: Option<String>,
    pub connected_at: Option<String>,
    pub last_validated_at: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparcForceIntegrationStatus {
    pub connected: bool,
    pub status: String,
    pub base_url: Option<String>,
    pub account_email: Option<String>,
    pub remote_user_id: Option<i64>,
    pub remote_username: Option<String>,
    pub masked_email: Option<String>,
    pub connected_at: Option<String>,
    pub last_validated_at: Option<String>,
    pub last_synced_at: Option<String>,
    pub access_expires_at: Option<String>,
    pub otp_expires_at: Option<String>,
    pub has_access_token: bool,
    pub has_refresh_token: bool,
    pub imported_cases: i64,
    pub imported_projects: i64,
    pub imported_tasks: i64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparcForceLoginOutcome {
    pub status: SparcForceIntegrationStatus,
    pub otp_required: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparcForceSyncResult {
    pub cases_imported: usize,
    pub projects_imported: usize,
    pub tasks_imported: usize,
    pub standalone_tasks_enabled: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparcForceImportedItem {
    pub kind: String,
    pub external_kind: Option<String>,
    pub external_id: String,
    pub title: String,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub source: Option<String>,
    pub assigned_to: Option<i64>,
    pub ownership: Option<String>,
    pub created_by: Option<String>,
    pub created_ownership: Option<String>,
    pub project_external_id: Option<String>,
    pub case_external_id: Option<String>,
    pub updated_at_remote: Option<String>,
    pub created_at_remote: Option<String>,
    pub imported_at: String,
    pub raw_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparcForceImportedData {
    pub cases: Vec<SparcForceImportedItem>,
    pub projects: Vec<SparcForceImportedItem>,
    pub tasks: Vec<SparcForceImportedItem>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSparcForceRecordsInput {
    pub kind: Option<String>,
    pub search: Option<String>,
    pub statuses: Option<Vec<String>>,
    pub priorities: Option<Vec<String>>,
    pub sources: Option<Vec<String>>,
    pub relationship: Option<String>,
    pub ownership: Option<String>,
    pub created_ownership: Option<String>,
    pub project_external_id: Option<String>,
    pub case_external_id: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub sort_by: Option<String>,
    pub sort_direction: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparcForceRecordBucket {
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparcForceRecordCounts {
    pub total: i64,
    pub cases: i64,
    pub projects: i64,
    pub tasks: i64,
    pub statuses: Vec<SparcForceRecordBucket>,
    pub priorities: Vec<SparcForceRecordBucket>,
    pub sources: Vec<SparcForceRecordBucket>,
    pub relationships: Vec<SparcForceRecordBucket>,
    pub ownerships: Vec<SparcForceRecordBucket>,
    pub created_ownerships: Vec<SparcForceRecordBucket>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparcForceRecordQueryResult {
    pub records: Vec<SparcForceImportedItem>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    pub counts: SparcForceRecordCounts,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectSparcForceInput {
    pub base_url: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifySparcForceOtpInput {
    pub otp_code: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSparcForceTaskInput {
    pub source: String,
    pub external_kind: Option<String>,
    pub external_id: String,
    pub week_start_date: String,
    pub title: Option<String>,
    pub details: Option<String>,
    pub status: Option<crate::domain::weekly_task::WeeklyTaskStatus>,
    pub priority: Option<crate::domain::weekly_task::WeeklyTaskPriority>,
    pub target_date: Option<String>,
    pub completed_at: Option<String>,
    pub included_in_report: Option<bool>,
    pub progress_percent: Option<i32>,
    pub estimated_minutes: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSparcForceTaskOutcome {
    pub task: WeeklyTask,
    pub already_imported: bool,
}

#[derive(Debug, Clone)]
pub struct SparcForceCacheRecord {
    pub external_id: String,
    pub title: String,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub project_external_id: Option<String>,
    pub case_external_id: Option<String>,
    pub assigned_to: Option<i64>,
    pub updated_at_remote: Option<String>,
    pub created_at_remote: Option<String>,
    pub raw_json: String,
}

#[derive(Debug, Clone, Default)]
pub struct SparcForceImportCounts {
    pub cases: i64,
    pub projects: i64,
    pub tasks: i64,
}
