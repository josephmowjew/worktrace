use std::collections::HashMap;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{Duration as ChronoDuration, Utc};
use keyring::Entry;
use rand::{distributions::Alphanumeric, Rng};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::{timeout, Duration};

use crate::application::repositories::CalendarEventStore;
use crate::domain::calendar::{
    CalendarEvent, CalendarSource, ConnectGoogleCalendarInput, DisconnectCalendarSourceInput,
    GetWeekCapacityInput, ListCalendarEventsInput, SetCalendarSourceEnabledInput,
    SyncCalendarEventsInput, SyncCalendarEventsResult, WeekCapacity,
};
use crate::infrastructure::database::repositories::{
    CalendarEventRepository, CalendarSourceRepository,
};

const KEYRING_SERVICE: &str = "WorkTrace";
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_LIST_URL: &str =
    "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const GOOGLE_EVENTS_URL: &str = "https://www.googleapis.com/calendar/v3/calendars";
const GOOGLE_CALENDAR_SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";
const OAUTH_TIMEOUT_SECONDS: u64 = 180;

pub struct CalendarService;

impl CalendarService {
    pub async fn connect_google(
        app: &AppHandle,
        sources: &CalendarSourceRepository<'_>,
        input: ConnectGoogleCalendarInput,
    ) -> Result<Vec<CalendarSource>, CalendarServiceError> {
        let client_id = input.client_id.trim();
        if client_id.is_empty() {
            return Err(CalendarServiceError::Validation(
                "Paste a Google Desktop OAuth client ID before connecting Calendar.".to_string(),
            ));
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|error| CalendarServiceError::OAuth(error.to_string()))?;
        let redirect_uri = format!(
            "http://127.0.0.1:{}",
            listener
                .local_addr()
                .map_err(|error| CalendarServiceError::OAuth(error.to_string()))?
                .port()
        );
        let verifier = random_token(64);
        let challenge = pkce_challenge(&verifier);
        let state = random_token(32);
        let auth_url = format!(
            "{GOOGLE_AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}&code_challenge={}&code_challenge_method=S256",
            urlencoding::encode(client_id),
            urlencoding::encode(&redirect_uri),
            urlencoding::encode(GOOGLE_CALENDAR_SCOPE),
            urlencoding::encode(&state),
            urlencoding::encode(&challenge),
        );

        app.opener()
            .open_url(auth_url, None::<&str>)
            .map_err(|error| CalendarServiceError::OAuth(error.to_string()))?;
        let code = wait_for_oauth_code(listener, &state).await?;
        let token = exchange_code(client_id, &redirect_uri, &verifier, &code).await?;
        let access_expires_at = token
            .expires_in
            .map(|seconds| Utc::now() + ChronoDuration::seconds(seconds.max(60) - 30))
            .map(|value| value.to_rfc3339());
        let calendars = fetch_calendar_list(&token.access_token).await?;
        let account_email = calendars
            .iter()
            .find(|calendar| calendar.primary.unwrap_or(false))
            .and_then(|calendar| calendar.id.clone())
            .unwrap_or_else(|| "google-calendar@worktrace.local".to_string());
        let mut connected = Vec::new();

        for calendar in calendars {
            let Some(calendar_id) = calendar
                .id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
            else {
                continue;
            };
            let source_preview_id = format!(
                "google_calendar_{}",
                URL_SAFE_NO_PAD.encode(calendar_id.as_bytes())
            );
            let access_ref = google_access_token_ref(&source_preview_id);
            set_secret(&access_ref, &token.access_token)?;
            let refresh_ref = if let Some(refresh_token) = token.refresh_token.as_deref() {
                let refresh_ref = google_refresh_token_ref(&source_preview_id);
                set_secret(&refresh_ref, refresh_token)?;
                Some(refresh_ref)
            } else {
                None
            };
            let status = if calendar.primary.unwrap_or(false) {
                "connected"
            } else {
                "disconnected"
            };
            let source = sources
                .upsert_google_calendar_source(
                    &account_email,
                    calendar.summary_override.or(calendar.summary),
                    calendar_id,
                    None,
                    access_ref,
                    refresh_ref,
                    access_expires_at.clone(),
                    client_id.to_string(),
                    status,
                )
                .await
                .map_err(CalendarServiceError::Database)?;
            connected.push(source);
        }

        if connected.is_empty() {
            return Err(CalendarServiceError::Google(
                "Google returned no calendars for this account.".to_string(),
            ));
        }

        Ok(connected)
    }

    pub async fn disconnect(
        sources: &CalendarSourceRepository<'_>,
        input: DisconnectCalendarSourceInput,
    ) -> Result<bool, CalendarServiceError> {
        if input.source_id.trim().is_empty() {
            return Err(CalendarServiceError::Validation(
                "Calendar source is required".to_string(),
            ));
        }
        if let Some(source) = sources
            .find(&input.source_id)
            .await
            .map_err(CalendarServiceError::Database)?
        {
            delete_secret(source.access_token_ref.as_deref());
            delete_secret(source.refresh_token_ref.as_deref());
            delete_secret(source.token_ref.as_deref());
        }

        sources
            .disconnect(&input.source_id)
            .await
            .map_err(CalendarServiceError::Database)
    }

    pub async fn set_enabled(
        sources: &CalendarSourceRepository<'_>,
        input: SetCalendarSourceEnabledInput,
    ) -> Result<CalendarSource, CalendarServiceError> {
        if input.source_id.trim().is_empty() {
            return Err(CalendarServiceError::Validation(
                "Calendar source is required".to_string(),
            ));
        }

        sources
            .set_enabled(&input.source_id, input.enabled)
            .await
            .map_err(CalendarServiceError::Database)?
            .ok_or_else(|| {
                CalendarServiceError::Validation("Calendar source was not found.".to_string())
            })
    }

    pub async fn sync(
        sources: &CalendarSourceRepository<'_>,
        events: &CalendarEventRepository<'_>,
        input: SyncCalendarEventsInput,
    ) -> Result<SyncCalendarEventsResult, CalendarServiceError> {
        validate_range(&input.from, &input.to)?;
        let all_sources = sources
            .list()
            .await
            .map_err(CalendarServiceError::Database)?;
        let mut selected_sources = all_sources
            .into_iter()
            .filter(|source| source.provider == "google" && source.sync_status == "connected")
            .filter(|source| {
                input
                    .source_id
                    .as_deref()
                    .map(|id| source.id == id)
                    .unwrap_or(true)
            })
            .collect::<Vec<_>>();

        if selected_sources.is_empty() {
            return Err(CalendarServiceError::Validation(
                "Connect at least one Google calendar before syncing events.".to_string(),
            ));
        }

        let mut imported = 0;
        let mut updated = 0;
        let mut cancelled = 0;
        let mut result_source_id = None;

        for source in selected_sources.iter_mut() {
            result_source_id = Some(source.id.clone());
            sources
                .update_calendar_source_sync(&source.id, "syncing", None, None, None)
                .await
                .map_err(CalendarServiceError::Database)?;
            let access_token = access_token_for_source(sources, source).await?;
            match fetch_events_for_source(source, &access_token, &input.from, &input.to).await {
                Ok(sync_result) => {
                    let (new_count, updated_count) = events
                        .upsert_many(&sync_result.events)
                        .await
                        .map_err(CalendarServiceError::Database)?;
                    imported += new_count;
                    updated += updated_count;
                    cancelled += sync_result.cancelled;
                    sources
                        .update_calendar_source_sync(
                            &source.id,
                            "connected",
                            Some(Utc::now().to_rfc3339()),
                            sync_result.next_sync_token,
                            None,
                        )
                        .await
                        .map_err(CalendarServiceError::Database)?;
                }
                Err(error) => {
                    let message = error.to_string();
                    sources
                        .update_calendar_source_sync(
                            &source.id,
                            "error",
                            None,
                            None,
                            Some(message.clone()),
                        )
                        .await
                        .map_err(CalendarServiceError::Database)?;
                    return Err(CalendarServiceError::Google(message));
                }
            }
        }

        Ok(SyncCalendarEventsResult {
            source_id: result_source_id,
            imported,
            updated,
            cancelled,
            message: format!(
                "Imported {imported} new events, updated {updated}, and marked {cancelled} cancelled."
            ),
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
    Keyring(String),
    OAuth(String),
    Google(String),
}

impl std::fmt::Display for CalendarServiceError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(message)
            | Self::Keyring(message)
            | Self::OAuth(message)
            | Self::Google(message) => formatter.write_str(message),
            Self::Database(error) => write!(formatter, "{error}"),
        }
    }
}

fn validate_range(from: &str, to: &str) -> Result<(), CalendarServiceError> {
    if from.trim().is_empty() || to.trim().is_empty() {
        return Err(CalendarServiceError::Validation(
            "Calendar date range is required".to_string(),
        ));
    }

    Ok(())
}

fn random_token(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

async fn wait_for_oauth_code(
    listener: TcpListener,
    expected_state: &str,
) -> Result<String, CalendarServiceError> {
    let (mut stream, _) = timeout(
        Duration::from_secs(OAUTH_TIMEOUT_SECONDS),
        listener.accept(),
    )
    .await
    .map_err(|_| CalendarServiceError::OAuth("Google authorization timed out.".to_string()))?
    .map_err(|error| CalendarServiceError::OAuth(error.to_string()))?;
    let mut buffer = vec![0_u8; 4096];
    let bytes = stream
        .read(&mut buffer)
        .await
        .map_err(|error| CalendarServiceError::OAuth(error.to_string()))?;
    let request = String::from_utf8_lossy(&buffer[..bytes]);
    let request_line = request.lines().next().unwrap_or_default();
    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| CalendarServiceError::OAuth("OAuth callback was malformed.".to_string()))?;
    let query = path.split_once('?').map(|(_, query)| query).unwrap_or("");
    let params = query
        .split('&')
        .filter_map(|part| {
            let (key, value) = part.split_once('=')?;
            Some((
                key.to_string(),
                urlencoding::decode(value).ok()?.into_owned(),
            ))
        })
        .collect::<HashMap<_, _>>();
    let html = "<html><body><h1>WorkTrace Calendar connected</h1><p>You can close this tab and return to WorkTrace.</p></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    let _ = stream.write_all(response.as_bytes()).await;

    if params.get("state").map(String::as_str) != Some(expected_state) {
        return Err(CalendarServiceError::OAuth(
            "Google authorization state did not match.".to_string(),
        ));
    }
    if let Some(error) = params.get("error") {
        return Err(CalendarServiceError::OAuth(format!(
            "Google authorization failed: {error}"
        )));
    }
    params
        .get("code")
        .cloned()
        .filter(|code| !code.trim().is_empty())
        .ok_or_else(|| {
            CalendarServiceError::OAuth("Google returned no authorization code.".to_string())
        })
}

async fn exchange_code(
    client_id: &str,
    redirect_uri: &str,
    verifier: &str,
    code: &str,
) -> Result<GoogleTokenResponse, CalendarServiceError> {
    let response = Client::new()
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|error| CalendarServiceError::OAuth(error.to_string()))?;
    parse_google_response(response, "Google token exchange failed").await
}

async fn refresh_access_token(
    client_id: &str,
    refresh_token: &str,
) -> Result<GoogleTokenResponse, CalendarServiceError> {
    let response = Client::new()
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|error| CalendarServiceError::OAuth(error.to_string()))?;
    parse_google_response(response, "Google token refresh failed").await
}

async fn parse_google_response<T: for<'de> Deserialize<'de>>(
    response: reqwest::Response,
    prefix: &str,
) -> Result<T, CalendarServiceError> {
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CalendarServiceError::Google(format!(
            "{prefix} with {status}: {body}"
        )));
    }
    response
        .json()
        .await
        .map_err(|error| CalendarServiceError::Google(error.to_string()))
}

async fn fetch_calendar_list(
    access_token: &str,
) -> Result<Vec<GoogleCalendarListEntry>, CalendarServiceError> {
    let response = Client::new()
        .get(GOOGLE_CALENDAR_LIST_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|error| CalendarServiceError::Google(error.to_string()))?;
    let body: GoogleCalendarListResponse =
        parse_google_response(response, "Google calendar list failed").await?;
    Ok(body.items)
}

async fn access_token_for_source(
    _sources: &CalendarSourceRepository<'_>,
    source: &CalendarSource,
) -> Result<String, CalendarServiceError> {
    let Some(access_ref) = source
        .access_token_ref
        .as_deref()
        .or(source.token_ref.as_deref())
    else {
        return Err(CalendarServiceError::Validation(
            "Reconnect Google Calendar before syncing events.".to_string(),
        ));
    };
    if source
        .access_expires_at
        .as_deref()
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|expires| expires.with_timezone(&Utc) > Utc::now() + ChronoDuration::minutes(2))
        .unwrap_or(false)
    {
        return get_secret(access_ref);
    }

    let Some(refresh_ref) = source.refresh_token_ref.as_deref() else {
        return get_secret(access_ref);
    };
    let refresh_token = get_secret(refresh_ref)?;
    let client_id = source.google_client_id.as_deref().ok_or_else(|| {
        CalendarServiceError::Validation(
            "Reconnect Google Calendar before refreshing access.".to_string(),
        )
    })?;
    let refreshed = refresh_access_token(client_id, &refresh_token).await?;
    set_secret(access_ref, &refreshed.access_token)?;
    Ok(refreshed.access_token)
}

async fn fetch_events_for_source(
    source: &CalendarSource,
    access_token: &str,
    from: &str,
    to: &str,
) -> Result<GoogleSyncResult, CalendarServiceError> {
    let calendar_id = source
        .calendar_id
        .as_deref()
        .ok_or_else(|| CalendarServiceError::Validation("Calendar id is missing.".to_string()))?;
    let base_url = format!(
        "{GOOGLE_EVENTS_URL}/{}/events?singleEvents=true&showDeleted=true&maxResults=2500",
        urlencoding::encode(calendar_id)
    );
    let mut url = base_url.clone();
    let has_sync_token = source
        .sync_token
        .as_deref()
        .filter(|value| !value.is_empty())
        .is_some();
    if let Some(sync_token) = source
        .sync_token
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        url.push_str("&syncToken=");
        url.push_str(&urlencoding::encode(sync_token));
    } else {
        url.push_str("&timeMin=");
        url.push_str(&urlencoding::encode(&format!("{from}T00:00:00Z")));
        url.push_str("&timeMax=");
        url.push_str(&urlencoding::encode(&format!("{to}T23:59:59Z")));
        url.push_str("&orderBy=startTime");
    }

    let mut events = Vec::new();
    let mut cancelled = 0;
    let mut next_sync_token = None;
    let now = Utc::now().to_rfc3339();
    let mut retried_full_sync = false;

    loop {
        let response = Client::new()
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|error| CalendarServiceError::Google(error.to_string()))?;
        if response.status() == StatusCode::GONE && has_sync_token && !retried_full_sync {
            retried_full_sync = true;
            events.clear();
            cancelled = 0;
            next_sync_token = None;
            url = format!(
                "{}&timeMin={}&timeMax={}&orderBy=startTime",
                base_url,
                urlencoding::encode(&format!("{from}T00:00:00Z")),
                urlencoding::encode(&format!("{to}T23:59:59Z"))
            );
            continue;
        }
        if response.status() == StatusCode::GONE {
            return Err(CalendarServiceError::Google(
                "Google sync token expired and a full sync retry was not accepted.".to_string(),
            ));
        }
        let body: GoogleEventsResponse =
            parse_google_response(response, "Google calendar event sync failed").await?;
        for item in body.items {
            if item.status.as_deref() == Some("cancelled") {
                cancelled += 1;
            }
            if let Some(event) = map_google_event(source, item, &now) {
                events.push(event);
            }
        }
        if let Some(token) = body.next_sync_token {
            next_sync_token = Some(token);
            break;
        }
        let Some(page_token) = body.next_page_token else {
            break;
        };
        url = format!(
            "{}&pageToken={}",
            base_url,
            urlencoding::encode(&page_token)
        );
        if !retried_full_sync {
            if let Some(sync_token) = source
                .sync_token
                .as_deref()
                .filter(|value| !value.is_empty())
            {
                url.push_str("&syncToken=");
                url.push_str(&urlencoding::encode(sync_token));
            } else {
                url.push_str("&timeMin=");
                url.push_str(&urlencoding::encode(&format!("{from}T00:00:00Z")));
                url.push_str("&timeMax=");
                url.push_str(&urlencoding::encode(&format!("{to}T23:59:59Z")));
                url.push_str("&orderBy=startTime");
            }
        } else {
            url.push_str("&timeMin=");
            url.push_str(&urlencoding::encode(&format!("{from}T00:00:00Z")));
            url.push_str("&timeMax=");
            url.push_str(&urlencoding::encode(&format!("{to}T23:59:59Z")));
            url.push_str("&orderBy=startTime");
        }
    }

    Ok(GoogleSyncResult {
        events,
        cancelled,
        next_sync_token,
    })
}

fn map_google_event(
    source: &CalendarSource,
    item: GoogleEvent,
    now: &str,
) -> Option<CalendarEvent> {
    let external_id = item.id?;
    let (starts_at, start_timezone, all_day) = google_event_time(item.start?)?;
    let (ends_at, end_timezone, _) = google_event_time(item.end?)?;
    Some(CalendarEvent {
        id: crate::infrastructure::database::repositories::public_generate_id("calendar_event"),
        source_id: source.id.clone(),
        external_id,
        title: item.summary.unwrap_or_else(|| "Untitled event".to_string()),
        description: item.description,
        location: item.location,
        starts_at,
        ends_at,
        timezone: start_timezone.or(end_timezone),
        all_day,
        busy_status: if item.transparency.as_deref() == Some("transparent") {
            "free".to_string()
        } else {
            "busy".to_string()
        },
        is_cancelled: item.status.as_deref() == Some("cancelled"),
        project_id: None,
        task_id: None,
        created_at: now.to_string(),
        updated_at: now.to_string(),
        imported_at: now.to_string(),
    })
}

fn google_event_time(time: GoogleEventTime) -> Option<(String, Option<String>, bool)> {
    if let Some(date_time) = time.date_time {
        return Some((date_time, time.time_zone, false));
    }
    time.date
        .map(|date| (format!("{date}T00:00:00Z"), time.time_zone, true))
}

fn google_access_token_ref(source_id: &str) -> String {
    format!("google_calendar:{source_id}:access_token")
}

fn google_refresh_token_ref(source_id: &str) -> String {
    format!("google_calendar:{source_id}:refresh_token")
}

fn key_entry(user: &str) -> Result<Entry, CalendarServiceError> {
    Entry::new(KEYRING_SERVICE, user)
        .map_err(|error| CalendarServiceError::Keyring(error.to_string()))
}

fn get_secret(user: &str) -> Result<String, CalendarServiceError> {
    key_entry(user)?
        .get_password()
        .map_err(|error| CalendarServiceError::Keyring(error.to_string()))
}

fn set_secret(user: &str, value: &str) -> Result<(), CalendarServiceError> {
    key_entry(user)?
        .set_password(value)
        .map_err(|error| CalendarServiceError::Keyring(error.to_string()))
}

fn delete_secret(user: Option<&str>) {
    if let Some(user) = user {
        let _ = key_entry(user).and_then(|entry| {
            entry
                .delete_credential()
                .map_err(|error| CalendarServiceError::Keyring(error.to_string()))
        });
    }
}

#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct GoogleCalendarListResponse {
    items: Vec<GoogleCalendarListEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleCalendarListEntry {
    id: Option<String>,
    summary: Option<String>,
    summary_override: Option<String>,
    primary: Option<bool>,
}

#[derive(Debug)]
struct GoogleSyncResult {
    events: Vec<CalendarEvent>,
    cancelled: i32,
    next_sync_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleEventsResponse {
    items: Vec<GoogleEvent>,
    next_page_token: Option<String>,
    next_sync_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleEvent {
    id: Option<String>,
    status: Option<String>,
    summary: Option<String>,
    description: Option<String>,
    location: Option<String>,
    start: Option<GoogleEventTime>,
    end: Option<GoogleEventTime>,
    transparency: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleEventTime {
    date: Option<String>,
    date_time: Option<String>,
    time_zone: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::{google_event_time, pkce_challenge, GoogleEventTime};

    #[test]
    fn pkce_challenge_is_url_safe_sha256() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn google_event_time_handles_all_day_dates() {
        let (starts_at, _, all_day) = google_event_time(GoogleEventTime {
            date: Some("2026-05-29".to_string()),
            date_time: None,
            time_zone: None,
        })
        .expect("time");

        assert_eq!(starts_at, "2026-05-29T00:00:00Z");
        assert!(all_day);
    }
}
