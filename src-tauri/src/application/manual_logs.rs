use crate::domain::manual_log::{
    CreateManualLogInput, ListManualLogsInput, ManualLog, UpdateManualLogInput,
};
use crate::infrastructure::database::repositories::ManualLogRepository;

pub struct ManualLogService;

impl ManualLogService {
    pub async fn list(
        repository: &ManualLogRepository<'_>,
        input: ListManualLogsInput,
    ) -> Result<Vec<ManualLog>, ManualLogServiceError> {
        if input.from.trim().is_empty() || input.to.trim().is_empty() {
            return Err(ManualLogServiceError::Validation(
                "Manual log date range is required".to_string(),
            ));
        }

        let logs = repository
            .list_by_date_range(&input.from, &input.to)
            .await
            .map_err(ManualLogServiceError::Database)?;

        Ok(match input.project_ids {
            Some(project_ids) => logs
                .into_iter()
                .filter(|log| {
                    log.project_id
                        .as_ref()
                        .map(|project_id| project_ids.iter().any(|id| id == project_id))
                        .unwrap_or(false)
                })
                .collect(),
            None => logs,
        })
    }

    pub async fn create(
        repository: &ManualLogRepository<'_>,
        input: CreateManualLogInput,
    ) -> Result<ManualLog, ManualLogServiceError> {
        validate_create_input(&input)?;

        repository
            .create(input)
            .await
            .map_err(ManualLogServiceError::Database)
    }

    pub async fn update(
        repository: &ManualLogRepository<'_>,
        id: &str,
        input: UpdateManualLogInput,
    ) -> Result<Option<ManualLog>, ManualLogServiceError> {
        validate_update_input(&input)?;

        repository
            .update(id, input)
            .await
            .map_err(ManualLogServiceError::Database)
    }

    pub async fn delete(
        repository: &ManualLogRepository<'_>,
        id: &str,
    ) -> Result<bool, sqlx::Error> {
        repository.delete(id).await
    }
}

#[derive(Debug)]
pub enum ManualLogServiceError {
    Validation(String),
    Database(sqlx::Error),
}

fn validate_create_input(input: &CreateManualLogInput) -> Result<(), ManualLogServiceError> {
    if input.date.trim().is_empty() {
        return Err(ManualLogServiceError::Validation(
            "Manual log date is required".to_string(),
        ));
    }

    if input.summary.trim().is_empty() {
        return Err(ManualLogServiceError::Validation(
            "Manual log summary is required".to_string(),
        ));
    }

    if input
        .duration_minutes
        .map(|minutes| minutes < 0)
        .unwrap_or(false)
    {
        return Err(ManualLogServiceError::Validation(
            "Duration cannot be negative".to_string(),
        ));
    }

    Ok(())
}

fn validate_update_input(input: &UpdateManualLogInput) -> Result<(), ManualLogServiceError> {
    if input
        .date
        .as_ref()
        .map(|date| date.trim().is_empty())
        .unwrap_or(false)
    {
        return Err(ManualLogServiceError::Validation(
            "Manual log date is required".to_string(),
        ));
    }

    if input
        .summary
        .as_ref()
        .map(|summary| summary.trim().is_empty())
        .unwrap_or(false)
    {
        return Err(ManualLogServiceError::Validation(
            "Manual log summary is required".to_string(),
        ));
    }

    if input
        .duration_minutes
        .map(|minutes| minutes < 0)
        .unwrap_or(false)
    {
        return Err(ManualLogServiceError::Validation(
            "Duration cannot be negative".to_string(),
        ));
    }

    Ok(())
}
