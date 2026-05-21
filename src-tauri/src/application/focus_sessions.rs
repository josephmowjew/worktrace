use crate::application::repositories::{FocusSessionStore, ManualLogStore, WeeklyTaskStore};
use crate::domain::focus_session::{
    CreateFocusSessionInput, FocusSession, ListFocusSessionsInput, StopFocusSessionInput,
};
use crate::domain::manual_log::{ActivityType, CreateManualLogInput};
use crate::domain::weekly_task::{UpdateWeeklyTaskInput, WeeklyTaskStatus};

pub struct FocusSessionService;

impl FocusSessionService {
    pub async fn active(
        repository: &impl FocusSessionStore,
    ) -> Result<Option<FocusSession>, FocusSessionServiceError> {
        repository
            .active()
            .await
            .map_err(FocusSessionServiceError::Database)
    }

    pub async fn list(
        repository: &impl FocusSessionStore,
        input: ListFocusSessionsInput,
    ) -> Result<Vec<FocusSession>, FocusSessionServiceError> {
        repository
            .list(input)
            .await
            .map_err(FocusSessionServiceError::Database)
    }

    pub async fn create(
        repository: &impl FocusSessionStore,
        weekly_tasks: &impl WeeklyTaskStore,
        input: CreateFocusSessionInput,
    ) -> Result<FocusSession, FocusSessionServiceError> {
        if repository
            .active()
            .await
            .map_err(FocusSessionServiceError::Database)?
            .is_some()
        {
            return Err(FocusSessionServiceError::Validation(
                "A focus session is already active".to_string(),
            ));
        }

        if input
            .title
            .as_ref()
            .map(|title| title.trim())
            .unwrap_or("")
            .is_empty()
            && input.task_id.is_none()
            && input.project_id.is_none()
        {
            return Err(FocusSessionServiceError::Validation(
                "Focus session needs a title, task, or project".to_string(),
            ));
        }

        let session = repository
            .create(input.clone())
            .await
            .map_err(FocusSessionServiceError::Database)?;

        if let Some(task_id) = input.task_id {
            weekly_tasks
                .update(
                    &task_id,
                    UpdateWeeklyTaskInput {
                        project_id: None,
                        task_type: None,
                        status: Some(WeeklyTaskStatus::InProgress),
                        title: None,
                        details: None,
                        week_start_date: None,
                        target_date: None,
                        completed_at: None,
                        priority: None,
                        included_in_report: None,
                        progress_percent: Some(25),
                    },
                )
                .await
                .map_err(FocusSessionServiceError::Database)?;
        }

        Ok(session)
    }

    pub async fn stop(
        repository: &impl FocusSessionStore,
        manual_logs: &impl ManualLogStore,
        weekly_tasks: &impl WeeklyTaskStore,
        id: &str,
        input: StopFocusSessionInput,
    ) -> Result<Option<FocusSession>, FocusSessionServiceError> {
        let mut session = repository
            .stop(id, input.clone())
            .await
            .map_err(FocusSessionServiceError::Database)?;

        let Some(current) = session.clone() else {
            return Ok(None);
        };

        if input.create_manual_log.unwrap_or(false) {
            let date = current.started_at.chars().take(10).collect::<String>();
            let log = manual_logs
                .create(CreateManualLogInput {
                    project_id: current.project_id.clone(),
                    date,
                    activity_type: ActivityType::Development,
                    summary: input
                        .manual_log_summary
                        .clone()
                        .filter(|summary| !summary.trim().is_empty())
                        .unwrap_or_else(|| format!("Focus session: {}", current.title)),
                    outcome: input.notes.clone(),
                    duration_minutes: current.duration_minutes,
                    follow_up: None,
                    included_in_report: Some(true),
                })
                .await
                .map_err(FocusSessionServiceError::Database)?;

            session = repository
                .set_manual_log(id, &log.id)
                .await
                .map_err(FocusSessionServiceError::Database)?;
        }

        if let Some(task_id) = current.task_id.as_ref() {
            let status = input
                .complete_task
                .unwrap_or(false)
                .then_some(WeeklyTaskStatus::Completed);
            weekly_tasks
                .update(
                    task_id,
                    UpdateWeeklyTaskInput {
                        project_id: None,
                        task_type: None,
                        status,
                        title: None,
                        details: None,
                        week_start_date: None,
                        target_date: None,
                        completed_at: if input.complete_task.unwrap_or(false) {
                            Some(current.started_at.chars().take(10).collect::<String>())
                        } else {
                            None
                        },
                        priority: None,
                        included_in_report: None,
                        progress_percent: input.progress_percent,
                    },
                )
                .await
                .map_err(FocusSessionServiceError::Database)?;
        }

        Ok(session)
    }

    pub async fn cancel(
        repository: &impl FocusSessionStore,
        id: &str,
    ) -> Result<Option<FocusSession>, FocusSessionServiceError> {
        repository
            .cancel(id)
            .await
            .map_err(FocusSessionServiceError::Database)
    }
}

#[derive(Debug)]
pub enum FocusSessionServiceError {
    Validation(String),
    Database(sqlx::Error),
}
