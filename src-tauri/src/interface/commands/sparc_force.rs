use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::application::sparc_force::{SparcForceError, SparcForceService};
use crate::application::weekly_tasks::{WeeklyTaskService, WeeklyTaskServiceError};
use crate::domain::sparc_force::{
    ConnectSparcForceInput, ImportSparcForceTaskInput, ImportSparcForceTaskOutcome,
    ListSparcForceRecordsInput, SparcForceImportedData, SparcForceImportedItem,
    SparcForceIntegrationStatus, SparcForceLoginOutcome, SparcForceRecordQueryResult,
    SparcForceSyncResult, VerifySparcForceOtpInput,
};
use crate::domain::weekly_task::{
    CreateWeeklyTaskInput, WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType,
};
use crate::infrastructure::database::repositories::{
    SparcForceConnectionRepository, WeeklyTaskRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn get_sparc_force_integration_status(
    state: State<'_, AppState>,
) -> Result<AppResult<SparcForceIntegrationStatus>, String> {
    let repository = SparcForceConnectionRepository::new(state.database.pool());

    Ok(match SparcForceService::status(&repository).await {
        Ok(status) => AppResult::ok(status),
        Err(error) => sparc_force_error(error),
    })
}

#[tauri::command]
pub async fn connect_sparc_force(
    state: State<'_, AppState>,
    input: ConnectSparcForceInput,
) -> Result<AppResult<SparcForceLoginOutcome>, String> {
    let _guard = state.sparc_force_auth_lock.lock().await;
    let repository = SparcForceConnectionRepository::new(state.database.pool());

    Ok(match SparcForceService::connect(&repository, input).await {
        Ok(outcome) => AppResult::ok(outcome),
        Err(error) => sparc_force_error(error),
    })
}

#[tauri::command]
pub async fn verify_sparc_force_login_otp(
    state: State<'_, AppState>,
    input: VerifySparcForceOtpInput,
) -> Result<AppResult<SparcForceIntegrationStatus>, String> {
    let _guard = state.sparc_force_auth_lock.lock().await;
    let repository = SparcForceConnectionRepository::new(state.database.pool());

    Ok(
        match SparcForceService::verify_otp(&repository, input).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => sparc_force_error(error),
        },
    )
}

#[tauri::command]
pub async fn test_sparc_force_connection(
    state: State<'_, AppState>,
) -> Result<AppResult<SparcForceIntegrationStatus>, String> {
    let _guard = state.sparc_force_auth_lock.lock().await;
    let repository = SparcForceConnectionRepository::new(state.database.pool());

    Ok(
        match SparcForceService::test_connection(&repository).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => sparc_force_error(error),
        },
    )
}

#[tauri::command]
pub async fn sync_sparc_force(
    state: State<'_, AppState>,
) -> Result<AppResult<SparcForceSyncResult>, String> {
    let _guard = state.sparc_force_auth_lock.lock().await;
    let repository = SparcForceConnectionRepository::new(state.database.pool());

    Ok(match SparcForceService::sync(&repository).await {
        Ok(result) => AppResult::ok(result),
        Err(error) => sparc_force_error(error),
    })
}

#[tauri::command]
pub async fn list_sparc_force_imported_data(
    state: State<'_, AppState>,
) -> Result<AppResult<SparcForceImportedData>, String> {
    let repository = SparcForceConnectionRepository::new(state.database.pool());

    Ok(match SparcForceService::imported_data(&repository).await {
        Ok(data) => AppResult::ok(data),
        Err(error) => sparc_force_error(error),
    })
}

#[tauri::command]
pub async fn list_sparc_force_records(
    state: State<'_, AppState>,
    input: ListSparcForceRecordsInput,
) -> Result<AppResult<SparcForceRecordQueryResult>, String> {
    let repository = SparcForceConnectionRepository::new(state.database.pool());

    Ok(
        match SparcForceService::list_records(&repository, input).await {
            Ok(data) => AppResult::ok(data),
            Err(error) => sparc_force_error(error),
        },
    )
}

#[tauri::command]
pub async fn get_sparc_force_case_detail(
    state: State<'_, AppState>,
    external_id: String,
) -> Result<AppResult<SparcForceImportedItem>, String> {
    let repository = SparcForceConnectionRepository::new(state.database.pool());

    Ok(
        match SparcForceService::get_case_detail(&repository, external_id).await {
            Ok(item) => AppResult::ok(item),
            Err(error) => sparc_force_error(error),
        },
    )
}

#[tauri::command]
pub async fn disconnect_sparc_force(
    state: State<'_, AppState>,
) -> Result<AppResult<SparcForceIntegrationStatus>, String> {
    let _guard = state.sparc_force_auth_lock.lock().await;
    let repository = SparcForceConnectionRepository::new(state.database.pool());

    Ok(match SparcForceService::disconnect(&repository).await {
        Ok(status) => AppResult::ok(status),
        Err(error) => sparc_force_error(error),
    })
}

#[tauri::command]
pub async fn import_sparc_force_task_to_weekly_task(
    state: State<'_, AppState>,
    input: ImportSparcForceTaskInput,
) -> Result<AppResult<ImportSparcForceTaskOutcome>, String> {
    let sparc_repository = SparcForceConnectionRepository::new(state.database.pool());
    let weekly_repository = WeeklyTaskRepository::new(state.database.pool());

    let lookup_source = input.external_kind.as_deref().unwrap_or(&input.source);
    let record = match sparc_repository
        .find_task_record(lookup_source, &input.external_id)
        .await
    {
        Ok(Some(record)) => record,
        Ok(None) => {
            return Ok(AppResult::err(
                "SPARC_FORCE_TASK_NOT_FOUND",
                "The selected Sparc Force task could not be found.",
            ));
        }
        Err(error) => return Ok(AppResult::err("DATABASE_ERROR", error.to_string())),
    };

    if let Ok(Some(existing_id)) = sparc_repository
        .linked_weekly_task_id("task", lookup_source, &input.external_id)
        .await
    {
        if let Ok(Some(task)) = weekly_repository.find(&existing_id).await {
            return Ok(AppResult::ok(ImportSparcForceTaskOutcome {
                task,
                already_imported: true,
            }));
        }
    }

    let create_input = create_weekly_task_from_sparc_force(&record, &input);
    let task = match WeeklyTaskService::create(&weekly_repository, create_input).await {
        Ok(task) => task,
        Err(WeeklyTaskServiceError::Validation(message)) => {
            return Ok(AppResult::err("VALIDATION_ERROR", message));
        }
        Err(WeeklyTaskServiceError::Database(error)) => {
            return Ok(AppResult::err("DATABASE_ERROR", error.to_string()));
        }
    };

    if let Err(error) = sparc_repository
        .save_weekly_task_link("task", lookup_source, &input.external_id, &task.id)
        .await
    {
        return Ok(AppResult::err("DATABASE_ERROR", error.to_string()));
    }

    Ok(AppResult::ok(ImportSparcForceTaskOutcome {
        task,
        already_imported: false,
    }))
}

fn sparc_force_error<T: Serialize>(error: SparcForceError) -> AppResult<T> {
    match error {
        SparcForceError::Validation(message) => AppResult::err("VALIDATION_ERROR", message),
        SparcForceError::Database(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
        SparcForceError::Keyring(message) => AppResult::err("SECRET_STORAGE_ERROR", message),
        SparcForceError::Provider(message) => AppResult::err("SPARC_FORCE_ERROR", message),
        SparcForceError::StandaloneTasksDisabled => AppResult::err(
            "STANDALONE_TASKS_DISABLED",
            "Sparc Force standalone tasks are disabled.",
        ),
    }
}

fn create_weekly_task_from_sparc_force(
    record: &SparcForceImportedItem,
    input: &ImportSparcForceTaskInput,
) -> CreateWeeklyTaskInput {
    let raw = serde_json::from_str::<Value>(&record.raw_json).unwrap_or(Value::Null);
    let due_date = input.target_date.clone().or_else(|| {
        value_string(&raw, &["due_Date", "dueDate"])
            .and_then(|value| value.get(0..10).map(str::to_string))
    });
    let completed_at = input.completed_at.clone().or_else(|| {
        value_string(&raw, &["completion_Date", "completionDate"])
            .and_then(|value| value.get(0..10).map(str::to_string))
    });
    let details = input
        .details
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| sparc_force_task_details(record, &raw));
    let title = input
        .title
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| record.title.clone());

    CreateWeeklyTaskInput {
        project_id: None,
        task_type: WeeklyTaskType::PlannedWork,
        status: Some(
            input
                .status
                .clone()
                .unwrap_or_else(|| status_from_sparc_force(record.status.as_deref())),
        ),
        title,
        details: Some(details),
        week_start_date: input.week_start_date.clone(),
        target_date: due_date,
        completed_at,
        priority: Some(
            input
                .priority
                .clone()
                .unwrap_or_else(|| priority_from_sparc_force(record.priority.as_deref())),
        ),
        included_in_report: Some(input.included_in_report.unwrap_or(true)),
        progress_percent: input.progress_percent.or_else(|| {
            value_i64(&raw, &["completion_Percentage", "completionPercentage"])
                .map(|value| value as i32)
        }),
        estimated_minutes: input.estimated_minutes.or_else(|| {
            value_i64(&raw, &["estimated_Hours", "estimatedHours"]).map(|hours| (hours as i32) * 60)
        }),
    }
}

fn sparc_force_task_details(record: &SparcForceImportedItem, raw: &Value) -> String {
    let mut lines = Vec::new();
    if let Some(description) = value_string(raw, &["task_Description", "taskDescription"]) {
        lines.push(description);
    }
    if let Some(notes) = value_string(raw, &["notes"]) {
        lines.push(format!("Notes: {notes}"));
    }
    if let Some(case_title) = value_string(
        raw,
        &["case_Title", "caseTitle", "case_Number", "caseNumber"],
    ) {
        lines.push(format!("Sparc Force case: {case_title}"));
    }
    if let Some(project_name) = value_string(
        raw,
        &["project_Name", "projectName", "project_Code", "projectCode"],
    ) {
        lines.push(format!("Sparc Force project: {project_name}"));
    }
    lines.push(format!(
        "Imported from Sparc Force task {} ({})",
        record.external_id,
        record.source.as_deref().unwrap_or("task")
    ));
    lines.join("\n\n")
}

fn status_from_sparc_force(status: Option<&str>) -> WeeklyTaskStatus {
    let normalized = status.unwrap_or("").to_lowercase();
    if normalized.contains("complete")
        || normalized.contains("resolved")
        || normalized.contains("closed")
    {
        WeeklyTaskStatus::Completed
    } else if normalized.contains("progress") {
        WeeklyTaskStatus::InProgress
    } else if normalized.contains("block") || normalized.contains("hold") {
        WeeklyTaskStatus::Blocked
    } else {
        WeeklyTaskStatus::Todo
    }
}

fn priority_from_sparc_force(priority: Option<&str>) -> WeeklyTaskPriority {
    let normalized = priority.unwrap_or("").to_lowercase();
    if normalized.contains("high") || normalized.contains("critical") {
        WeeklyTaskPriority::High
    } else if normalized.contains("low") {
        WeeklyTaskPriority::Low
    } else {
        WeeklyTaskPriority::Normal
    }
}

fn value_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|field| {
            field
                .as_str()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
                .or_else(|| field.as_i64().map(|number| number.to_string()))
        })
    })
}

fn value_i64(value: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(|field| field.as_i64()))
}
