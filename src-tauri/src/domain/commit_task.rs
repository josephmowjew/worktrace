use serde::{Deserialize, Serialize};

use crate::domain::weekly_task::{
    CreateWeeklyTaskInput, WeeklyTask, WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCommitTaskDraftInput {
    pub activity_id: String,
    pub week_start_date: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWeeklyTaskFromCommitInput {
    pub activity_id: String,
    pub task: CreateWeeklyTaskInput,
    pub confidence: Option<f64>,
    pub confidence_label: Option<String>,
    pub rationale: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitTaskDraftResponse {
    pub draft: CreateWeeklyTaskInput,
    pub confidence: f64,
    pub confidence_label: String,
    pub rationale: Vec<String>,
    pub evidence: CommitTaskEvidenceSummary,
    pub title_candidates: Vec<CommitTaskTitleCandidate>,
    pub selected_title_strategy: String,
    pub description_sections: Vec<CommitTaskDescriptionSection>,
    pub quality_warnings: Vec<String>,
    pub group_context: Option<CommitTaskGroupContext>,
    pub existing_task: Option<WeeklyTask>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitTaskTitleCandidate {
    pub id: String,
    pub title: String,
    pub strategy: String,
    pub score: f64,
    pub rationale: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitTaskDescriptionSection {
    pub label: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitTaskGroupContext {
    pub group_id: String,
    pub title: String,
    pub summary: Option<String>,
    pub report_summary: Option<String>,
    pub confidence_label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWeeklyTaskFromCommitOutcome {
    pub task: WeeklyTask,
    pub already_created: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitTaskEvidenceSummary {
    pub activity_id: String,
    pub project_id: String,
    pub project_name: Option<String>,
    pub commit_hash: String,
    pub subject: String,
    pub branch: Option<String>,
    pub modules: Vec<String>,
    pub change_types: Vec<String>,
    pub occurred_at: String,
}

#[derive(Debug, Clone)]
pub struct WeeklyTaskSourceLink {
    pub id: String,
    pub weekly_task_id: String,
    pub source_type: String,
    pub project_id: String,
    pub commit_hash: String,
    pub activity_id: String,
    pub summary_snapshot: String,
    pub confidence: Option<f64>,
    pub confidence_label: Option<String>,
    pub rationale_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Default for CreateWeeklyTaskInput {
    fn default() -> Self {
        Self {
            project_id: None,
            task_type: WeeklyTaskType::PlannedWork,
            status: Some(WeeklyTaskStatus::Todo),
            title: String::new(),
            details: None,
            week_start_date: String::new(),
            target_date: None,
            completed_at: None,
            priority: Some(WeeklyTaskPriority::Normal),
            included_in_report: Some(false),
            progress_percent: None,
            estimated_minutes: None,
        }
    }
}
