use serde::Serialize;
use tauri::{AppHandle, State};

use crate::application::task_attachments::{
    TaskAttachmentService, TaskAttachmentServiceError,
};
use crate::domain::task_attachment::{TaskAttachment, TaskAttachmentPreview};
use crate::infrastructure::database::repositories::{
    TaskAttachmentRepository, WeeklyTaskRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_task_attachments(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<AppResult<Vec<TaskAttachment>>, String> {
    let repository = TaskAttachmentRepository::new(state.database.pool());

    Ok(match TaskAttachmentService::list(&repository, &task_id).await {
        Ok(attachments) => AppResult::ok(attachments),
        Err(error) => task_attachment_error(error),
    })
}

#[tauri::command]
pub async fn add_task_attachment(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    source_path: String,
) -> Result<AppResult<TaskAttachment>, String> {
    let tasks = WeeklyTaskRepository::new(state.database.pool());
    let repository = TaskAttachmentRepository::new(state.database.pool());

    Ok(
        match TaskAttachmentService::add(&app, &tasks, &repository, &task_id, &source_path).await {
            Ok(attachment) => AppResult::ok(attachment),
            Err(error) => task_attachment_error(error),
        },
    )
}

#[tauri::command]
pub async fn delete_task_attachment(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<bool>, String> {
    let repository = TaskAttachmentRepository::new(state.database.pool());

    Ok(match TaskAttachmentService::delete(&app, &repository, &id).await {
        Ok(deleted) => AppResult::ok(deleted),
        Err(error) => task_attachment_error(error),
    })
}

#[tauri::command]
pub async fn open_task_attachment(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<bool>, String> {
    let repository = TaskAttachmentRepository::new(state.database.pool());

    Ok(match TaskAttachmentService::open(&app, &repository, &id).await {
        Ok(opened) => AppResult::ok(opened),
        Err(error) => task_attachment_error(error),
    })
}

#[tauri::command]
pub async fn get_task_attachment_preview(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<Option<TaskAttachmentPreview>>, String> {
    let repository = TaskAttachmentRepository::new(state.database.pool());

    Ok(match TaskAttachmentService::preview(&app, &repository, &id).await {
        Ok(preview) => AppResult::ok(preview),
        Err(error) => task_attachment_error(error),
    })
}

fn task_attachment_error<T: Serialize>(error: TaskAttachmentServiceError) -> AppResult<T> {
    match error {
        TaskAttachmentServiceError::Validation(message) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        TaskAttachmentServiceError::Database(error) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
        TaskAttachmentServiceError::Io(error) => {
            AppResult::err("FILE_ERROR", error.to_string())
        }
    }
}
