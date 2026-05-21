use tauri::State;

use crate::application::nudges::{NudgeService, NudgeServiceError};
use crate::domain::nudge::{DismissNudgeInput, ListNudgeDismissalsInput, NudgeDismissal};
use crate::infrastructure::database::repositories::NudgeDismissalRepository;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_nudge_dismissals(
    state: State<'_, AppState>,
    input: ListNudgeDismissalsInput,
) -> Result<AppResult<Vec<NudgeDismissal>>, String> {
    let repository = NudgeDismissalRepository::new(state.database.pool());

    Ok(
        match NudgeService::list_dismissals(&repository, input).await {
            Ok(dismissals) => AppResult::ok(dismissals),
            Err(NudgeServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(NudgeServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn dismiss_nudge(
    state: State<'_, AppState>,
    input: DismissNudgeInput,
) -> Result<AppResult<NudgeDismissal>, String> {
    let repository = NudgeDismissalRepository::new(state.database.pool());

    Ok(match NudgeService::dismiss(&repository, input).await {
        Ok(dismissal) => AppResult::ok(dismissal),
        Err(NudgeServiceError::Validation(message)) => AppResult::err("VALIDATION_ERROR", message),
        Err(NudgeServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}
