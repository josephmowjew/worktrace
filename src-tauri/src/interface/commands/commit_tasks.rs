use tauri::State;

use crate::application::commit_tasks::{CommitTaskService, CommitTaskServiceError};
use crate::domain::commit_task::{
    CommitTaskDraftResponse, CreateWeeklyTaskFromCommitInput, CreateWeeklyTaskFromCommitOutcome,
    PreviewCommitTaskDraftInput,
};
use crate::infrastructure::database::repositories::{
    ActivityGroupRepository, ActivityRepository, GitMetadataRepository, WeeklyTaskRepository,
    WeeklyTaskSourceLinkRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn preview_commit_task_draft(
    state: State<'_, AppState>,
    input: PreviewCommitTaskDraftInput,
) -> Result<AppResult<CommitTaskDraftResponse>, String> {
    let activity_repository = ActivityRepository::new(state.database.pool());
    let group_repository = ActivityGroupRepository::new(state.database.pool());
    let git_repository = GitMetadataRepository::new(state.database.pool());
    let link_repository = WeeklyTaskSourceLinkRepository::new(state.database.pool());
    let weekly_task_repository = WeeklyTaskRepository::new(state.database.pool());

    Ok(
        match CommitTaskService::preview(
            &activity_repository,
            &group_repository,
            &git_repository,
            &link_repository,
            &weekly_task_repository,
            input,
        )
        .await
        {
            Ok(response) => AppResult::ok(response),
            Err(error) => commit_task_error(error),
        },
    )
}

#[tauri::command]
pub async fn create_weekly_task_from_commit(
    state: State<'_, AppState>,
    input: CreateWeeklyTaskFromCommitInput,
) -> Result<AppResult<CreateWeeklyTaskFromCommitOutcome>, String> {
    let activity_repository = ActivityRepository::new(state.database.pool());
    let link_repository = WeeklyTaskSourceLinkRepository::new(state.database.pool());
    let weekly_task_repository = WeeklyTaskRepository::new(state.database.pool());

    Ok(
        match CommitTaskService::create(
            &activity_repository,
            &link_repository,
            &weekly_task_repository,
            input,
        )
        .await
        {
            Ok(response) => AppResult::ok(response),
            Err(error) => commit_task_error(error),
        },
    )
}

fn commit_task_error<T: serde::Serialize>(error: CommitTaskServiceError) -> AppResult<T> {
    match error {
        CommitTaskServiceError::Validation(message) => AppResult::err("VALIDATION_ERROR", message),
        CommitTaskServiceError::NotFound(message) => AppResult::err("COMMIT_NOT_FOUND", message),
        CommitTaskServiceError::Database(error) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    }
}
