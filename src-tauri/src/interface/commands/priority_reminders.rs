use tauri::State;

use crate::application::priority_reminders::{
    PriorityReminderService, PriorityReminderServiceError,
};
use crate::domain::priority_reminder::{
    DismissPriorityReminderInput, ListPriorityRemindersInput, PriorityReminder,
    RunPriorityReminderCheckInput, SnoozePriorityReminderInput,
};
use crate::infrastructure::database::repositories::{
    PriorityReminderRepository, SettingsRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_priority_reminders(
    state: State<'_, AppState>,
    input: ListPriorityRemindersInput,
) -> Result<AppResult<Vec<PriorityReminder>>, String> {
    let repository = PriorityReminderRepository::new(state.database.pool());
    Ok(map_result(PriorityReminderService::list(&repository, input).await))
}

#[tauri::command]
pub async fn run_priority_reminder_check(
    state: State<'_, AppState>,
    input: RunPriorityReminderCheckInput,
) -> Result<AppResult<Vec<PriorityReminder>>, String> {
    let repository = PriorityReminderRepository::new(state.database.pool());
    let settings_repository = SettingsRepository::new(state.database.pool());
    let settings = match settings_repository.get().await {
        Ok(settings) => settings,
        Err(error) => return Ok(AppResult::err("DATABASE_ERROR", error.to_string())),
    };
    Ok(map_result(
        PriorityReminderService::run_check(&repository, &settings, input).await,
    ))
}

#[tauri::command]
pub async fn snooze_priority_reminder(
    state: State<'_, AppState>,
    input: SnoozePriorityReminderInput,
) -> Result<AppResult<Vec<PriorityReminder>>, String> {
    let repository = PriorityReminderRepository::new(state.database.pool());
    let settings_repository = SettingsRepository::new(state.database.pool());
    let settings = match settings_repository.get().await {
        Ok(settings) => settings,
        Err(error) => return Ok(AppResult::err("DATABASE_ERROR", error.to_string())),
    };
    Ok(map_result(
        PriorityReminderService::snooze(&repository, &settings, input).await,
    ))
}

#[tauri::command]
pub async fn dismiss_priority_reminder(
    state: State<'_, AppState>,
    input: DismissPriorityReminderInput,
) -> Result<AppResult<Vec<PriorityReminder>>, String> {
    let repository = PriorityReminderRepository::new(state.database.pool());
    Ok(map_result(PriorityReminderService::dismiss(&repository, input).await))
}

fn map_result(
    result: Result<Vec<PriorityReminder>, PriorityReminderServiceError>,
) -> AppResult<Vec<PriorityReminder>> {
    match result {
        Ok(reminders) => AppResult::ok(reminders),
        Err(PriorityReminderServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(PriorityReminderServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    }
}
