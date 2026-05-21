use serde::Serialize;
use tauri::State;

use crate::application::workspaces::{WorkspaceService, WorkspaceServiceError};
use crate::domain::project::Project;
use crate::domain::workspace::{
    CreateWorkspaceInput, ImportWorkspaceRepositoriesInput, UpdateWorkspaceInput, Workspace,
    WorkspaceRepoDiscovery, WorkspaceRepositoryActionInput,
};
use crate::infrastructure::database::repositories::WorkspaceRepository;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_workspaces(
    state: State<'_, AppState>,
) -> Result<AppResult<Vec<Workspace>>, String> {
    let repository = WorkspaceRepository::new(state.database.pool());

    Ok(match WorkspaceService::list(&repository).await {
        Ok(workspaces) => AppResult::ok(workspaces),
        Err(error) => workspace_error(error),
    })
}

#[tauri::command]
pub async fn create_workspace(
    state: State<'_, AppState>,
    input: CreateWorkspaceInput,
) -> Result<AppResult<Workspace>, String> {
    let repository = WorkspaceRepository::new(state.database.pool());

    Ok(match WorkspaceService::create(&repository, input).await {
        Ok(workspace) => AppResult::ok(workspace),
        Err(error) => workspace_error(error),
    })
}

#[tauri::command]
pub async fn update_workspace(
    state: State<'_, AppState>,
    id: String,
    input: UpdateWorkspaceInput,
) -> Result<AppResult<Workspace>, String> {
    let repository = WorkspaceRepository::new(state.database.pool());

    Ok(
        match WorkspaceService::update(&repository, &id, input).await {
            Ok(Some(workspace)) => AppResult::ok(workspace),
            Ok(None) => AppResult::err("WORKSPACE_NOT_FOUND", "Workspace was not found"),
            Err(error) => workspace_error(error),
        },
    )
}

#[tauri::command]
pub async fn archive_workspace(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<Workspace>, String> {
    let repository = WorkspaceRepository::new(state.database.pool());

    Ok(match WorkspaceService::archive(&repository, &id).await {
        Ok(Some(workspace)) => AppResult::ok(workspace),
        Ok(None) => AppResult::err("WORKSPACE_NOT_FOUND", "Workspace was not found"),
        Err(error) => workspace_error(error),
    })
}

#[tauri::command]
pub async fn scan_workspace(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<Vec<WorkspaceRepoDiscovery>>, String> {
    let repository = WorkspaceRepository::new(state.database.pool());

    Ok(match WorkspaceService::scan(&repository, &id).await {
        Ok(discoveries) => AppResult::ok(discoveries),
        Err(error) => workspace_error(error),
    })
}

#[tauri::command]
pub async fn import_workspace_repositories(
    state: State<'_, AppState>,
    input: ImportWorkspaceRepositoriesInput,
) -> Result<AppResult<Vec<Project>>, String> {
    let repository = WorkspaceRepository::new(state.database.pool());

    Ok(
        match WorkspaceService::import_repositories(&repository, input).await {
            Ok(projects) => AppResult::ok(projects),
            Err(error) => workspace_error(error),
        },
    )
}

#[tauri::command]
pub async fn ignore_workspace_repository(
    state: State<'_, AppState>,
    input: WorkspaceRepositoryActionInput,
) -> Result<AppResult<()>, String> {
    let repository = WorkspaceRepository::new(state.database.pool());

    Ok(
        match WorkspaceService::ignore_repository(&repository, input).await {
            Ok(()) => AppResult::ok(()),
            Err(error) => workspace_error(error),
        },
    )
}

#[tauri::command]
pub async fn unignore_workspace_repository(
    state: State<'_, AppState>,
    input: WorkspaceRepositoryActionInput,
) -> Result<AppResult<()>, String> {
    let repository = WorkspaceRepository::new(state.database.pool());

    Ok(
        match WorkspaceService::unignore_repository(&repository, input).await {
            Ok(()) => AppResult::ok(()),
            Err(error) => workspace_error(error),
        },
    )
}

fn workspace_error<T: Serialize>(error: WorkspaceServiceError) -> AppResult<T> {
    match error {
        WorkspaceServiceError::Validation(message) => AppResult::err("VALIDATION_ERROR", message),
        WorkspaceServiceError::Database(error) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    }
}
