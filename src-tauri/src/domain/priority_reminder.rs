use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityReminder {
    pub id: String,
    pub reminder_key: String,
    pub date: String,
    pub daily_plan_item_id: String,
    pub checkpoint_time: String,
    pub title: String,
    pub planned_minutes: Option<i32>,
    pub weekly_task_id: Option<String>,
    pub project_name: Option<String>,
    pub status: String,
    pub snoozed_until: Option<String>,
    pub shown_at: Option<String>,
    pub dismissed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPriorityRemindersInput {
    pub date: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPriorityReminderCheckInput {
    pub date: String,
    pub now_time: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnoozePriorityReminderInput {
    pub reminder_key: String,
    pub date: String,
    pub snooze_minutes: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DismissPriorityReminderInput {
    pub reminder_key: String,
    pub date: String,
}
