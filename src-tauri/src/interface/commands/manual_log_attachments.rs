use serde::Serialize;
use tauri::{AppHandle, State};

use crate::application::manual_log_attachments::{
    ManualLogAttachmentService, ManualLogAttachmentServiceError,
};
use crate::domain::manual_log_attachment::{ManualLogAttachment, ManualLogAttachmentPreview};
use crate::infrastructure::database::repositories::{
    ManualLogAttachmentRepository, ManualLogRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_manual_log_attachments(
    state: State<'_, AppState>,
    manual_log_id: String,
) -> Result<AppResult<Vec<ManualLogAttachment>>, String> {
    let repository = ManualLogAttachmentRepository::new(state.database.pool());

    Ok(
        match ManualLogAttachmentService::list(&repository, &manual_log_id).await {
            Ok(attachments) => AppResult::ok(attachments),
            Err(error) => manual_log_attachment_error(error),
        },
    )
}

#[tauri::command]
pub async fn add_manual_log_attachment(
    app: AppHandle,
    state: State<'_, AppState>,
    manual_log_id: String,
    source_path: String,
) -> Result<AppResult<ManualLogAttachment>, String> {
    let logs = ManualLogRepository::new(state.database.pool());
    let repository = ManualLogAttachmentRepository::new(state.database.pool());

    Ok(match ManualLogAttachmentService::add(
        &app,
        &logs,
        &repository,
        &manual_log_id,
        &source_path,
    )
    .await
    {
        Ok(attachment) => AppResult::ok(attachment),
        Err(error) => manual_log_attachment_error(error),
    })
}

#[tauri::command]
pub async fn delete_manual_log_attachment(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<bool>, String> {
    let repository = ManualLogAttachmentRepository::new(state.database.pool());

    Ok(match ManualLogAttachmentService::delete(&app, &repository, &id).await {
        Ok(deleted) => AppResult::ok(deleted),
        Err(error) => manual_log_attachment_error(error),
    })
}

#[tauri::command]
pub async fn open_manual_log_attachment(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<bool>, String> {
    let repository = ManualLogAttachmentRepository::new(state.database.pool());

    Ok(match ManualLogAttachmentService::open(&app, &repository, &id).await {
        Ok(opened) => AppResult::ok(opened),
        Err(error) => manual_log_attachment_error(error),
    })
}

#[tauri::command]
pub async fn get_manual_log_attachment_preview(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<Option<ManualLogAttachmentPreview>>, String> {
    let repository = ManualLogAttachmentRepository::new(state.database.pool());

    Ok(match ManualLogAttachmentService::preview(&app, &repository, &id).await {
        Ok(preview) => AppResult::ok(preview),
        Err(error) => manual_log_attachment_error(error),
    })
}

fn manual_log_attachment_error<T: Serialize>(
    error: ManualLogAttachmentServiceError,
) -> AppResult<T> {
    match error {
        ManualLogAttachmentServiceError::Validation(message) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        ManualLogAttachmentServiceError::Database(error) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
        ManualLogAttachmentServiceError::Io(error) => {
            AppResult::err("FILE_ERROR", error.to_string())
        }
    }
}
