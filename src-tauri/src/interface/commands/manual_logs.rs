use tauri::{Emitter, State};

use crate::application::manual_logs::{ManualLogService, ManualLogServiceError};
use crate::domain::manual_log::{
    CreateManualLogInput, ListManualLogsInput, ManualLog, QuickCaptureLogInput,
    UpdateManualLogInput,
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
pub async fn quick_capture_log(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    input: QuickCaptureLogInput,
) -> Result<AppResult<ManualLog>, String> {
    let repository = ManualLogRepository::new(state.database.pool());
    let settings_repository =
        crate::infrastructure::database::repositories::SettingsRepository::new(state.database.pool());
    let settings = match settings_repository.get().await {
        Ok(settings) => settings,
        Err(error) => return Ok(AppResult::err("DATABASE_ERROR", error.to_string())),
    };

    let create_input = CreateManualLogInput {
        project_id: input.project_id,
        date: chrono::Local::now().date_naive().to_string(),
        activity_type: input.activity_type,
        summary: input.summary,
        outcome: None,
        duration_minutes: input.duration_minutes,
        follow_up: None,
        included_in_report: Some(
            input
                .included_in_report
                .unwrap_or(settings.quick_capture_include_in_report),
        ),
    };

    Ok(match ManualLogService::create(&repository, create_input).await {
        Ok(log) => {
            let _ = app.emit("quick-capture://created", &log);
            AppResult::ok(log)
        }
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
