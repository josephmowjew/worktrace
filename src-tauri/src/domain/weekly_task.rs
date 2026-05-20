use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WeeklyTaskType {
    PlannedWork,
    Blocker,
    Carryover,
    CompletedChecklist,
    FollowUp,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WeeklyTaskStatus {
    Todo,
    InProgress,
    Blocked,
    Completed,
    Dropped,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WeeklyTaskPriority {
    Low,
    Normal,
    High,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyTask {
    pub id: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub task_type: WeeklyTaskType,
    pub status: WeeklyTaskStatus,
    pub title: String,
    pub details: Option<String>,
    pub week_start_date: String,
    pub target_date: Option<String>,
    pub completed_at: Option<String>,
    pub priority: WeeklyTaskPriority,
    pub included_in_report: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWeeklyTasksInput {
    pub week_start_date: String,
    pub week_end_date: String,
    pub project_ids: Option<Vec<String>>,
    pub task_type: Option<WeeklyTaskType>,
    pub status: Option<WeeklyTaskStatus>,
    pub included_in_report: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWeeklyTaskInput {
    pub project_id: Option<String>,
    pub task_type: WeeklyTaskType,
    pub status: Option<WeeklyTaskStatus>,
    pub title: String,
    pub details: Option<String>,
    pub week_start_date: String,
    pub target_date: Option<String>,
    pub completed_at: Option<String>,
    pub priority: Option<WeeklyTaskPriority>,
    pub included_in_report: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWeeklyTaskInput {
    pub project_id: Option<String>,
    pub task_type: Option<WeeklyTaskType>,
    pub status: Option<WeeklyTaskStatus>,
    pub title: Option<String>,
    pub details: Option<String>,
    pub week_start_date: Option<String>,
    pub target_date: Option<String>,
    pub completed_at: Option<String>,
    pub priority: Option<WeeklyTaskPriority>,
    pub included_in_report: Option<bool>,
}

impl WeeklyTaskType {
    pub fn as_storage_value(&self) -> &'static str {
        match self {
            Self::PlannedWork => "planned_work",
            Self::Blocker => "blocker",
            Self::Carryover => "carryover",
            Self::CompletedChecklist => "completed_checklist",
            Self::FollowUp => "follow_up",
        }
    }
}

impl WeeklyTaskStatus {
    pub fn as_storage_value(&self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::Blocked => "blocked",
            Self::Completed => "completed",
            Self::Dropped => "dropped",
        }
    }
}

impl WeeklyTaskPriority {
    pub fn as_storage_value(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Normal => "normal",
            Self::High => "high",
        }
    }
}

impl TryFrom<String> for WeeklyTaskType {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "planned_work" => Ok(Self::PlannedWork),
            "blocker" => Ok(Self::Blocker),
            "carryover" => Ok(Self::Carryover),
            "completed_checklist" => Ok(Self::CompletedChecklist),
            "follow_up" => Ok(Self::FollowUp),
            _ => Err(format!("unknown weekly task type: {value}")),
        }
    }
}

impl TryFrom<String> for WeeklyTaskStatus {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "todo" => Ok(Self::Todo),
            "in_progress" => Ok(Self::InProgress),
            "blocked" => Ok(Self::Blocked),
            "completed" => Ok(Self::Completed),
            "dropped" => Ok(Self::Dropped),
            _ => Err(format!("unknown weekly task status: {value}")),
        }
    }
}

impl TryFrom<String> for WeeklyTaskPriority {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "low" => Ok(Self::Low),
            "normal" => Ok(Self::Normal),
            "high" => Ok(Self::High),
            _ => Err(format!("unknown weekly task priority: {value}")),
        }
    }
}
