use serde::Serialize;
use tauri::{AppHandle, State};

use crate::application::github::{GitHubService, GitHubServiceError};
use crate::domain::github::{
    CompleteGitHubDeviceAuthInput, CompleteGitHubDeviceAuthOutput, ConnectGitHubPatInput,
    CreateGitHubPullRequestInput, CreateGitHubPullRequestOutput, DetectProjectGitHubBindingInput,
    DetectProjectGitHubBindingOutput, GitHubAccount, GitHubAccountActionInput,
    GitHubAccountsStatus, GitHubIntegrationStatus, StartGitHubDeviceAuthOutput,
    SyncGitHubProjectActivityInput, SyncGitHubProjectActivityOutput,
};
use crate::infrastructure::database::repositories::{
    GitHubRepository, ProjectRepository, SettingsRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn get_github_integration_status(
    state: State<'_, AppState>,
) -> Result<AppResult<GitHubIntegrationStatus>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::status(&settings_repository, &github_repository).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => github_error(error),
        },
    )
}

#[tauri::command]
pub async fn list_github_accounts(
    state: State<'_, AppState>,
) -> Result<AppResult<GitHubAccountsStatus>, String> {
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::list_accounts(&github_repository).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => github_error(error),
        },
    )
}

#[tauri::command]
pub async fn start_github_device_auth(
    app: AppHandle,
) -> Result<AppResult<StartGitHubDeviceAuthOutput>, String> {
    Ok(match GitHubService::start_device_auth(&app).await {
        Ok(output) => AppResult::ok(output),
        Err(error) => github_error(error),
    })
}

#[tauri::command]
pub async fn complete_github_device_auth(
    state: State<'_, AppState>,
    input: CompleteGitHubDeviceAuthInput,
) -> Result<AppResult<CompleteGitHubDeviceAuthOutput>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::complete_device_auth(&settings_repository, &github_repository, input)
            .await
        {
            Ok(output) => AppResult::ok(output),
            Err(error) => github_error(error),
        },
    )
}

#[tauri::command]
pub async fn connect_github_pat(
    state: State<'_, AppState>,
    input: ConnectGitHubPatInput,
) -> Result<AppResult<GitHubIntegrationStatus>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::connect_pat(&settings_repository, &github_repository, input).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => github_error(error),
        },
    )
}

#[tauri::command]
pub async fn test_github_account(
    state: State<'_, AppState>,
    input: GitHubAccountActionInput,
) -> Result<AppResult<GitHubAccount>, String> {
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::test_account(&github_repository, input).await {
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
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::test_connection(&settings_repository, &github_repository).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => github_error(error),
        },
    )
}

#[tauri::command]
pub async fn disconnect_github_account(
    state: State<'_, AppState>,
    input: GitHubAccountActionInput,
) -> Result<AppResult<GitHubAccountsStatus>, String> {
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::disconnect_account(&github_repository, input).await {
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
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::disconnect(&settings_repository, &github_repository).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => github_error(error),
        },
    )
}

#[tauri::command]
pub async fn detect_project_github_binding(
    state: State<'_, AppState>,
    input: DetectProjectGitHubBindingInput,
) -> Result<AppResult<DetectProjectGitHubBindingOutput>, String> {
    let project_repository = ProjectRepository::new(state.database.pool());
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::detect_project_binding(&project_repository, &github_repository, input)
            .await
        {
            Ok(output) => AppResult::ok(output),
            Err(error) => github_error(error),
        },
    )
}

#[tauri::command]
pub async fn sync_github_project_activity(
    state: State<'_, AppState>,
    input: SyncGitHubProjectActivityInput,
) -> Result<AppResult<SyncGitHubProjectActivityOutput>, String> {
    let project_repository = ProjectRepository::new(state.database.pool());
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::sync_project_activity(&project_repository, &github_repository, input)
            .await
        {
            Ok(output) => AppResult::ok(output),
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
    let github_repository = GitHubRepository::new(state.database.pool());

    Ok(
        match GitHubService::create_pull_request(&project_repository, &github_repository, input)
            .await
        {
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
