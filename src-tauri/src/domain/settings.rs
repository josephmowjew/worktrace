use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Settings {
    pub name: String,
    pub email: String,
    pub default_manager_name: String,
    pub git_author_email: String,
    pub default_report_template: String,
    pub working_days: Vec<String>,
    pub theme: String,
}
