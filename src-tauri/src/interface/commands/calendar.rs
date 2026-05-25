use tauri::State;

use crate::application::calendar::{CalendarService, CalendarServiceError};
use crate::domain::calendar::{
    CalendarEvent, CalendarSource, ConnectGoogleCalendarInput, DisconnectCalendarSourceInput,
    GetWeekCapacityInput, ListCalendarEventsInput, SyncCalendarEventsInput,
    SyncCalendarEventsResult, WeekCapacity,
};
use crate::infrastructure::database::repositories::{
    CalendarEventRepository, CalendarSourceRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_calendar_sources(
    state: State<'_, AppState>,
) -> Result<AppResult<Vec<CalendarSource>>, String> {
    let repository = CalendarSourceRepository::new(state.database.pool());

    Ok(match repository.list().await {
        Ok(sources) => AppResult::ok(sources),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn connect_google_calendar(
    state: State<'_, AppState>,
    input: ConnectGoogleCalendarInput,
) -> Result<AppResult<CalendarSource>, String> {
    let repository = CalendarSourceRepository::new(state.database.pool());

    Ok(
        match CalendarService::connect_google(&repository, input).await {
            Ok(source) => AppResult::ok(source),
            Err(CalendarServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(CalendarServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn disconnect_calendar_source(
    state: State<'_, AppState>,
    input: DisconnectCalendarSourceInput,
) -> Result<AppResult<bool>, String> {
    let repository = CalendarSourceRepository::new(state.database.pool());

    Ok(
        match CalendarService::disconnect(&repository, input).await {
            Ok(disconnected) => AppResult::ok(disconnected),
            Err(CalendarServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(CalendarServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn sync_calendar_events(
    state: State<'_, AppState>,
    input: SyncCalendarEventsInput,
) -> Result<AppResult<SyncCalendarEventsResult>, String> {
    let repository = CalendarSourceRepository::new(state.database.pool());

    Ok(match CalendarService::sync(&repository, input).await {
        Ok(result) => AppResult::ok(result),
        Err(CalendarServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(CalendarServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn list_calendar_events(
    state: State<'_, AppState>,
    input: ListCalendarEventsInput,
) -> Result<AppResult<Vec<CalendarEvent>>, String> {
    let repository = CalendarEventRepository::new(state.database.pool());

    Ok(
        match CalendarService::list_events(&repository, input).await {
            Ok(events) => AppResult::ok(events),
            Err(CalendarServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(CalendarServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn get_week_capacity(
    state: State<'_, AppState>,
    input: GetWeekCapacityInput,
) -> Result<AppResult<WeekCapacity>, String> {
    let repository = CalendarEventRepository::new(state.database.pool());

    Ok(
        match CalendarService::week_capacity(&repository, input).await {
            Ok(capacity) => AppResult::ok(capacity),
            Err(CalendarServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(CalendarServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}
