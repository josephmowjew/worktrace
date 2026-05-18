use crate::domain::settings::Settings;
use crate::interface::dto::app_result::AppResult;

#[tauri::command]
pub async fn get_settings() -> Result<AppResult<Settings>, String> {
    Ok(AppResult::ok(Settings {
        name: "John Developer".to_string(),
        email: "johndev@worktrace.app".to_string(),
        default_manager_name: String::new(),
        git_author_email: String::new(),
        default_report_template: "professional_weekly_summary".to_string(),
        working_days: vec![
            "monday".to_string(),
            "tuesday".to_string(),
            "wednesday".to_string(),
            "thursday".to_string(),
            "friday".to_string(),
        ],
        theme: "dark".to_string(),
    }))
}
