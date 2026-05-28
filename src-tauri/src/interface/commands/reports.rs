use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::application::report_ai::{ReportAiError, ReportAiService};
use crate::application::reports::{ReportService, ReportServiceError};
use crate::domain::report::{
    ConnectReportAiProviderInput, GenerateReportInput, GeneratedReport, ListReportNotesInput,
    Report, ReportAiModelList, ReportAiStatus, ReportNote, ReportPolishInput, ReportPolishResult,
    ReportReadinessAnalysis, ReportReadinessInput, ReportSummary, SaveDailyReviewNoteInput,
    SaveReportInput, TestReportAiProviderInput,
};
use crate::infrastructure::database::repositories::{
    ActivityGroupRepository, ActivityRepository, GitMetadataRepository, ProjectRepository,
    ReportNoteRepository, ReportRepository, SettingsRepository, WeeklyTaskRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn generate_report(
    state: State<'_, AppState>,
    input: GenerateReportInput,
) -> Result<AppResult<GeneratedReport>, String> {
    let activity_repository = ActivityRepository::new(state.database.pool());
    let activity_group_repository = ActivityGroupRepository::new(state.database.pool());
    let weekly_task_repository = WeeklyTaskRepository::new(state.database.pool());
    let report_note_repository = ReportNoteRepository::new(state.database.pool());
    let git_metadata_repository = GitMetadataRepository::new(state.database.pool());

    Ok(
        match ReportService::generate(
            &activity_repository,
            &activity_group_repository,
            &weekly_task_repository,
            &report_note_repository,
            &git_metadata_repository,
            input,
        )
        .await
        {
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
pub async fn list_report_notes(
    state: State<'_, AppState>,
    input: ListReportNotesInput,
) -> Result<AppResult<Vec<ReportNote>>, String> {
    let report_note_repository = ReportNoteRepository::new(state.database.pool());

    Ok(
        match ReportService::list_notes(&report_note_repository, input).await {
            Ok(notes) => AppResult::ok(notes),
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
pub async fn save_daily_review_note(
    state: State<'_, AppState>,
    input: SaveDailyReviewNoteInput,
) -> Result<AppResult<ReportNote>, String> {
    let report_note_repository = ReportNoteRepository::new(state.database.pool());

    Ok(
        match ReportService::save_daily_review_note(&report_note_repository, input).await {
            Ok(note) => AppResult::ok(note),
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

#[tauri::command]
pub async fn get_report_ai_status(
    state: State<'_, AppState>,
) -> Result<AppResult<ReportAiStatus>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());

    Ok(match ReportAiService::status(&settings_repository).await {
        Ok(status) => AppResult::ok(status),
        Err(error) => report_ai_error(error),
    })
}

#[tauri::command]
pub async fn connect_report_ai_provider(
    input: ConnectReportAiProviderInput,
) -> Result<AppResult<()>, String> {
    Ok(match ReportAiService::connect_provider(input).await {
        Ok(()) => AppResult::ok(()),
        Err(error) => report_ai_error(error),
    })
}

#[tauri::command]
pub async fn test_report_ai_provider(
    state: State<'_, AppState>,
    input: TestReportAiProviderInput,
) -> Result<AppResult<String>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());

    Ok(
        match ReportAiService::test_provider(&settings_repository, input).await {
            Ok(message) => AppResult::ok(message),
            Err(error) => report_ai_error(error),
        },
    )
}

#[tauri::command]
pub async fn disconnect_report_ai_provider(
    input: TestReportAiProviderInput,
) -> Result<AppResult<()>, String> {
    Ok(match ReportAiService::disconnect_provider(input) {
        Ok(()) => AppResult::ok(()),
        Err(error) => report_ai_error(error),
    })
}

#[tauri::command]
pub async fn list_report_ai_provider_models(
    input: TestReportAiProviderInput,
) -> Result<AppResult<ReportAiModelList>, String> {
    Ok(match ReportAiService::list_provider_models(input).await {
        Ok(models) => AppResult::ok(models),
        Err(error) => report_ai_error(error),
    })
}

#[tauri::command]
pub async fn polish_report(
    app: AppHandle,
    state: State<'_, AppState>,
    input: ReportPolishInput,
) -> Result<AppResult<ReportPolishResult>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());
    let activity_repository = ActivityRepository::new(state.database.pool());
    let activity_group_repository = ActivityGroupRepository::new(state.database.pool());
    let weekly_task_repository = WeeklyTaskRepository::new(state.database.pool());
    let report_note_repository = ReportNoteRepository::new(state.database.pool());
    let project_repository = ProjectRepository::new(state.database.pool());
    let git_metadata_repository = GitMetadataRepository::new(state.database.pool());

    Ok(
        match ReportAiService::polish(
            Some(&app),
            &settings_repository,
            &activity_repository,
            &activity_group_repository,
            &weekly_task_repository,
            &report_note_repository,
            &project_repository,
            &git_metadata_repository,
            input,
        )
        .await
        {
            Ok(result) => AppResult::ok(result),
            Err(error) => report_ai_error(error),
        },
    )
}

#[tauri::command]
pub async fn analyze_report_readiness(
    state: State<'_, AppState>,
    input: ReportReadinessInput,
) -> Result<AppResult<ReportReadinessAnalysis>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());
    let activity_repository = ActivityRepository::new(state.database.pool());
    let activity_group_repository = ActivityGroupRepository::new(state.database.pool());
    let weekly_task_repository = WeeklyTaskRepository::new(state.database.pool());
    let report_note_repository = ReportNoteRepository::new(state.database.pool());
    let project_repository = ProjectRepository::new(state.database.pool());
    let git_metadata_repository = GitMetadataRepository::new(state.database.pool());

    Ok(
        match ReportAiService::analyze_readiness(
            &settings_repository,
            &activity_repository,
            &activity_group_repository,
            &weekly_task_repository,
            &report_note_repository,
            &project_repository,
            &git_metadata_repository,
            input,
        )
        .await
        {
            Ok(result) => AppResult::ok(result),
            Err(error) => report_ai_error(error),
        },
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelReportAiStreamInput {
    pub stream_id: String,
}

#[tauri::command]
pub async fn cancel_report_ai_stream(
    state: State<'_, AppState>,
    input: CancelReportAiStreamInput,
) -> Result<AppResult<()>, String> {
    if input.stream_id.trim().is_empty() {
        return Ok(AppResult::err(
            "VALIDATION_ERROR",
            "Report AI stream id is required.",
        ));
    }

    match state.cancelled_report_ai_streams.lock() {
        Ok(mut streams) => {
            streams.insert(input.stream_id);
            Ok(AppResult::ok(()))
        }
        Err(error) => Ok(AppResult::err("REPORT_AI_CANCEL_FAILED", error.to_string())),
    }
}

fn report_ai_error<T: serde::Serialize>(error: ReportAiError) -> AppResult<T> {
    match error {
        ReportAiError::Validation(message) => AppResult::err("VALIDATION_ERROR", message),
        ReportAiError::Database(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
        ReportAiError::Keyring(message) => AppResult::err("KEYRING_ERROR", message),
        ReportAiError::Provider(message) => AppResult::err("AI_PROVIDER_ERROR", message),
    }
}
