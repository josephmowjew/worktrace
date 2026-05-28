use serde::Serialize;
use tauri::State;

use crate::application::activity_groups::{ActivityGroupService, ActivityGroupServiceError};
use crate::domain::activity_group::{
    ActivityGroup, CreateActivityGroupInput, GroupingEvidence, ListActivityGroupsInput,
    LockActivityGroupInput, MergeActivityGroupsInput, MoveActivityGroupItemInput,
    PreviewActivityGroupSuggestionsInput, PreviewActivityGroupTitleInput,
    PreviewActivityGroupTitleResponse, RecordActivityGroupTitleFeedbackInput,
    RegenerateActivityGroupTitleInput, ReplaceActivityGroupItemsInput,
    SelectActivityGroupTitleCandidateInput, SplitActivityGroupInput, SuggestActivityGroupsInput,
    UpdateActivityGroupInput,
};
use crate::infrastructure::database::repositories::{
    ActivityEmbeddingRepository, ActivityGroupRepository, ActivityRepository,
    GitMetadataRepository, SettingsRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_activity_groups(
    state: State<'_, AppState>,
    input: ListActivityGroupsInput,
) -> Result<AppResult<Vec<ActivityGroup>>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());

    Ok(match ActivityGroupService::list(&repository, input).await {
        Ok(groups) => AppResult::ok(groups),
        Err(error) => activity_group_error(error),
    })
}

#[tauri::command]
pub async fn suggest_activity_groups(
    state: State<'_, AppState>,
    input: SuggestActivityGroupsInput,
) -> Result<AppResult<Vec<ActivityGroup>>, String> {
    let group_repository = ActivityGroupRepository::new(state.database.pool());
    let activity_repository = ActivityRepository::new(state.database.pool());
    let git_repository = GitMetadataRepository::new(state.database.pool());
    let embedding_repository = ActivityEmbeddingRepository::new(state.database.pool());
    let settings_repository = SettingsRepository::new(state.database.pool());

    Ok(
        match ActivityGroupService::suggest(
            &group_repository,
            &activity_repository,
            &git_repository,
            &settings_repository,
            &embedding_repository,
            input,
        )
        .await
        {
            Ok(groups) => AppResult::ok(groups),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn preview_activity_group_suggestions(
    state: State<'_, AppState>,
    input: PreviewActivityGroupSuggestionsInput,
) -> Result<AppResult<Vec<CreateActivityGroupInput>>, String> {
    let group_repository = ActivityGroupRepository::new(state.database.pool());
    let activity_repository = ActivityRepository::new(state.database.pool());
    let git_repository = GitMetadataRepository::new(state.database.pool());
    let settings_repository = SettingsRepository::new(state.database.pool());
    let embedding_repository = ActivityEmbeddingRepository::new(state.database.pool());

    Ok(
        match ActivityGroupService::preview(
            &group_repository,
            &activity_repository,
            &git_repository,
            &settings_repository,
            &embedding_repository,
            input,
        )
        .await
        {
            Ok(groups) => AppResult::ok(groups),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn refresh_activity_group_suggestions(
    state: State<'_, AppState>,
    input: SuggestActivityGroupsInput,
) -> Result<AppResult<Vec<ActivityGroup>>, String> {
    let group_repository = ActivityGroupRepository::new(state.database.pool());
    let activity_repository = ActivityRepository::new(state.database.pool());
    let git_repository = GitMetadataRepository::new(state.database.pool());
    let embedding_repository = ActivityEmbeddingRepository::new(state.database.pool());
    let settings_repository = SettingsRepository::new(state.database.pool());

    Ok(
        match ActivityGroupService::suggest(
            &group_repository,
            &activity_repository,
            &git_repository,
            &settings_repository,
            &embedding_repository,
            input,
        )
        .await
        {
            Ok(groups) => AppResult::ok(groups),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn create_activity_group(
    state: State<'_, AppState>,
    input: CreateActivityGroupInput,
) -> Result<AppResult<ActivityGroup>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());

    Ok(
        match ActivityGroupService::create(&repository, input).await {
            Ok(group) => AppResult::ok(group),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn update_activity_group(
    state: State<'_, AppState>,
    id: String,
    input: UpdateActivityGroupInput,
) -> Result<AppResult<ActivityGroup>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());

    Ok(
        match ActivityGroupService::update(&repository, &id, input).await {
            Ok(group) => AppResult::ok(group),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn delete_activity_group(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<bool>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());

    Ok(match ActivityGroupService::delete(&repository, &id).await {
        Ok(deleted) => AppResult::ok(deleted),
        Err(error) => activity_group_error(error),
    })
}

#[tauri::command]
pub async fn replace_activity_group_items(
    state: State<'_, AppState>,
    id: String,
    input: ReplaceActivityGroupItemsInput,
) -> Result<AppResult<ActivityGroup>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());

    Ok(
        match ActivityGroupService::replace_items(&repository, &id, input).await {
            Ok(group) => AppResult::ok(group),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn list_grouping_evidence(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<GroupingEvidence>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());
    Ok(match repository.evidence_for_group(&id).await {
        Ok(Some(evidence)) => AppResult::ok(evidence),
        Ok(None) => AppResult::err("NOT_FOUND", "Activity group not found".to_string()),
        Err(error) => AppResult::err("DATABASE_ERROR", error.to_string()),
    })
}

#[tauri::command]
pub async fn merge_activity_groups(
    state: State<'_, AppState>,
    id: String,
    input: MergeActivityGroupsInput,
) -> Result<AppResult<ActivityGroup>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());
    Ok(
        match ActivityGroupService::merge(&repository, &id, input).await {
            Ok(group) => AppResult::ok(group),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn split_activity_group(
    state: State<'_, AppState>,
    id: String,
    input: SplitActivityGroupInput,
) -> Result<AppResult<ActivityGroup>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());
    Ok(
        match ActivityGroupService::split(&repository, &id, input).await {
            Ok(group) => AppResult::ok(group),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn move_activity_group_item(
    state: State<'_, AppState>,
    id: String,
    input: MoveActivityGroupItemInput,
) -> Result<AppResult<ActivityGroup>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());
    Ok(
        match ActivityGroupService::move_item(&repository, &id, input).await {
            Ok(group) => AppResult::ok(group),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn lock_activity_group(
    state: State<'_, AppState>,
    id: String,
    input: LockActivityGroupInput,
) -> Result<AppResult<ActivityGroup>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());
    Ok(
        match ActivityGroupService::lock(&repository, &id, input).await {
            Ok(group) => AppResult::ok(group),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn reset_activity_group(
    state: State<'_, AppState>,
    id: String,
) -> Result<AppResult<bool>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());
    Ok(match ActivityGroupService::reset(&repository, &id).await {
        Ok(deleted) => AppResult::ok(deleted),
        Err(error) => activity_group_error(error),
    })
}

#[tauri::command]
pub async fn preview_activity_group_title(
    state: State<'_, AppState>,
    input: PreviewActivityGroupTitleInput,
) -> Result<AppResult<PreviewActivityGroupTitleResponse>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());
    Ok(
        match ActivityGroupService::preview_title(&repository, input).await {
            Ok(response) => AppResult::ok(response),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn regenerate_activity_group_title(
    state: State<'_, AppState>,
    input: RegenerateActivityGroupTitleInput,
) -> Result<AppResult<PreviewActivityGroupTitleResponse>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());
    Ok(
        match ActivityGroupService::regenerate_title(&repository, input).await {
            Ok(response) => AppResult::ok(response),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn select_activity_group_title_candidate(
    state: State<'_, AppState>,
    input: SelectActivityGroupTitleCandidateInput,
) -> Result<AppResult<ActivityGroup>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());
    Ok(
        match ActivityGroupService::select_title_candidate(&repository, input).await {
            Ok(group) => AppResult::ok(group),
            Err(error) => activity_group_error(error),
        },
    )
}

#[tauri::command]
pub async fn record_activity_group_title_feedback(
    state: State<'_, AppState>,
    input: RecordActivityGroupTitleFeedbackInput,
) -> Result<AppResult<bool>, String> {
    let repository = ActivityGroupRepository::new(state.database.pool());
    Ok(
        match ActivityGroupService::record_title_feedback(&repository, input).await {
            Ok(recorded) => AppResult::ok(recorded),
            Err(error) => activity_group_error(error),
        },
    )
}

fn activity_group_error<T: Serialize>(error: ActivityGroupServiceError) -> AppResult<T> {
    match error {
        ActivityGroupServiceError::Validation(message) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        ActivityGroupServiceError::Database(error) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    }
}
