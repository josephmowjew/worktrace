use crate::application::repositories::{CalendarEventStore, CalendarSourceStore};
use crate::domain::calendar::{
    CalendarEvent, CalendarSource, ConnectGoogleCalendarInput, DisconnectCalendarSourceInput,
    GetWeekCapacityInput, ListCalendarEventsInput, SyncCalendarEventsInput,
    SyncCalendarEventsResult, WeekCapacity,
};

pub struct CalendarService;

impl CalendarService {
    pub async fn connect_google(
        sources: &impl CalendarSourceStore,
        input: ConnectGoogleCalendarInput,
    ) -> Result<CalendarSource, CalendarServiceError> {
        let client_id = std::env::var("WORKTRACE_GOOGLE_CLIENT_ID").map_err(|_| {
            CalendarServiceError::Validation(
                "Set WORKTRACE_GOOGLE_CLIENT_ID before connecting Google Calendar.".to_string(),
            )
        })?;

        if client_id.trim().is_empty() {
            return Err(CalendarServiceError::Validation(
                "Google Calendar client id is empty.".to_string(),
            ));
        }

        let account_email = input
            .account_email
            .filter(|email| !email.trim().is_empty())
            .unwrap_or_else(|| "google-calendar@worktrace.local".to_string());

        sources
            .upsert_google_source(&account_email, Some("Google Calendar".to_string()), None)
            .await
            .map_err(CalendarServiceError::Database)
    }

    pub async fn disconnect(
        sources: &impl CalendarSourceStore,
        input: DisconnectCalendarSourceInput,
    ) -> Result<bool, CalendarServiceError> {
        if input.source_id.trim().is_empty() {
            return Err(CalendarServiceError::Validation(
                "Calendar source is required".to_string(),
            ));
        }

        sources
            .disconnect(&input.source_id)
            .await
            .map_err(CalendarServiceError::Database)
    }

    pub async fn sync(
        sources: &impl CalendarSourceStore,
        input: SyncCalendarEventsInput,
    ) -> Result<SyncCalendarEventsResult, CalendarServiceError> {
        validate_range(&input.from, &input.to)?;
        let connected = sources
            .list()
            .await
            .map_err(CalendarServiceError::Database)?;
        let source_id = input
            .source_id
            .or_else(|| connected.first().map(|source| source.id.clone()));

        if source_id.is_none() {
            return Err(CalendarServiceError::Validation(
                "Connect Google Calendar before syncing events.".to_string(),
            ));
        }

        Ok(SyncCalendarEventsResult {
            source_id,
            imported: 0,
            updated: 0,
            cancelled: 0,
            message: "Calendar source is connected. Event import requires Google OAuth token exchange configuration.".to_string(),
        })
    }

    pub async fn list_events(
        events: &impl CalendarEventStore,
        input: ListCalendarEventsInput,
    ) -> Result<Vec<CalendarEvent>, CalendarServiceError> {
        validate_range(&input.from, &input.to)?;

        events
            .list(input)
            .await
            .map_err(CalendarServiceError::Database)
    }

    pub async fn week_capacity(
        events: &impl CalendarEventStore,
        input: GetWeekCapacityInput,
    ) -> Result<WeekCapacity, CalendarServiceError> {
        validate_range(&input.week_start_date, &input.week_end_date)?;

        events
            .week_capacity(input)
            .await
            .map_err(CalendarServiceError::Database)
    }
}

#[derive(Debug)]
pub enum CalendarServiceError {
    Validation(String),
    Database(sqlx::Error),
}

fn validate_range(from: &str, to: &str) -> Result<(), CalendarServiceError> {
    if from.trim().is_empty() || to.trim().is_empty() {
        return Err(CalendarServiceError::Validation(
            "Calendar date range is required".to_string(),
        ));
    }

    Ok(())
}
