use crate::interface::dto::app_result::AppResult;

#[tauri::command]
pub async fn create_manual_log() -> Result<AppResult<String>, String> {
    Ok(AppResult::err(
        "NOT_IMPLEMENTED",
        "Manual logs are not implemented yet",
    ))
}
