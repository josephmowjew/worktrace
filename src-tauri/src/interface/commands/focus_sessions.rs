use tauri::State;

use crate::application::focus_sessions::{FocusSessionService, FocusSessionServiceError};
use crate::domain::focus_session::{
    CreateFocusSessionInput, FocusSession, ListFocusSessionsInput, StopFocusSessionInput,
};
use crate::infrastructure::database::repositories::{
    FocusSessionRepository, ManualLogRepository, WeeklyTaskRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn get_active_focus_session(
    state: State<'_, AppState>,
) -> Result<AppResult<Option<FocusSession>>, String> {
    let repository = FocusSessionRepository::new(state.database.pool());

    Ok(match FocusSessionService::active(&repository).await {
        Ok(session) => AppResult::ok(session),
        Err(FocusSessionServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(FocusSessionServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn list_focus_sessions(
    state: State<'_, AppState>,
    input: ListFocusSessionsInput,
) -> Result<AppResult<Vec<FocusSession>>, String> {
    let repository = FocusSessionRepository::new(state.database.pool());

    Ok(match FocusSessionService::list(&repository, input).await {
        Ok(sessions) => AppResult::ok(sessions),
        Err(FocusSessionServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(FocusSessionServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn start_focus_session(
    state: State<'_, AppState>,
    input: CreateFocusSessionInput,
) -> Result<AppResult<FocusSession>, String> {
    let repository = FocusSessionRepository::new(state.database.pool());
    let weekly_tasks = WeeklyTaskRepository::new(state.database.pool());

    Ok(
        match FocusSessionService::create(&repository, &weekly_tasks, input).await {
            Ok(session) => AppResult::ok(session),
            Err(FocusSessionServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(FocusSessionServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn stop_focus_session(
    state: State<'_, AppState>,
    id: String,
    input: StopFocusSessionInput,
) -> Result<AppResult<FocusSession>, String> {
    let repository = FocusSessionRepository::new(state.database.pool());
    let manual_logs = ManualLogRepository::new(state.database.pool());
    let weekly_tasks = WeeklyTaskRepository::new(state.database.pool());

    Ok(
        match FocusSessionService::stop(&repository, &manual_logs, &weekly_tasks, &id, input).await
        {
            Ok(Some(session)) => AppResult::ok(session),
            Ok(None) => AppResult::err("FOCUS_SESSION_NOT_FOUND", "Focus session was not found"),
            Err(FocusSessionServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(FocusSessionServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn cancel_focus_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<FocusSession>, String> {
    let repository = FocusSessionRepository::new(state.database.pool());

    Ok(match FocusSessionService::cancel(&repository, &id).await {
        Ok(Some(session)) => AppResult::ok(session),
        Ok(None) => AppResult::err("FOCUS_SESSION_NOT_FOUND", "Focus session was not found"),
        Err(FocusSessionServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(FocusSessionServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}
