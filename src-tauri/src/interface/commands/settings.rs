use tauri::State;

use crate::application::settings::{SettingsService, SettingsServiceError};
use crate::domain::settings::{
    BackupLocationValidation, Settings, SettingsExport, SettingsImportResult, UpdateSettingsInput,
};
use crate::infrastructure::database::repositories::SettingsRepository;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppResult<Settings>, String> {
    let repository = SettingsRepository::new(state.database.pool());

    Ok(match SettingsService::get(&repository).await {
        Ok(settings) => AppResult::ok(settings),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    input: UpdateSettingsInput,
) -> Result<AppResult<Settings>, String> {
    let repository = SettingsRepository::new(state.database.pool());

    Ok(match SettingsService::update(&repository, input).await {
        Ok(settings) => AppResult::ok(settings),
        Err(SettingsServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(SettingsServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn activate_sparc_force_addon(
    state: State<'_, AppState>,
    code: String,
) -> Result<AppResult<Settings>, String> {
    let repository = SettingsRepository::new(state.database.pool());

    Ok(
        match SettingsService::activate_sparc_force_addon(&repository, code).await {
            Ok(settings) => AppResult::ok(settings),
            Err(SettingsServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(SettingsServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn validate_backup_location(
    location: String,
) -> Result<AppResult<BackupLocationValidation>, String> {
    Ok(AppResult::ok(SettingsService::validate_backup_location(
        &location,
    )))
}

#[tauri::command]
pub async fn export_settings(
    state: State<'_, AppState>,
) -> Result<AppResult<SettingsExport>, String> {
    let repository = SettingsRepository::new(state.database.pool());

    Ok(match SettingsService::export(&repository).await {
        Ok(export) => AppResult::ok(export),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn export_settings_to_file(
    state: State<'_, AppState>,
    path: String,
) -> Result<AppResult<()>, String> {
    let repository = SettingsRepository::new(state.database.pool());

    Ok(
        match SettingsService::export_to_file(&repository, path).await {
            Ok(()) => AppResult::ok(()),
            Err(SettingsServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(SettingsServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn import_settings(
    state: State<'_, AppState>,
    payload: String,
) -> Result<AppResult<SettingsImportResult>, String> {
    let repository = SettingsRepository::new(state.database.pool());

    Ok(match SettingsService::import(&repository, payload).await {
        Ok(result) => AppResult::ok(result),
        Err(SettingsServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(SettingsServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}
