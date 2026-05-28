use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::application::embeddings::{EmbeddingError, EmbeddingIndexService, EmbeddingService};
use crate::domain::embedding::{
    BackgroundJobStatus, BackgroundJobStatusInput, ConnectEmbeddingProviderInput, EmbeddingStatus,
    QueueActivityEmbeddingRefreshInput, QueueBackgroundJobResult, RefreshActivityEmbeddingsInput,
    RefreshActivityEmbeddingsResult, RunBackgroundJobsResult, SemanticActivitySearchInput,
    SemanticActivitySearchResult,
};
use crate::infrastructure::database::repositories::{
    ActivityEmbeddingRepository, ActivityRepository, BackgroundJobRepository, SettingsRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn get_embedding_status(
    state: State<'_, AppState>,
) -> Result<AppResult<EmbeddingStatus>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());
    Ok(match EmbeddingService::status(&settings_repository).await {
        Ok(status) => AppResult::ok(status),
        Err(error) => embedding_error(error),
    })
}

#[tauri::command]
pub async fn test_embedding_provider(
    state: State<'_, AppState>,
) -> Result<AppResult<String>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());
    Ok(
        match EmbeddingService::test_provider(&settings_repository).await {
            Ok(message) => AppResult::ok(message),
            Err(error) => embedding_error(error),
        },
    )
}

#[tauri::command]
pub async fn connect_embedding_provider(
    input: ConnectEmbeddingProviderInput,
) -> Result<AppResult<bool>, String> {
    Ok(match EmbeddingService::connect_provider(input).await {
        Ok(()) => AppResult::ok(true),
        Err(error) => embedding_error(error),
    })
}

#[tauri::command]
pub async fn disconnect_embedding_provider() -> Result<AppResult<bool>, String> {
    Ok(match EmbeddingService::disconnect_provider() {
        Ok(()) => AppResult::ok(true),
        Err(error) => embedding_error(error),
    })
}

#[tauri::command]
pub async fn refresh_activity_embeddings(
    app: AppHandle,
    state: State<'_, AppState>,
    input: RefreshActivityEmbeddingsInput,
) -> Result<AppResult<RefreshActivityEmbeddingsResult>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());
    let activity_repository = ActivityRepository::new(state.database.pool());
    let embedding_repository = ActivityEmbeddingRepository::new(state.database.pool());
    let app_data_dir = match app.path().app_data_dir() {
        Ok(path) => path,
        Err(error) => return Ok(AppResult::err("APP_DATA_ERROR", error.to_string())),
    };

    Ok(
        match EmbeddingIndexService::refresh_for_range(
            &settings_repository,
            &activity_repository,
            &embedding_repository,
            &app_data_dir,
            input,
        )
        .await
        {
            Ok(result) => AppResult::ok(result),
            Err(error) => embedding_error(error),
        },
    )
}

#[tauri::command]
pub async fn queue_activity_embedding_refresh(
    state: State<'_, AppState>,
    input: QueueActivityEmbeddingRefreshInput,
) -> Result<AppResult<QueueBackgroundJobResult>, String> {
    let job_repository = BackgroundJobRepository::new(state.database.pool());
    Ok(
        match EmbeddingIndexService::queue_refresh(&job_repository, input).await {
            Ok(result) => AppResult::ok(result),
            Err(error) => embedding_error(error),
        },
    )
}

#[tauri::command]
pub async fn get_background_job_status(
    state: State<'_, AppState>,
    input: BackgroundJobStatusInput,
) -> Result<AppResult<BackgroundJobStatus>, String> {
    let job_repository = BackgroundJobRepository::new(state.database.pool());
    Ok(
        match EmbeddingIndexService::job_status(&job_repository, input).await {
            Ok(status) => AppResult::ok(status),
            Err(error) => embedding_error(error),
        },
    )
}

#[tauri::command]
pub async fn run_background_jobs_once(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<AppResult<RunBackgroundJobsResult>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());
    let activity_repository = ActivityRepository::new(state.database.pool());
    let embedding_repository = ActivityEmbeddingRepository::new(state.database.pool());
    let job_repository = BackgroundJobRepository::new(state.database.pool());
    let app_data_dir = match app.path().app_data_dir() {
        Ok(path) => path,
        Err(error) => return Ok(AppResult::err("APP_DATA_ERROR", error.to_string())),
    };

    Ok(
        match EmbeddingIndexService::run_background_jobs_once(
            &settings_repository,
            &activity_repository,
            &embedding_repository,
            &job_repository,
            &app_data_dir,
        )
        .await
        {
            Ok(result) => AppResult::ok(result),
            Err(error) => embedding_error(error),
        },
    )
}

#[tauri::command]
pub async fn semantic_activity_search(
    state: State<'_, AppState>,
    input: SemanticActivitySearchInput,
) -> Result<AppResult<Vec<SemanticActivitySearchResult>>, String> {
    let settings_repository = SettingsRepository::new(state.database.pool());
    let activity_repository = ActivityRepository::new(state.database.pool());
    let embedding_repository = ActivityEmbeddingRepository::new(state.database.pool());

    Ok(
        match EmbeddingIndexService::semantic_search(
            &settings_repository,
            &activity_repository,
            &embedding_repository,
            input,
        )
        .await
        {
            Ok(results) => AppResult::ok(results),
            Err(error) => embedding_error(error),
        },
    )
}

fn embedding_error<T: Serialize>(error: EmbeddingError) -> AppResult<T> {
    match error {
        EmbeddingError::Validation(message) => AppResult::err("VALIDATION_ERROR", message),
        EmbeddingError::Database(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
        EmbeddingError::Keyring(message) => AppResult::err("KEYRING_ERROR", message),
        EmbeddingError::Provider(message) => AppResult::err("PROVIDER_ERROR", message),
        EmbeddingError::Io(error) => AppResult::err("IO_ERROR", error.to_string()),
    }
}
