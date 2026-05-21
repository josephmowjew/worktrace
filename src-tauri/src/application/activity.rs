use crate::domain::activity::{
    ActivityDay, HeatmapData, HeatmapInput, KeyHighlight, ListActivityInput, WeekSummary,
    WeekSummaryInput,
};
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

    pub async fn get_heatmap(
        repository: &ActivityRepository<'_>,
        input: HeatmapInput,
    ) -> Result<HeatmapData, ActivityServiceError> {
        if input.from.trim().is_empty() || input.to.trim().is_empty() {
            return Err(ActivityServiceError::Validation(
                "Date range is required".to_string(),
            ));
        }

        repository
            .get_heatmap_data(input)
            .await
            .map_err(ActivityServiceError::Database)
    }

    pub async fn get_week_summary(
        repository: &ActivityRepository<'_>,
        input: WeekSummaryInput,
    ) -> Result<WeekSummary, ActivityServiceError> {
        if input.from.trim().is_empty() || input.to.trim().is_empty() {
            return Err(ActivityServiceError::Validation(
                "Date range is required".to_string(),
            ));
        }

        repository
            .get_week_summary(input)
            .await
            .map_err(ActivityServiceError::Database)
    }

    pub async fn get_key_highlights(
        repository: &ActivityRepository<'_>,
        input: WeekSummaryInput,
    ) -> Result<Vec<KeyHighlight>, ActivityServiceError> {
        if input.from.trim().is_empty() || input.to.trim().is_empty() {
            return Err(ActivityServiceError::Validation(
                "Date range is required".to_string(),
            ));
        }

        repository
            .get_key_highlights(input)
            .await
            .map_err(ActivityServiceError::Database)
    }
}

pub enum ActivityServiceError {
    Validation(String),
    Database(sqlx::Error),
}
