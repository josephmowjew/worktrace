use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSource {
    pub id: String,
    pub provider: String,
    pub account_email: String,
    pub account_name: Option<String>,
    pub sync_status: String,
    pub last_synced_at: Option<String>,
    pub token_ref: Option<String>,
    pub access_token_ref: Option<String>,
    pub refresh_token_ref: Option<String>,
    pub access_expires_at: Option<String>,
    pub calendar_id: Option<String>,
    pub google_client_id: Option<String>,
    pub sync_token: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub source_id: String,
    pub external_id: String,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub starts_at: String,
    pub ends_at: String,
    pub timezone: Option<String>,
    pub all_day: bool,
    pub busy_status: String,
    pub is_cancelled: bool,
    pub project_id: Option<String>,
    pub task_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub imported_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCalendarEventsInput {
    pub from: String,
    pub to: String,
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectGoogleCalendarInput {
    pub client_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectCalendarSourceInput {
    pub source_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCalendarSourceEnabledInput {
    pub source_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncCalendarEventsInput {
    pub source_id: Option<String>,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncCalendarEventsResult {
    pub source_id: Option<String>,
    pub imported: i32,
    pub updated: i32,
    pub cancelled: i32,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetWeekCapacityInput {
    pub week_start_date: String,
    pub week_end_date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekCapacity {
    pub week_start_date: String,
    pub week_end_date: String,
    pub gross_capacity_minutes: i32,
    pub meeting_minutes: i32,
    pub planned_task_minutes: i32,
    pub available_minutes: i32,
    pub remaining_minutes: i32,
    pub actual_work_minutes: i32,
    pub days: Vec<DayCapacity>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayCapacity {
    pub date: String,
    pub day_name: String,
    pub is_working_day: bool,
    pub gross_capacity_minutes: i32,
    pub meeting_minutes: i32,
    pub planned_task_minutes: i32,
    pub available_minutes: i32,
    pub remaining_minutes: i32,
}
