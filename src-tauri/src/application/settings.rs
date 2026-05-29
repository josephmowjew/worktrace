use std::fs;
use std::path::Path;

use crate::domain::settings::{
    BackupLocationValidation, Settings, SettingsExport, SettingsImportResult, UpdateSettingsInput,
};
use crate::infrastructure::database::repositories::SettingsRepository;

const SPARC_FORCE_ADDON_CODE: &str = "SPARC-FORCE-ADDON";

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

    pub async fn export(
        repository: &SettingsRepository<'_>,
    ) -> Result<SettingsExport, sqlx::Error> {
        Ok(SettingsExport {
            app: "WorkTrace".to_string(),
            version: 1,
            exported_at: chrono::Utc::now().to_rfc3339(),
            settings: repository.get().await?,
        })
    }

    pub async fn export_to_file(
        repository: &SettingsRepository<'_>,
        path: String,
    ) -> Result<(), SettingsServiceError> {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            return Err(SettingsServiceError::Validation(
                "Choose where to save the settings export.".to_string(),
            ));
        }

        let export = Self::export(repository)
            .await
            .map_err(SettingsServiceError::Database)?;
        let payload = serde_json::to_string_pretty(&export).map_err(|error| {
            SettingsServiceError::Validation(format!(
                "Settings export could not be prepared: {error}"
            ))
        })?;

        fs::write(trimmed, payload).map_err(|error| {
            SettingsServiceError::Validation(format!("Settings export could not be saved: {error}"))
        })?;

        Ok(())
    }

    pub async fn import(
        repository: &SettingsRepository<'_>,
        payload: String,
    ) -> Result<SettingsImportResult, SettingsServiceError> {
        let parsed: SettingsExport = serde_json::from_str(&payload).map_err(|_| {
            SettingsServiceError::Validation(
                "Choose a valid WorkTrace settings export file.".to_string(),
            )
        })?;

        if parsed.app != "WorkTrace" || parsed.version != 1 {
            return Err(SettingsServiceError::Validation(
                "This settings export is not supported by this version of WorkTrace.".to_string(),
            ));
        }

        let mut input = update_input_from_settings(parsed.settings);
        let mut warnings = Vec::new();

        validate_update(&input)?;
        if input.backup_enabled == Some(true)
            && input.backup_storage_mode.as_deref() == Some("local")
        {
            let location = input
                .backup_storage_location
                .as_deref()
                .unwrap_or_default()
                .trim();
            let validation = validate_backup_location_path(location);
            if validation.status != "ready" {
                input.backup_enabled = Some(false);
                warnings.push(format!(
                    "Automatic backups were paused because the saved backup folder is not ready: {}",
                    validation.message
                ));
            }
        }

        let settings = repository
            .update(input)
            .await
            .map_err(SettingsServiceError::Database)?;

        Ok(SettingsImportResult { settings, warnings })
    }

    pub async fn activate_sparc_force_addon(
        repository: &SettingsRepository<'_>,
        code: String,
    ) -> Result<Settings, SettingsServiceError> {
        if code.trim() != SPARC_FORCE_ADDON_CODE {
            return Err(SettingsServiceError::Validation(
                "Invalid add-on activation code.".to_string(),
            ));
        }

        repository
            .update(UpdateSettingsInput {
                sparc_force_addon_enabled: Some(true),
                ..Default::default()
            })
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
        if !["dark", "light", "system"].contains(&theme.as_str()) {
            return Err(SettingsServiceError::Validation(
                "Theme must be dark, light, or system".to_string(),
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
        if !["local_llama_cpp", "openrouter_free", "groq", "nvidia_build"]
            .contains(&provider.as_str())
        {
            return Err(SettingsServiceError::Validation(
                "Report AI provider is not supported".to_string(),
            ));
        }
    }

    if let Some(shortcut) = &input.quick_capture_shortcut {
        if shortcut.trim().is_empty() {
            return Err(SettingsServiceError::Validation(
                "Quick capture shortcut cannot be empty".to_string(),
            ));
        }
    }
    if let Some(checkpoints) = &input.priority_reminder_checkpoints {
        if checkpoints.is_empty() || checkpoints.iter().any(|time| !is_hhmm(time)) {
            return Err(SettingsServiceError::Validation(
                "Reminder checkpoints must be HH:MM times".to_string(),
            ));
        }
    }
    if input
        .priority_reminder_snooze_minutes
        .map(|minutes| minutes < 5 || minutes > 480)
        .unwrap_or(false)
    {
        return Err(SettingsServiceError::Validation(
            "Reminder snooze must be between 5 and 480 minutes".to_string(),
        ));
    }
    if input
        .priority_reminder_quiet_start
        .as_ref()
        .map(|time| !is_hhmm(time))
        .unwrap_or(false)
        || input
            .priority_reminder_quiet_end
            .as_ref()
            .map(|time| !is_hhmm(time))
            .unwrap_or(false)
    {
        return Err(SettingsServiceError::Validation(
            "Reminder quiet hours must be HH:MM times".to_string(),
        ));
    }

    if let Some(steps) = &input.onboarding_completed_steps {
        let supported_steps = ["profile", "projects", "sync", "capture", "report"];
        if steps
            .iter()
            .any(|step| !supported_steps.contains(&step.as_str()))
        {
            return Err(SettingsServiceError::Validation(
                "Onboarding step is not supported".to_string(),
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
    if let Some(value) = input.use_gravatar_profile_image {
        settings.use_gravatar_profile_image = value;
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
    if let Some(value) = &input.report_ai_nvidia_model {
        settings.report_ai_nvidia_model = value.clone();
    }
    if let Some(value) = input.embeddings_enabled {
        settings.embeddings_enabled = value;
    }
    if let Some(value) = &input.embedding_provider {
        settings.embedding_provider = value.clone();
    }
    if let Some(value) = &input.embedding_local_endpoint {
        settings.embedding_local_endpoint = value.clone();
    }
    if let Some(value) = &input.embedding_online_endpoint {
        settings.embedding_online_endpoint = value.clone();
    }
    if let Some(value) = &input.embedding_model {
        settings.embedding_model = value.clone();
    }
    if let Some(value) = input.embedding_online_allowed {
        settings.embedding_online_allowed = value;
    }
    if let Some(value) = input.embedding_privacy_acknowledged {
        settings.embedding_privacy_acknowledged = value;
    }
    if let Some(value) = input.quick_capture_enabled {
        settings.quick_capture_enabled = value;
    }
    if let Some(value) = &input.quick_capture_shortcut {
        settings.quick_capture_shortcut = value.clone();
    }
    if let Some(value) = input.quick_capture_include_in_report {
        settings.quick_capture_include_in_report = value;
    }
    if let Some(value) = input.startup_enabled {
        settings.startup_enabled = value;
    }
    if let Some(value) = input.start_minimized_to_tray {
        settings.start_minimized_to_tray = value;
    }
    if let Some(value) = input.minimize_to_tray_on_close {
        settings.minimize_to_tray_on_close = value;
    }
    if let Some(value) = input.priority_reminders_enabled {
        settings.priority_reminders_enabled = value;
    }
    if let Some(value) = input.priority_reminder_desktop_enabled {
        settings.priority_reminder_desktop_enabled = value;
    }
    if let Some(value) = &input.priority_reminder_checkpoints {
        settings.priority_reminder_checkpoints = value.clone();
    }
    if let Some(value) = input.priority_reminder_snooze_minutes {
        settings.priority_reminder_snooze_minutes = value;
    }
    if let Some(value) = &input.priority_reminder_quiet_start {
        settings.priority_reminder_quiet_start = value.clone();
    }
    if let Some(value) = &input.priority_reminder_quiet_end {
        settings.priority_reminder_quiet_end = value.clone();
    }
    if let Some(value) = input.sparc_force_addon_enabled {
        settings.sparc_force_addon_enabled = value;
    }
    if let Some(value) = input.onboarding_completed {
        settings.onboarding_completed = value;
    }
    if let Some(value) = input.onboarding_dismissed_welcome {
        settings.onboarding_dismissed_welcome = value;
    }
    if let Some(value) = input.onboarding_dismissed_checklist {
        settings.onboarding_dismissed_checklist = value;
    }
    if let Some(value) = &input.onboarding_completed_steps {
        settings.onboarding_completed_steps = value.clone();
    }
    if let Some(value) = &input.onboarding_completed_at {
        settings.onboarding_completed_at = value.clone();
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

fn update_input_from_settings(settings: Settings) -> UpdateSettingsInput {
    UpdateSettingsInput {
        name: Some(settings.name),
        email: Some(settings.email),
        use_gravatar_profile_image: Some(settings.use_gravatar_profile_image),
        default_manager_name: Some(settings.default_manager_name),
        git_author_email: Some(settings.git_author_email),
        default_report_template: Some(settings.default_report_template),
        working_days: Some(settings.working_days),
        daily_work_minutes: Some(settings.daily_work_minutes),
        theme: Some(settings.theme),
        backup_enabled: Some(settings.backup_enabled),
        backup_schedule: Some(settings.backup_schedule),
        backup_time: Some(settings.backup_time),
        backup_day: Some(settings.backup_day),
        backup_storage_mode: Some(settings.backup_storage_mode),
        backup_storage_location: Some(settings.backup_storage_location),
        online_backup_status: Some(settings.online_backup_status),
        online_backup_provider: Some(settings.online_backup_provider),
        github_connected: Some(settings.github_connected),
        github_username: Some(settings.github_username),
        github_connected_at: Some(settings.github_connected_at),
        github_last_validated_at: Some(settings.github_last_validated_at),
        announcements_enabled: Some(settings.announcements_enabled),
        announcement_volume: Some(settings.announcement_volume),
        announcement_voice: Some(settings.announcement_voice),
        announce_focus_events: Some(settings.announce_focus_events),
        announce_nudges: Some(settings.announce_nudges),
        announce_sync_results: Some(settings.announce_sync_results),
        announce_task_changes: Some(settings.announce_task_changes),
        voice_commands_enabled: Some(settings.voice_commands_enabled),
        voice_command_mode: Some(settings.voice_command_mode),
        voice_command_confirm_before_action: Some(settings.voice_command_confirm_before_action),
        voice_transcription_provider: Some(settings.voice_transcription_provider),
        voice_online_allowed: Some(settings.voice_online_allowed),
        voice_privacy_acknowledged: Some(settings.voice_privacy_acknowledged),
        voice_groq_model: Some(settings.voice_groq_model),
        voice_openrouter_model: Some(settings.voice_openrouter_model),
        report_ai_enabled: Some(settings.report_ai_enabled),
        report_ai_provider: Some(settings.report_ai_provider),
        report_ai_online_allowed: Some(settings.report_ai_online_allowed),
        report_ai_privacy_acknowledged: Some(settings.report_ai_privacy_acknowledged),
        report_ai_local_model_path: Some(settings.report_ai_local_model_path),
        report_ai_groq_model: Some(settings.report_ai_groq_model),
        report_ai_nvidia_model: Some(settings.report_ai_nvidia_model),
        embeddings_enabled: Some(settings.embeddings_enabled),
        embedding_provider: Some(settings.embedding_provider),
        embedding_local_endpoint: Some(settings.embedding_local_endpoint),
        embedding_online_endpoint: Some(settings.embedding_online_endpoint),
        embedding_model: Some(settings.embedding_model),
        embedding_online_allowed: Some(settings.embedding_online_allowed),
        embedding_privacy_acknowledged: Some(settings.embedding_privacy_acknowledged),
        quick_capture_enabled: Some(settings.quick_capture_enabled),
        quick_capture_shortcut: Some(settings.quick_capture_shortcut),
        quick_capture_include_in_report: Some(settings.quick_capture_include_in_report),
        startup_enabled: Some(settings.startup_enabled),
        start_minimized_to_tray: Some(settings.start_minimized_to_tray),
        minimize_to_tray_on_close: Some(settings.minimize_to_tray_on_close),
        priority_reminders_enabled: Some(settings.priority_reminders_enabled),
        priority_reminder_desktop_enabled: Some(settings.priority_reminder_desktop_enabled),
        priority_reminder_checkpoints: Some(settings.priority_reminder_checkpoints),
        priority_reminder_snooze_minutes: Some(settings.priority_reminder_snooze_minutes),
        priority_reminder_quiet_start: Some(settings.priority_reminder_quiet_start),
        priority_reminder_quiet_end: Some(settings.priority_reminder_quiet_end),
        sparc_force_addon_enabled: Some(settings.sparc_force_addon_enabled),
        onboarding_completed: Some(settings.onboarding_completed),
        onboarding_dismissed_welcome: Some(settings.onboarding_dismissed_welcome),
        onboarding_dismissed_checklist: Some(settings.onboarding_dismissed_checklist),
        onboarding_completed_steps: Some(settings.onboarding_completed_steps),
        onboarding_completed_at: Some(settings.onboarding_completed_at),
    }
}

fn is_hhmm(value: &str) -> bool {
    chrono::NaiveTime::parse_from_str(value.trim(), "%H:%M").is_ok()
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
                theme: Some("light".to_string()),
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
        assert_eq!(updated.theme, "light");
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
