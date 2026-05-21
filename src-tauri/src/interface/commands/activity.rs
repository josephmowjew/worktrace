use tauri::State;

use crate::application::activity::{ActivityService, ActivityServiceError};
use crate::domain::activity::{
    ActivityDay, HeatmapData, HeatmapInput, KeyHighlight, ListActivityInput, WeekSummary,
    WeekSummaryInput,
};
use crate::infrastructure::database::repositories::ActivityRepository;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_activity(
    state: State<'_, AppState>,
    input: ListActivityInput,
) -> Result<AppResult<Vec<ActivityDay>>, String> {
    let repository = ActivityRepository::new(state.database.pool());

    Ok(match ActivityService::list(&repository, input).await {
        Ok(activity) => AppResult::ok(activity),
        Err(ActivityServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(ActivityServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn get_activity_heatmap(
    state: State<'_, AppState>,
    input: HeatmapInput,
) -> Result<AppResult<HeatmapData>, String> {
    let repository = ActivityRepository::new(state.database.pool());

    Ok(
        match ActivityService::get_heatmap(&repository, input).await {
            Ok(heatmap) => AppResult::ok(heatmap),
            Err(ActivityServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(ActivityServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn get_week_summary(
    state: State<'_, AppState>,
    input: WeekSummaryInput,
) -> Result<AppResult<WeekSummary>, String> {
    let repository = ActivityRepository::new(state.database.pool());

    Ok(
        match ActivityService::get_week_summary(&repository, input).await {
            Ok(summary) => AppResult::ok(summary),
            Err(ActivityServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(ActivityServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn get_key_highlights(
    state: State<'_, AppState>,
    input: WeekSummaryInput,
) -> Result<AppResult<Vec<KeyHighlight>>, String> {
    let repository = ActivityRepository::new(state.database.pool());

    Ok(
        match ActivityService::get_key_highlights(&repository, input).await {
            Ok(highlights) => AppResult::ok(highlights),
            Err(ActivityServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(ActivityServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}
