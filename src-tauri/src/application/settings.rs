use std::fs;
use std::path::Path;

use crate::domain::settings::{BackupLocationValidation, Settings, UpdateSettingsInput};
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
        let current = repository
            .get()
            .await
            .map_err(SettingsServiceError::Database)?;
        let effective = merge_settings(current, &input);
        validate_backup_configuration(&effective)?;

        repository
            .update(input)
            .await
            .map_err(SettingsServiceError::Database)
    }

    pub fn validate_backup_location(location: &str) -> BackupLocationValidation {
        validate_backup_location_path(location)
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

    if let Some(schedule) = &input.backup_schedule {
        if !["manual", "daily", "weekly"].contains(&schedule.as_str()) {
            return Err(SettingsServiceError::Validation(
                "Backup schedule is not supported".to_string(),
            ));
        }
    }

    if let Some(time) = &input.backup_time {
        validate_time("Backup time", time)?;
    }

    if let Some(day) = &input.backup_day {
        if ![
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ]
        .contains(&day.as_str())
        {
            return Err(SettingsServiceError::Validation(
                "Backup day is not supported".to_string(),
            ));
        }
    }

    if let Some(mode) = &input.backup_storage_mode {
        if !["local", "online"].contains(&mode.as_str()) {
            return Err(SettingsServiceError::Validation(
                "Backup storage mode must be local or online".to_string(),
            ));
        }
    }

    if let Some(status) = &input.online_backup_status {
        if !["research", "deferred", "approved"].contains(&status.as_str()) {
            return Err(SettingsServiceError::Validation(
                "Online backup status is not supported".to_string(),
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

    if let Some(minutes) = input.daily_work_minutes {
        if !(60..=960).contains(&minutes) {
            return Err(SettingsServiceError::Validation(
                "Daily work capacity must be between 1 and 16 hours".to_string(),
            ));
        }
    }

    if let Some(volume) = input.announcement_volume {
        if !(0.0..=1.0).contains(&volume) {
            return Err(SettingsServiceError::Validation(
                "Announcement volume must be between 0 and 1".to_string(),
            ));
        }
    }

    if let Some(mode) = &input.voice_command_mode {
        if mode != "push_to_talk" {
            return Err(SettingsServiceError::Validation(
                "Voice command mode must be push-to-talk".to_string(),
            ));
        }
    }

    if let Some(provider) = &input.voice_transcription_provider {
        if !["local_whisper", "groq", "openrouter"].contains(&provider.as_str()) {
            return Err(SettingsServiceError::Validation(
                "Voice transcription provider is not supported".to_string(),
            ));
        }
    }

    if let Some(provider) = &input.report_ai_provider {
        if !["local_llama_cpp", "openrouter_free", "groq"].contains(&provider.as_str()) {
            return Err(SettingsServiceError::Validation(
                "Report AI provider is not supported".to_string(),
            ));
        }
    }

    Ok(())
}

fn validate_backup_configuration(settings: &Settings) -> Result<(), SettingsServiceError> {
    if !settings.backup_enabled {
        return Ok(());
    }

    if settings.backup_storage_location.trim().is_empty() {
        return Err(SettingsServiceError::Validation(
            "Choose where backups should be stored".to_string(),
        ));
    }

    if settings.backup_storage_mode == "local" {
        let validation = validate_backup_location_path(&settings.backup_storage_location);
        if validation.status != "ready" {
            return Err(SettingsServiceError::Validation(validation.message));
        }
    }

    Ok(())
}

fn validate_backup_location_path(location: &str) -> BackupLocationValidation {
    let trimmed = location.trim();
    if trimmed.is_empty() {
        return BackupLocationValidation {
            status: "needs_location".to_string(),
            message: "Choose where backups should be stored.".to_string(),
        };
    }

    let path = Path::new(trimmed);
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => {
            return BackupLocationValidation {
                status: "unavailable".to_string(),
                message: "The selected backup folder is unavailable.".to_string(),
            }
        }
    };

    if !metadata.is_dir() {
        return BackupLocationValidation {
            status: "unavailable".to_string(),
            message: "The selected backup location must be a folder.".to_string(),
        };
    }

    let probe_path = path.join(format!(
        ".worktrace-backup-check-{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));

    match fs::write(&probe_path, b"worktrace backup validation") {
        Ok(_) => {
            let _ = fs::remove_file(&probe_path);
            BackupLocationValidation {
                status: "ready".to_string(),
                message: "Backup folder is ready.".to_string(),
            }
        }
        Err(_) => BackupLocationValidation {
            status: "not_writable".to_string(),
            message: "WorkTrace cannot write to this folder.".to_string(),
        },
    }
}

fn merge_settings(mut settings: Settings, input: &UpdateSettingsInput) -> Settings {
    if let Some(value) = &input.name {
        settings.name = value.clone();
    }
    if let Some(value) = &input.email {
        settings.email = value.clone();
    }
    if let Some(value) = &input.default_manager_name {
        settings.default_manager_name = value.clone();
    }
    if let Some(value) = &input.git_author_email {
        settings.git_author_email = value.clone();
    }
    if let Some(value) = &input.default_report_template {
        settings.default_report_template = value.clone();
    }
    if let Some(value) = &input.working_days {
        settings.working_days = value.clone();
    }
    if let Some(value) = input.daily_work_minutes {
        settings.daily_work_minutes = value;
    }
    if let Some(value) = &input.theme {
        settings.theme = value.clone();
    }
    if let Some(value) = input.backup_enabled {
        settings.backup_enabled = value;
    }
    if let Some(value) = &input.backup_schedule {
        settings.backup_schedule = value.clone();
    }
    if let Some(value) = &input.backup_time {
        settings.backup_time = value.clone();
    }
    if let Some(value) = &input.backup_day {
        settings.backup_day = value.clone();
    }
    if let Some(value) = &input.backup_storage_mode {
        settings.backup_storage_mode = value.clone();
    }
    if let Some(value) = &input.backup_storage_location {
        settings.backup_storage_location = value.clone();
    }
    if let Some(value) = &input.online_backup_status {
        settings.online_backup_status = value.clone();
    }
    if let Some(value) = &input.online_backup_provider {
        settings.online_backup_provider = value.clone();
    }
    if let Some(value) = input.github_connected {
        settings.github_connected = value;
    }
    if let Some(value) = &input.github_username {
        settings.github_username = value.clone();
    }
    if let Some(value) = &input.github_connected_at {
        settings.github_connected_at = value.clone();
    }
    if let Some(value) = &input.github_last_validated_at {
        settings.github_last_validated_at = value.clone();
    }
    if let Some(value) = input.announcements_enabled {
        settings.announcements_enabled = value;
    }
    if let Some(value) = input.announcement_volume {
        settings.announcement_volume = value;
    }
    if let Some(value) = &input.announcement_voice {
        settings.announcement_voice = value.clone();
    }
    if let Some(value) = input.announce_focus_events {
        settings.announce_focus_events = value;
    }
    if let Some(value) = input.announce_nudges {
        settings.announce_nudges = value;
    }
    if let Some(value) = input.announce_sync_results {
        settings.announce_sync_results = value;
    }
    if let Some(value) = input.announce_task_changes {
        settings.announce_task_changes = value;
    }
    if let Some(value) = input.voice_commands_enabled {
        settings.voice_commands_enabled = value;
    }
    if let Some(value) = &input.voice_command_mode {
        settings.voice_command_mode = value.clone();
    }
    if let Some(value) = input.voice_command_confirm_before_action {
        settings.voice_command_confirm_before_action = value;
    }
    if let Some(value) = &input.voice_transcription_provider {
        settings.voice_transcription_provider = value.clone();
    }
    if let Some(value) = input.voice_online_allowed {
        settings.voice_online_allowed = value;
    }
    if let Some(value) = input.voice_privacy_acknowledged {
        settings.voice_privacy_acknowledged = value;
    }
    if let Some(value) = &input.voice_groq_model {
        settings.voice_groq_model = value.clone();
    }
    if let Some(value) = &input.voice_openrouter_model {
        settings.voice_openrouter_model = value.clone();
    }
    if let Some(value) = input.report_ai_enabled {
        settings.report_ai_enabled = value;
    }
    if let Some(value) = &input.report_ai_provider {
        settings.report_ai_provider = value.clone();
    }
    if let Some(value) = input.report_ai_online_allowed {
        settings.report_ai_online_allowed = value;
    }
    if let Some(value) = input.report_ai_privacy_acknowledged {
        settings.report_ai_privacy_acknowledged = value;
    }
    if let Some(value) = &input.report_ai_local_model_path {
        settings.report_ai_local_model_path = value.clone();
    }
    if let Some(value) = &input.report_ai_groq_model {
        settings.report_ai_groq_model = value.clone();
    }

    settings
}

fn validate_time(label: &str, value: &str) -> Result<(), SettingsServiceError> {
    let Some((hour, minute)) = value.split_once(':') else {
        return Err(SettingsServiceError::Validation(format!(
            "{label} must use HH:MM format"
        )));
    };

    let hour = hour
        .parse::<u8>()
        .map_err(|_| SettingsServiceError::Validation(format!("{label} must use HH:MM format")))?;
    let minute = minute
        .parse::<u8>()
        .map_err(|_| SettingsServiceError::Validation(format!("{label} must use HH:MM format")))?;

    if hour > 23 || minute > 59 {
        return Err(SettingsServiceError::Validation(format!(
            "{label} must use a valid 24-hour time"
        )));
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
                daily_work_minutes: Some(420),
                theme: Some("system".to_string()),
                backup_enabled: Some(true),
                backup_schedule: Some("weekly".to_string()),
                backup_time: Some("18:30".to_string()),
                backup_day: Some("friday".to_string()),
                backup_storage_mode: Some("local".to_string()),
                backup_storage_location: Some(std::env::temp_dir().to_string_lossy().to_string()),
                online_backup_status: Some("research".to_string()),
                online_backup_provider: Some(String::new()),
                github_connected: Some(true),
                github_username: Some("octocat".to_string()),
                github_connected_at: Some("2026-05-22T00:00:00Z".to_string()),
                github_last_validated_at: Some("2026-05-22T00:00:00Z".to_string()),
                ..Default::default()
            },
        )
        .await
        .expect("update settings");

        assert_eq!(updated.name, "Joseph");
        assert_eq!(updated.theme, "system");
        assert!(updated.backup_enabled);
        assert_eq!(updated.backup_schedule, "weekly");
        assert_eq!(updated.daily_work_minutes, 420);
        assert!(updated.github_connected);
        assert_eq!(updated.github_username, "octocat");

        let reloaded = SettingsService::get(&repository)
            .await
            .expect("reload settings");
        assert_eq!(reloaded.default_manager_name, "Manager");
        assert_eq!(reloaded.working_days, vec!["monday", "friday"]);
        assert_eq!(
            reloaded.backup_storage_location,
            std::env::temp_dir().to_string_lossy().to_string()
        );
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
                    daily_work_minutes: None,
                    theme: Some("blue".to_string()),
                    backup_enabled: None,
                    backup_schedule: None,
                    backup_time: None,
                    backup_day: None,
                    backup_storage_mode: None,
                    backup_storage_location: None,
                    online_backup_status: None,
                    online_backup_provider: None,
                    github_connected: None,
                    github_username: None,
                    github_connected_at: None,
                    github_last_validated_at: None,
                    ..Default::default()
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
                    daily_work_minutes: None,
                    theme: None,
                    backup_enabled: None,
                    backup_schedule: None,
                    backup_time: None,
                    backup_day: None,
                    backup_storage_mode: None,
                    backup_storage_location: None,
                    online_backup_status: None,
                    online_backup_provider: None,
                    github_connected: None,
                    github_username: None,
                    github_connected_at: None,
                    github_last_validated_at: None,
                    ..Default::default()
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
                    working_days: None,
                    daily_work_minutes: None,
                    theme: None,
                    backup_enabled: None,
                    backup_schedule: Some("monthly".to_string()),
                    backup_time: None,
                    backup_day: None,
                    backup_storage_mode: None,
                    backup_storage_location: None,
                    online_backup_status: None,
                    online_backup_provider: None,
                    github_connected: None,
                    github_username: None,
                    github_connected_at: None,
                    github_last_validated_at: None,
                    ..Default::default()
                },
            )
            .await,
            Err(SettingsServiceError::Validation(_))
        ));
    }

    #[tokio::test]
    async fn settings_service_rejects_invalid_local_backup_location() {
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
                    daily_work_minutes: None,
                    theme: None,
                    backup_enabled: Some(true),
                    backup_schedule: Some("daily".to_string()),
                    backup_time: Some("17:00".to_string()),
                    backup_day: Some("friday".to_string()),
                    backup_storage_mode: Some("local".to_string()),
                    backup_storage_location: Some(
                        std::env::temp_dir()
                            .join("worktrace-missing-backup-folder")
                            .to_string_lossy()
                            .to_string(),
                    ),
                    online_backup_status: None,
                    online_backup_provider: None,
                    github_connected: None,
                    github_username: None,
                    github_connected_at: None,
                    github_last_validated_at: None,
                    ..Default::default()
                },
            )
            .await,
            Err(SettingsServiceError::Validation(_))
        ));
    }
}
