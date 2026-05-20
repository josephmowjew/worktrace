use tauri::State;

use crate::application::settings::{SettingsService, SettingsServiceError};
use crate::domain::settings::{Settings, UpdateSettingsInput};
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
