use tauri::State;

use crate::application::friction::{FrictionService, FrictionServiceError};
use crate::domain::friction::{FrictionInsight, GetFrictionInsightsInput};
use crate::infrastructure::database::repositories::{
    ActivityRepository, CalendarEventRepository, FocusSessionRepository, ManualLogRepository,
    ReportRepository, WeeklyTaskRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn get_friction_insights(
    state: State<'_, AppState>,
    input: GetFrictionInsightsInput,
) -> Result<AppResult<Vec<FrictionInsight>>, String> {
    let activity_repository = ActivityRepository::new(state.database.pool());
    let manual_log_repository = ManualLogRepository::new(state.database.pool());
    let weekly_task_repository = WeeklyTaskRepository::new(state.database.pool());
    let calendar_event_repository = CalendarEventRepository::new(state.database.pool());
    let focus_session_repository = FocusSessionRepository::new(state.database.pool());
    let report_repository = ReportRepository::new(state.database.pool());

    Ok(match FrictionService::get_insights(
        &activity_repository,
        &manual_log_repository,
        &weekly_task_repository,
        &calendar_event_repository,
        &focus_session_repository,
        &report_repository,
        input,
    )
    .await
    {
        Ok(insights) => AppResult::ok(insights),
        Err(FrictionServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(FrictionServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}
