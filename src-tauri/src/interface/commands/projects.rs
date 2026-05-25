use tauri::State;

use crate::application::projects::{ProjectService, ProjectServiceError};
use crate::domain::git_metadata::{GitRef, GitWorktree, ProjectGitFocus, SaveProjectGitFocusInput};
use crate::domain::project::{CreateProjectInput, Project, UpdateProjectInput};
use crate::infrastructure::database::repositories::{GitMetadataRepository, ProjectRepository};
use crate::infrastructure::git::branches::GitBranch;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<AppResult<Vec<Project>>, String> {
    let repository = ProjectRepository::new(state.database.pool());

    Ok(match ProjectService::list(&repository).await {
        Ok(projects) => AppResult::ok(projects),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    input: CreateProjectInput,
) -> Result<AppResult<Project>, String> {
    let repository = ProjectRepository::new(state.database.pool());

    Ok(match ProjectService::create(&repository, input).await {
        Ok(project) => AppResult::ok(project),
        Err(ProjectServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(ProjectServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}

#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    id: String,
    input: UpdateProjectInput,
) -> Result<AppResult<Project>, String> {
    let repository = ProjectRepository::new(state.database.pool());

    Ok(
        match ProjectService::update(&repository, &id, input).await {
            Ok(Some(project)) => AppResult::ok(project),
            Ok(None) => AppResult::err("PROJECT_NOT_FOUND", "Project was not found"),
            Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
        },
    )
}

#[tauri::command]
pub async fn archive_project(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<Project>, String> {
    let repository = ProjectRepository::new(state.database.pool());

    Ok(match ProjectService::archive(&repository, &id).await {
        Ok(Some(project)) => AppResult::ok(project),
        Ok(None) => AppResult::err("PROJECT_NOT_FOUND", "Project was not found"),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn validate_repo_path(path: String) -> Result<AppResult<bool>, String> {
    Ok(AppResult::ok(ProjectService::validate_repo_path(&path)))
}

#[tauri::command]
pub async fn list_git_branches(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<AppResult<Vec<GitBranch>>, String> {
    let repository = ProjectRepository::new(state.database.pool());
    let git_metadata_repository = GitMetadataRepository::new(state.database.pool());

    Ok(
        match ProjectService::list_git_branches(&repository, &git_metadata_repository, &project_id)
            .await
        {
            Ok(branches) => AppResult::ok(branches),
            Err(ProjectServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(ProjectServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn list_git_refs(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<AppResult<Vec<GitRef>>, String> {
    let repository = ProjectRepository::new(state.database.pool());
    let git_metadata_repository = GitMetadataRepository::new(state.database.pool());

    Ok(
        match ProjectService::list_git_refs(&repository, &git_metadata_repository, &project_id)
            .await
        {
            Ok(refs) => AppResult::ok(refs),
            Err(ProjectServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(ProjectServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn list_git_worktrees(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<AppResult<Vec<GitWorktree>>, String> {
    let repository = ProjectRepository::new(state.database.pool());
    let git_metadata_repository = GitMetadataRepository::new(state.database.pool());

    Ok(
        match ProjectService::list_git_worktrees(&repository, &git_metadata_repository, &project_id)
            .await
        {
            Ok(branches) => AppResult::ok(branches),
            Err(ProjectServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(ProjectServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn get_project_git_focus(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<AppResult<ProjectGitFocus>, String> {
    let repository = ProjectRepository::new(state.database.pool());
    let git_metadata_repository = GitMetadataRepository::new(state.database.pool());

    Ok(
        match ProjectService::get_project_git_focus(
            &repository,
            &git_metadata_repository,
            &project_id,
        )
        .await
        {
            Ok(focus) => AppResult::ok(focus),
            Err(ProjectServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(ProjectServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn save_project_git_focus(
    state: State<'_, AppState>,
    input: SaveProjectGitFocusInput,
) -> Result<AppResult<ProjectGitFocus>, String> {
    let repository = ProjectRepository::new(state.database.pool());
    let git_metadata_repository = GitMetadataRepository::new(state.database.pool());

    Ok(
        match ProjectService::save_project_git_focus(&repository, &git_metadata_repository, input)
            .await
        {
            Ok(focus) => AppResult::ok(focus),
            Err(ProjectServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(ProjectServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}
