use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FocusSessionStatus {
    Active,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSession {
    pub id: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub task_id: Option<String>,
    pub task_title: Option<String>,
    pub title: String,
    pub notes: Option<String>,
    pub status: FocusSessionStatus,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_minutes: Option<i64>,
    pub manual_log_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFocusSessionInput {
    pub project_id: Option<String>,
    pub task_id: Option<String>,
    pub title: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopFocusSessionInput {
    pub notes: Option<String>,
    pub create_manual_log: Option<bool>,
    pub manual_log_summary: Option<String>,
    pub complete_task: Option<bool>,
    pub progress_percent: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListFocusSessionsInput {
    pub from: Option<String>,
    pub to: Option<String>,
    pub status: Option<FocusSessionStatus>,
    pub project_ids: Option<Vec<String>>,
}

impl FocusSessionStatus {
    pub fn as_storage_value(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
        }
    }
}

impl TryFrom<String> for FocusSessionStatus {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "active" => Ok(Self::Active),
            "completed" => Ok(Self::Completed),
            "cancelled" => Ok(Self::Cancelled),
            _ => Err(format!("unknown focus session status: {value}")),
        }
    }
}
