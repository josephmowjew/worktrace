use serde::Serialize;
use tauri::State;

use crate::application::github::{GitHubService, GitHubServiceError};
use crate::domain::github::{
    ConnectGitHubPatInput, CreateGitHubPullRequestInput, CreateGitHubPullRequestOutput,
    GitHubIntegrationStatus,
};
use crate::infrastructure::database::repositories::{ProjectRepository, SettingsRepository};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn get_github_integration_status(
    state: State<'_, AppState>,
) -> Result<AppResult<GitHubIntegrationStatus>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());

    Ok(match GitHubService::status(&settings_repository).await {
        Ok(status) => AppResult::ok(status),
        Err(error) => github_error(error),
    })
}

#[tauri::command]
pub async fn connect_github_pat(
    state: State<'_, AppState>,
    input: ConnectGitHubPatInput,
) -> Result<AppResult<GitHubIntegrationStatus>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());

    Ok(
        match GitHubService::connect_pat(&settings_repository, input).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => github_error(error),
        },
    )
}

#[tauri::command]
pub async fn test_github_connection(
    state: State<'_, AppState>,
) -> Result<AppResult<GitHubIntegrationStatus>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());

    Ok(
        match GitHubService::test_connection(&settings_repository).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => github_error(error),
        },
    )
}

#[tauri::command]
pub async fn disconnect_github(
    state: State<'_, AppState>,
) -> Result<AppResult<GitHubIntegrationStatus>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());

    Ok(
        match GitHubService::disconnect(&settings_repository).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => github_error(error),
        },
    )
}

#[tauri::command]
pub async fn create_github_pull_request(
    state: State<'_, AppState>,
    input: CreateGitHubPullRequestInput,
) -> Result<AppResult<CreateGitHubPullRequestOutput>, String> {
    let project_repository = ProjectRepository::new(state.database.pool());

    Ok(
        match GitHubService::create_pull_request(&project_repository, input).await {
            Ok(output) => AppResult::ok(output),
            Err(error) => github_error(error),
        },
    )
}

fn github_error<T: Serialize>(error: GitHubServiceError) -> AppResult<T> {
    match error {
        GitHubServiceError::Validation(message) => AppResult::err("VALIDATION_ERROR", message),
        GitHubServiceError::Database(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
        GitHubServiceError::Git(message) => AppResult::err("GIT_ERROR", message),
        GitHubServiceError::GitHub(message) => AppResult::err("GITHUB_ERROR", message),
        GitHubServiceError::SecretStorage(message) => {
            AppResult::err("SECRET_STORAGE_ERROR", message)
        }
    }
}
