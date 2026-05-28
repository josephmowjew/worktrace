use serde::{Deserialize, Serialize};

use crate::domain::calendar::CalendarEvent;
use crate::domain::weekly_task::WeeklyTask;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DailyPlanItemStatus {
    Todo,
    Done,
    Dropped,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPlan {
    pub id: String,
    pub date: String,
    pub focus_goal_minutes: i32,
    pub current_task_id: Option<String>,
    pub suggested_task_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyPlanItem {
    pub id: String,
    pub daily_plan_id: String,
    pub rank: i32,
    pub title: String,
    pub weekly_task_id: Option<String>,
    pub planned_minutes: Option<i32>,
    pub status: DailyPlanItemStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDailyPlanInput {
    pub date: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDailyPlanInput {
    pub date: String,
    pub focus_goal_minutes: Option<i32>,
    pub current_task_id: Option<String>,
    pub suggested_task_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceDailyPlanItemsInput {
    pub date: String,
    pub items: Vec<ReplaceDailyPlanItemInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceDailyPlanItemInput {
    pub rank: i32,
    pub title: String,
    pub weekly_task_id: Option<String>,
    pub planned_minutes: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDailyPlanItemInput {
    pub status: Option<DailyPlanItemStatus>,
    pub title: Option<String>,
    pub weekly_task_id: Option<String>,
    pub planned_minutes: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTodayCommandCenterInput {
    pub date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedVsActualItem {
    pub item_id: String,
    pub title: String,
    pub planned_minutes: i32,
    pub actual_minutes: i32,
    pub variance_minutes: i32,
    pub ratio: Option<f64>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistractionRisk {
    pub level: String,
    pub score: i32,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndOfDayProgress {
    pub completed_priorities: i32,
    pub total_priorities: i32,
    pub planned_minutes: i32,
    pub actual_minutes: i32,
    pub variance_minutes: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayCommandCenter {
    pub date: String,
    pub daily_plan: DailyPlan,
    pub top_priorities: Vec<DailyPlanItem>,
    pub meetings: Vec<CalendarEvent>,
    pub focus_goal_minutes: i32,
    pub focus_actual_minutes: i32,
    pub current_task: Option<WeeklyTask>,
    pub suggested_next_task: Option<WeeklyTask>,
    pub distraction_risk: DistractionRisk,
    pub end_of_day_progress: EndOfDayProgress,
    pub planned_vs_actual: Vec<PlannedVsActualItem>,
}

impl DailyPlanItemStatus {
    pub fn as_storage_value(&self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::Done => "done",
            Self::Dropped => "dropped",
        }
    }
}

impl TryFrom<String> for DailyPlanItemStatus {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "todo" => Ok(Self::Todo),
            "done" => Ok(Self::Done),
            "dropped" => Ok(Self::Dropped),
            _ => Err(format!("unknown daily plan item status: {value}")),
        }
    }
}
