use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub name: String,
    pub email: String,
    pub default_manager_name: String,
    pub git_author_email: String,
    pub default_report_template: String,
    pub working_days: Vec<String>,
    pub theme: String,
    pub backup_enabled: bool,
    pub backup_schedule: String,
    pub backup_time: String,
    pub backup_day: String,
    pub backup_storage_mode: String,
    pub backup_storage_location: String,
    pub online_backup_status: String,
    pub online_backup_provider: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupLocationValidation {
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsInput {
    pub name: Option<String>,
    pub email: Option<String>,
    pub default_manager_name: Option<String>,
    pub git_author_email: Option<String>,
    pub default_report_template: Option<String>,
    pub working_days: Option<Vec<String>>,
    pub theme: Option<String>,
    pub backup_enabled: Option<bool>,
    pub backup_schedule: Option<String>,
    pub backup_time: Option<String>,
    pub backup_day: Option<String>,
    pub backup_storage_mode: Option<String>,
    pub backup_storage_location: Option<String>,
    pub online_backup_status: Option<String>,
    pub online_backup_provider: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
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
            backup_enabled: false,
            backup_schedule: "daily".to_string(),
            backup_time: "17:00".to_string(),
            backup_day: "friday".to_string(),
            backup_storage_mode: "local".to_string(),
            backup_storage_location: String::new(),
            online_backup_status: "research".to_string(),
            online_backup_provider: String::new(),
        }
    }
}
