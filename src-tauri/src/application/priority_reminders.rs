use chrono::{Duration, Local, NaiveDate, NaiveTime};

use crate::domain::priority_reminder::{
    DismissPriorityReminderInput, ListPriorityRemindersInput, PriorityReminder,
    RunPriorityReminderCheckInput, SnoozePriorityReminderInput,
};
use crate::domain::settings::Settings;
use crate::infrastructure::database::repositories::PriorityReminderRepository;

pub struct PriorityReminderService;

impl PriorityReminderService {
    pub async fn list(
        repository: &PriorityReminderRepository<'_>,
        input: ListPriorityRemindersInput,
    ) -> Result<Vec<PriorityReminder>, PriorityReminderServiceError> {
        validate_date(&input.date)?;
        repository
            .list_by_date(&input.date)
            .await
            .map_err(PriorityReminderServiceError::Database)
    }

    pub async fn run_check(
        repository: &PriorityReminderRepository<'_>,
        settings: &Settings,
        input: RunPriorityReminderCheckInput,
    ) -> Result<Vec<PriorityReminder>, PriorityReminderServiceError> {
        validate_date(&input.date)?;
        if !settings.priority_reminders_enabled {
            return Ok(Vec::new());
        }

        let now_time = match input.now_time {
            Some(value) => parse_time(&value)?,
            None => Local::now().time(),
        };
        let quiet_start = parse_time(&settings.priority_reminder_quiet_start)?;
        let quiet_end = parse_time(&settings.priority_reminder_quiet_end)?;
        if now_time < quiet_start || now_time > quiet_end {
            return Ok(Vec::new());
        }

        let due_checkpoint = settings
            .priority_reminder_checkpoints
            .iter()
            .filter_map(|value| parse_time(value).ok().map(|time| (value, time)))
            .filter(|(_, time)| *time <= now_time)
            .max_by_key(|(_, time)| *time)
            .map(|(value, _)| value.clone());
        let Some(checkpoint_time) = due_checkpoint else {
            return Ok(Vec::new());
        };

        let existing = repository
            .list_by_date(&input.date)
            .await
            .map_err(PriorityReminderServiceError::Database)?;
        let eligible = repository
            .list_eligible_items(&input.date)
            .await
            .map_err(PriorityReminderServiceError::Database)?;

        let mut due = Vec::new();
        for (item, _) in eligible {
            let reminder_key = reminder_key(&item.id);
            let existing_for_item = existing
                .iter()
                .filter(|reminder| reminder.reminder_key == reminder_key)
                .collect::<Vec<_>>();
            if existing_for_item
                .iter()
                .any(|reminder| reminder.dismissed_at.is_some())
            {
                continue;
            }
            if existing_for_item.iter().any(|reminder| {
                reminder
                    .snoozed_until
                    .as_deref()
                    .and_then(|value| parse_time(value).ok())
                    .map(|time| time > now_time)
                    .unwrap_or(false)
            }) {
                continue;
            }
            if existing_for_item.iter().any(|reminder| {
                reminder.checkpoint_time == checkpoint_time && reminder.shown_at.is_some()
            }) {
                continue;
            }

            let reminder = repository
                .upsert_shown(&reminder_key, &input.date, &item.id, &checkpoint_time)
                .await
                .map_err(PriorityReminderServiceError::Database)?;
            due.push(reminder);
        }

        Ok(due)
    }

    pub async fn snooze(
        repository: &PriorityReminderRepository<'_>,
        settings: &Settings,
        input: SnoozePriorityReminderInput,
    ) -> Result<Vec<PriorityReminder>, PriorityReminderServiceError> {
        validate_date(&input.date)?;
        let minutes = input
            .snooze_minutes
            .unwrap_or(settings.priority_reminder_snooze_minutes);
        if !(5..=480).contains(&minutes) {
            return Err(PriorityReminderServiceError::Validation(
                "Snooze must be between 5 and 480 minutes".to_string(),
            ));
        }
        let until = (Local::now() + Duration::minutes(minutes as i64))
            .format("%H:%M")
            .to_string();
        repository
            .snooze(&input.date, input.reminder_key.trim(), &until)
            .await
            .map_err(PriorityReminderServiceError::Database)
    }

    pub async fn dismiss(
        repository: &PriorityReminderRepository<'_>,
        input: DismissPriorityReminderInput,
    ) -> Result<Vec<PriorityReminder>, PriorityReminderServiceError> {
        validate_date(&input.date)?;
        repository
            .dismiss(&input.date, input.reminder_key.trim())
            .await
            .map_err(PriorityReminderServiceError::Database)
    }
}

#[derive(Debug)]
pub enum PriorityReminderServiceError {
    Validation(String),
    Database(sqlx::Error),
}

fn validate_date(value: &str) -> Result<(), PriorityReminderServiceError> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d").map_err(|_| {
        PriorityReminderServiceError::Validation("Date must be YYYY-MM-DD".to_string())
    })?;
    Ok(())
}

fn parse_time(value: &str) -> Result<NaiveTime, PriorityReminderServiceError> {
    NaiveTime::parse_from_str(value.trim(), "%H:%M")
        .map_err(|_| PriorityReminderServiceError::Validation("Time must be HH:MM".to_string()))
}

fn reminder_key(item_id: &str) -> String {
    format!("priority:{item_id}")
}
