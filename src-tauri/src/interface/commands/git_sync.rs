use tauri::State;

use crate::application::git_sync::{GitSyncService, GitSyncServiceError};
use crate::domain::commit::{SyncCommitsInput, SyncCommitsResult};
use crate::infrastructure::database::repositories::{
    CommitRepository, GitMetadataRepository, ProjectRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn sync_commits(
    state: State<'_, AppState>,
    input: SyncCommitsInput,
) -> Result<AppResult<SyncCommitsResult>, String> {
    let project_repository = ProjectRepository::new(state.database.pool());
    let commit_repository = CommitRepository::new(state.database.pool());
    let git_metadata_repository = GitMetadataRepository::new(state.database.pool());

    Ok(
        match GitSyncService::sync(
            &project_repository,
            &commit_repository,
            &git_metadata_repository,
            input,
        )
        .await
        {
            Ok(result) => AppResult::ok(result),
            Err(GitSyncServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(GitSyncServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}
