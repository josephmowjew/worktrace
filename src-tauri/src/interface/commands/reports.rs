use tauri::State;

use crate::application::reports::{ReportService, ReportServiceError};
use crate::domain::report::{
    GenerateReportInput, GeneratedReport, Report, ReportSummary, SaveReportInput,
};
use crate::infrastructure::database::repositories::{
    ActivityRepository, ReportRepository, WeeklyTaskRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn generate_report(
    state: State<'_, AppState>,
    input: GenerateReportInput,
) -> Result<AppResult<GeneratedReport>, String> {
    let activity_repository = ActivityRepository::new(state.database.pool());
    let weekly_task_repository = WeeklyTaskRepository::new(state.database.pool());

    Ok(
        match ReportService::generate(&activity_repository, &weekly_task_repository, input).await {
            Ok(report) => AppResult::ok(report),
            Err(ReportServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(ReportServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn save_report(
    state: State<'_, AppState>,
    input: SaveReportInput,
) -> Result<AppResult<Report>, String> {
    let report_repository = ReportRepository::new(state.database.pool());

    Ok(match ReportService::save(&report_repository, input).await {
        Ok(report) => AppResult::ok(report),
        Err(ReportServiceError::Validation(message)) => AppResult::err("VALIDATION_ERROR", message),
        Err(ReportServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn list_reports(
    state: State<'_, AppState>,
) -> Result<AppResult<Vec<ReportSummary>>, String> {
    let report_repository = ReportRepository::new(state.database.pool());

    Ok(match ReportService::list(&report_repository).await {
        Ok(reports) => AppResult::ok(reports),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn get_report(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<Report>, String> {
    let report_repository = ReportRepository::new(state.database.pool());

    Ok(match ReportService::get(&report_repository, &id).await {
        Ok(Some(report)) => AppResult::ok(report),
        Ok(None) => AppResult::err("REPORT_NOT_FOUND", "Report was not found"),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}
