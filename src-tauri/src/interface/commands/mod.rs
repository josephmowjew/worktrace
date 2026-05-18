pub mod activity;
pub mod git_sync;
pub mod manual_logs;
pub mod projects;
pub mod reports;
pub mod settings;

pub fn handlers() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        projects::list_projects,
        projects::create_project,
        projects::update_project,
        projects::archive_project,
        projects::validate_repo_path,
        activity::list_activity,
        git_sync::sync_commits,
        manual_logs::create_manual_log,
        reports::list_reports,
        settings::get_settings
    ]
}
