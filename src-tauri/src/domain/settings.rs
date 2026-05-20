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
        }
    }
}
