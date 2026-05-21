use crate::application::repositories::NudgeDismissalStore;
use crate::domain::nudge::{DismissNudgeInput, ListNudgeDismissalsInput, NudgeDismissal};

pub struct NudgeService;

impl NudgeService {
    pub async fn list_dismissals(
        repository: &impl NudgeDismissalStore,
        input: ListNudgeDismissalsInput,
    ) -> Result<Vec<NudgeDismissal>, NudgeServiceError> {
        if input.dismissed_for_date.trim().is_empty() {
            return Err(NudgeServiceError::Validation(
                "Dismissal date is required".to_string(),
            ));
        }

        repository
            .list(input)
            .await
            .map_err(NudgeServiceError::Database)
    }

    pub async fn dismiss(
        repository: &impl NudgeDismissalStore,
        input: DismissNudgeInput,
    ) -> Result<NudgeDismissal, NudgeServiceError> {
        if input.nudge_key.trim().is_empty() {
            return Err(NudgeServiceError::Validation(
                "Nudge key is required".to_string(),
            ));
        }
        if input.dismissed_for_date.trim().is_empty() {
            return Err(NudgeServiceError::Validation(
                "Dismissal date is required".to_string(),
            ));
        }

        repository
            .dismiss(input)
            .await
            .map_err(NudgeServiceError::Database)
    }
}

#[derive(Debug)]
pub enum NudgeServiceError {
    Validation(String),
    Database(sqlx::Error),
}
