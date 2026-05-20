use tauri::State;

use crate::application::activity::{ActivityService, ActivityServiceError};
use crate::domain::activity::{ActivityDay, ListActivityInput};
use crate::infrastructure::database::repositories::ActivityRepository;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn list_activity(
    state: State<'_, AppState>,
    input: ListActivityInput,
) -> Result<AppResult<Vec<ActivityDay>>, String> {
    let repository = ActivityRepository::new(state.database.pool());

    Ok(match ActivityService::list(&repository, input).await {
        Ok(activity) => AppResult::ok(activity),
        Err(ActivityServiceError::Validation(message)) => {
            AppResult::err("VALIDATION_ERROR", message)
        }
        Err(ActivityServiceError::Database(error)) => {
            AppResult::err("DATABASE_ERROR", error.to_string())
        }
    })
}
