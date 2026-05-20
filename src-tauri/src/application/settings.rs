use crate::domain::settings::{Settings, UpdateSettingsInput};
use crate::infrastructure::database::repositories::SettingsRepository;

pub struct SettingsService;

impl SettingsService {
    pub async fn get(repository: &SettingsRepository<'_>) -> Result<Settings, sqlx::Error> {
        repository.get().await
    }

    pub async fn update(
        repository: &SettingsRepository<'_>,
        input: UpdateSettingsInput,
    ) -> Result<Settings, SettingsServiceError> {
        validate_update(&input)?;

        repository
            .update(input)
            .await
            .map_err(SettingsServiceError::Database)
    }
}

#[derive(Debug)]
pub enum SettingsServiceError {
    Validation(String),
    Database(sqlx::Error),
}

fn validate_update(input: &UpdateSettingsInput) -> Result<(), SettingsServiceError> {
    if let Some(email) = &input.email {
        validate_email_like("Email address", email)?;
    }

    if let Some(email) = &input.git_author_email {
        validate_email_like("Git author email", email)?;
    }

    if let Some(theme) = &input.theme {
        if !["dark", "system"].contains(&theme.as_str()) {
            return Err(SettingsServiceError::Validation(
                "Theme must be dark or system".to_string(),
            ));
        }
    }

    if let Some(template) = &input.default_report_template {
        if ![
            "professional_weekly_summary",
            "project_based",
            "concise_manager_update",
        ]
        .contains(&template.as_str())
        {
            return Err(SettingsServiceError::Validation(
                "Report template is not supported".to_string(),
            ));
        }
    }

    if let Some(working_days) = &input.working_days {
        let valid_days = [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ];

        if working_days.is_empty() {
            return Err(SettingsServiceError::Validation(
                "Select at least one working day".to_string(),
            ));
        }

        if working_days
            .iter()
            .any(|day| !valid_days.contains(&day.as_str()))
        {
            return Err(SettingsServiceError::Validation(
                "Working days contain an unsupported value".to_string(),
            ));
        }
    }

    Ok(())
}

fn validate_email_like(label: &str, value: &str) -> Result<(), SettingsServiceError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    if !trimmed.contains('@') || trimmed.starts_with('@') || trimmed.ends_with('@') {
        return Err(SettingsServiceError::Validation(format!(
            "{label} must look like an email address"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    use super::*;
    use crate::infrastructure::database::migrations::run_migrations;

    async fn test_repository() -> SettingsRepository<'static> {
        let options = SqliteConnectOptions::new()
            .filename(":memory:")
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .expect("create sqlite test pool");

        run_migrations(&pool).await.expect("run migrations");
        let pool = Box::leak(Box::new(pool));
        SettingsRepository::new(pool)
    }

    #[tokio::test]
    async fn settings_service_loads_defaults_and_updates_values() {
        let repository = test_repository().await;

        let defaults = SettingsService::get(&repository)
            .await
            .expect("load defaults");
        assert_eq!(defaults.theme, "dark");

        let updated = SettingsService::update(
            &repository,
            UpdateSettingsInput {
                name: Some("Joseph".to_string()),
                email: Some("joseph@example.com".to_string()),
                default_manager_name: Some("Manager".to_string()),
                git_author_email: Some("git@example.com".to_string()),
                default_report_template: Some("project_based".to_string()),
                working_days: Some(vec!["monday".to_string(), "friday".to_string()]),
                theme: Some("system".to_string()),
            },
        )
        .await
        .expect("update settings");

        assert_eq!(updated.name, "Joseph");
        assert_eq!(updated.theme, "system");

        let reloaded = SettingsService::get(&repository)
            .await
            .expect("reload settings");
        assert_eq!(reloaded.default_manager_name, "Manager");
        assert_eq!(reloaded.working_days, vec!["monday", "friday"]);
    }

    #[tokio::test]
    async fn settings_service_rejects_invalid_theme_and_working_day() {
        let repository = test_repository().await;

        assert!(matches!(
            SettingsService::update(
                &repository,
                UpdateSettingsInput {
                    name: None,
                    email: None,
                    default_manager_name: None,
                    git_author_email: None,
                    default_report_template: None,
                    working_days: None,
                    theme: Some("blue".to_string()),
                },
            )
            .await,
            Err(SettingsServiceError::Validation(_))
        ));

        assert!(matches!(
            SettingsService::update(
                &repository,
                UpdateSettingsInput {
                    name: None,
                    email: None,
                    default_manager_name: None,
                    git_author_email: None,
                    default_report_template: None,
                    working_days: Some(vec!["someday".to_string()]),
                    theme: None,
                },
            )
            .await,
            Err(SettingsServiceError::Validation(_))
        ));
    }
}
