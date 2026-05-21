pub mod activity;
pub mod dashboard;
pub mod git_sync;
pub mod manual_logs;
pub mod project_stats;
pub mod projects;
pub mod reports;
pub mod settings;
pub mod weekly_tasks;
pub mod windows;
pub mod workspaces;

pub fn handlers() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        projects::list_projects,
        projects::create_project,
        projects::update_project,
        projects::archive_project,
        projects::validate_repo_path,
        project_stats::get_project_stats,
        project_stats::get_category_distribution,
        project_stats::get_recent_commits,
        project_stats::get_top_contributors,
        dashboard::get_dashboard_stats,
        dashboard::get_weekly_activity_hours,
        dashboard::get_project_breakdown,
        activity::list_activity,
        activity::get_activity_heatmap,
        activity::get_week_summary,
        activity::get_key_highlights,
        git_sync::sync_commits,
        manual_logs::list_manual_logs,
        manual_logs::create_manual_log,
        manual_logs::update_manual_log,
        manual_logs::delete_manual_log,
        reports::generate_report,
        reports::save_report,
        reports::list_reports,
        reports::get_report,
        settings::get_settings,
        settings::update_settings,
        weekly_tasks::list_weekly_tasks,
        weekly_tasks::create_weekly_task,
        weekly_tasks::update_weekly_task,
        weekly_tasks::delete_weekly_task,
        windows::show_todo_widget,
        windows::hide_todo_widget,
        windows::toggle_todo_widget,
        windows::set_todo_widget_always_on_top,
        workspaces::list_workspaces,
        workspaces::create_workspace,
        workspaces::update_workspace,
        workspaces::archive_workspace,
        workspaces::scan_workspace,
        workspaces::import_workspace_repositories,
        workspaces::ignore_workspace_repository,
        workspaces::unignore_workspace_repository
    ]
}
