use tauri::State;

use crate::domain::project::{CreateProjectInput, Project, UpdateProjectInput};
use crate::infrastructure::database::repositories::ProjectRepository;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<AppResult<Vec<Project>>, String> {
    let repository = ProjectRepository::new(state.database.pool());

    Ok(match repository.list().await {
        Ok(projects) => AppResult::ok(projects),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    input: CreateProjectInput,
) -> Result<AppResult<Project>, String> {
    if input.name.trim().is_empty() {
        return Ok(AppResult::err(
            "VALIDATION_ERROR",
            "Project name is required",
        ));
    }

    let repository = ProjectRepository::new(state.database.pool());

    Ok(match repository.create(input).await {
        Ok(project) => AppResult::ok(project),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    id: String,
    input: UpdateProjectInput,
) -> Result<AppResult<Project>, String> {
    let repository = ProjectRepository::new(state.database.pool());

    Ok(match repository.update(&id, input).await {
        Ok(Some(project)) => AppResult::ok(project),
        Ok(None) => AppResult::err("PROJECT_NOT_FOUND", "Project was not found"),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn archive_project(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<Project>, String> {
    let repository = ProjectRepository::new(state.database.pool());

    Ok(match repository.archive(&id).await {
        Ok(Some(project)) => AppResult::ok(project),
        Ok(None) => AppResult::err("PROJECT_NOT_FOUND", "Project was not found"),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn validate_repo_path(path: String) -> Result<AppResult<bool>, String> {
    Ok(AppResult::ok(
        crate::infrastructure::filesystem::repo_paths::looks_like_git_repository(&path),
    ))
}
