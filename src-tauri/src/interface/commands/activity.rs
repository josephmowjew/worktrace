use crate::domain::activity::ActivityDay;
use crate::interface::dto::app_result::AppResult;

#[tauri::command]
pub async fn list_activity() -> Result<AppResult<Vec<ActivityDay>>, String> {
    Ok(AppResult::ok(Vec::new()))
}
