use crate::domain::activity::{ActivityDay, ListActivityInput};
use crate::infrastructure::database::repositories::ActivityRepository;

pub struct ActivityService;

impl ActivityService {
    pub async fn list(
        repository: &ActivityRepository<'_>,
        input: ListActivityInput,
    ) -> Result<Vec<ActivityDay>, ActivityServiceError> {
        if input.from.trim().is_empty() || input.to.trim().is_empty() {
            return Err(ActivityServiceError::Validation(
                "Activity date range is required".to_string(),
            ));
        }

        repository
            .list(input)
            .await
            .map_err(ActivityServiceError::Database)
    }
}

pub enum ActivityServiceError {
    Validation(String),
    Database(sqlx::Error),
}
