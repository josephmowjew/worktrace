use tauri::State;

use crate::application::manual_logs::{ManualLogService, ManualLogServiceError};
use crate::domain::manual_log::{
    CreateManualLogInput, ListManualLogsInput, ManualLog, UpdateManualLogInput,
};
use crate::infrastructure::database::repositories::ManualLogRepository;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_manual_logs(
    state: State<'_, AppState>,
    input: ListManualLogsInput,
) -> Result<AppResult<Vec<ManualLog>>, String> {
    let repository = ManualLogRepository::new(state.database.pool());

    Ok(match ManualLogService::list(&repository, input).await {
        Ok(logs) => AppResult::ok(logs),
        Err(ManualLogServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(ManualLogServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn create_manual_log(
    state: State<'_, AppState>,
    input: CreateManualLogInput,
) -> Result<AppResult<ManualLog>, String> {
    let repository = ManualLogRepository::new(state.database.pool());

    Ok(match ManualLogService::create(&repository, input).await {
        Ok(log) => AppResult::ok(log),
        Err(ManualLogServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(ManualLogServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn update_manual_log(
    state: State<'_, AppState>,
    id: String,
    input: UpdateManualLogInput,
) -> Result<AppResult<ManualLog>, String> {
    let repository = ManualLogRepository::new(state.database.pool());

    Ok(
        match ManualLogService::update(&repository, &id, input).await {
            Ok(Some(log)) => AppResult::ok(log),
            Ok(None) => AppResult::err("MANUAL_LOG_NOT_FOUND", "Manual log was not found"),
            Err(ManualLogServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(ManualLogServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn delete_manual_log(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<bool>, String> {
    let repository = ManualLogRepository::new(state.database.pool());

    Ok(match ManualLogService::delete(&repository, &id).await {
        Ok(deleted) => AppResult::ok(deleted),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}
