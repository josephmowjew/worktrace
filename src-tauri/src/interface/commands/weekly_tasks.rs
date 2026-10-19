use tauri::{Emitter, State};

use crate::application::weekly_tasks::{WeeklyTaskService, WeeklyTaskServiceError};
use crate::domain::weekly_task::{
    CreateWeeklyTaskInput, ListWeeklyTasksInput, UpdateWeeklyTaskInput, WeeklyTask,
};
use crate::infrastructure::database::repositories::WeeklyTaskRepository;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_weekly_tasks(
    state: State<'_, AppState>,
    input: ListWeeklyTasksInput,
) -> Result<AppResult<Vec<WeeklyTask>>, String> {
    let repository = WeeklyTaskRepository::new(state.database.pool());

    Ok(match WeeklyTaskService::list(&repository, input).await {
        Ok(tasks) => AppResult::ok(tasks),
        Err(WeeklyTaskServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(WeeklyTaskServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn create_weekly_task(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: CreateWeeklyTaskInput,
) -> Result<AppResult<WeeklyTask>, String> {
    let repository = WeeklyTaskRepository::new(state.database.pool());

    Ok(match WeeklyTaskService::create(&repository, input).await {
        Ok(task) => {
            let _ = app.emit("tasks://changed", ());
            AppResult::ok(task)
        }
        Err(WeeklyTaskServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(WeeklyTaskServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn update_weekly_task(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: UpdateWeeklyTaskInput,
) -> Result<AppResult<WeeklyTask>, String> {
    let repository = WeeklyTaskRepository::new(state.database.pool());

    Ok(
        match WeeklyTaskService::update(&repository, &id, input).await {
            Ok(Some(task)) => {
                let _ = app.emit("tasks://changed", ());
                AppResult::ok(task)
            }
            Ok(None) => AppResult::err("WEEKLY_TASK_NOT_FOUND", "Task was not found"),
            Err(WeeklyTaskServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(WeeklyTaskServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn delete_weekly_task(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<bool>, String> {
    let repository = WeeklyTaskRepository::new(state.database.pool());

    Ok(match WeeklyTaskService::delete(&repository, &id).await {
        Ok(deleted) => {
            if deleted {
                let _ = app.emit("tasks://changed", ());
            }
            AppResult::ok(deleted)
        }
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn list_tasks(state: State<'_, AppState>) -> Result<AppResult<Vec<WeeklyTask>>, String> {
    let repository = WeeklyTaskRepository::new(state.database.pool());
    Ok(match repository.list_all().await {
        Ok(tasks) => AppResult::ok(tasks),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}
