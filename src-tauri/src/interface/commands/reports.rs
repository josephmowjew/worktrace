use crate::interface::dto::app_result::AppResult;

#[tauri::command]
pub async fn list_reports() -> Result<AppResult<Vec<String>>, String> {
    Ok(AppResult::ok(Vec::new()))
}
