use crate::application::repositories::WeeklyTaskStore;
use crate::domain::weekly_task::{
    CreateWeeklyTaskInput, ListWeeklyTasksInput, UpdateWeeklyTaskInput, WeeklyTask,
};

pub struct WeeklyTaskService;

impl WeeklyTaskService {
    pub async fn list(
        repository: &impl WeeklyTaskStore,
        input: ListWeeklyTasksInput,
    ) -> Result<Vec<WeeklyTask>, WeeklyTaskServiceError> {
        validate_range(&input.week_start_date, &input.week_end_date)?;

        repository
            .list(input)
            .await
            .map_err(WeeklyTaskServiceError::Database)
    }

    pub async fn create(
        repository: &impl WeeklyTaskStore,
        input: CreateWeeklyTaskInput,
    ) -> Result<WeeklyTask, WeeklyTaskServiceError> {
        validate_create(&input)?;

        repository
            .create(input)
            .await
            .map_err(WeeklyTaskServiceError::Database)
    }

    pub async fn update(
        repository: &impl WeeklyTaskStore,
        id: &str,
        input: UpdateWeeklyTaskInput,
    ) -> Result<Option<WeeklyTask>, WeeklyTaskServiceError> {
        validate_update(&input)?;

        repository
            .update(id, input)
            .await
            .map_err(WeeklyTaskServiceError::Database)
    }

    pub async fn delete(repository: &impl WeeklyTaskStore, id: &str) -> Result<bool, sqlx::Error> {
        repository.delete(id).await
    }
}

#[derive(Debug)]
pub enum WeeklyTaskServiceError {
    Validation(String),
    Database(sqlx::Error),
}

fn validate_range(start: &str, end: &str) -> Result<(), WeeklyTaskServiceError> {
    if start.trim().is_empty() || end.trim().is_empty() {
        return Err(WeeklyTaskServiceError::Validation(
            "Weekly task date range is required".to_string(),
        ));
    }

    Ok(())
}

fn validate_create(input: &CreateWeeklyTaskInput) -> Result<(), WeeklyTaskServiceError> {
    if input.title.trim().is_empty() {
        return Err(WeeklyTaskServiceError::Validation(
            "Task title is required".to_string(),
        ));
    }
    if input.week_start_date.trim().is_empty() {
        return Err(WeeklyTaskServiceError::Validation(
            "Task week is required".to_string(),
        ));
    }

    Ok(())
}

fn validate_update(input: &UpdateWeeklyTaskInput) -> Result<(), WeeklyTaskServiceError> {
    if input
        .title
        .as_ref()
        .map(|title| title.trim().is_empty())
        .unwrap_or(false)
    {
        return Err(WeeklyTaskServiceError::Validation(
            "Task title is required".to_string(),
        ));
    }
    if input
        .week_start_date
        .as_ref()
        .map(|date| date.trim().is_empty())
        .unwrap_or(false)
    {
        return Err(WeeklyTaskServiceError::Validation(
            "Task week is required".to_string(),
        ));
    }

    Ok(())
}
