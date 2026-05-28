use chrono::{DateTime, Duration, Utc};
use futures_util::stream::{self, StreamExt};
use keyring::Entry;
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::error::Error;

use crate::domain::sparc_force::{
    ConnectSparcForceInput, ListSparcForceRecordsInput, SparcForceCacheRecord,
    SparcForceConnection, SparcForceImportedData, SparcForceImportedItem,
    SparcForceIntegrationStatus, SparcForceLoginOutcome, SparcForceRecordQueryResult,
    SparcForceSyncResult, VerifySparcForceOtpInput,
};
use crate::infrastructure::database::repositories::SparcForceConnectionRepository;

const KEYRING_SERVICE: &str = "WorkTrace";
const PAGE_SIZE: usize = 100;
const CASE_TASK_FETCH_CONCURRENCY: usize = 6;

pub struct SparcForceService;

impl SparcForceService {
    pub async fn status(
        repository: &SparcForceConnectionRepository<'_>,
    ) -> Result<SparcForceIntegrationStatus, SparcForceError> {
        let connection = repository.get().await.map_err(SparcForceError::Database)?;
        status_from_connection(repository, connection.as_ref()).await
    }

    pub async fn connect(
        repository: &SparcForceConnectionRepository<'_>,
        input: ConnectSparcForceInput,
    ) -> Result<SparcForceLoginOutcome, SparcForceError> {
        let base_url = normalize_base_url(&input.base_url)?;
        let email = input.email.trim().to_string();
        let password = input.password.trim().to_string();

        if email.is_empty() {
            return Err(SparcForceError::Validation("Email is required".to_string()));
        }
        if password.is_empty() {
            return Err(SparcForceError::Validation(
                "Password is required".to_string(),
            ));
        }

        let existing = repository.get().await.map_err(SparcForceError::Database)?;
        let mut connection = existing.unwrap_or(
            repository
                .new_connection(base_url.clone(), email.clone())
                .await,
        );
        connection.base_url = base_url.clone();
        connection.account_email = email.clone();
        connection.updated_at = current_timestamp();

        let response = client()
            .post(format!("{base_url}/api/Auth/login"))
            .json(&json!({ "email": email, "password": password }))
            .send()
            .await
            .map_err(reqwest_error)?;

        if response.status() == StatusCode::TOO_MANY_REQUESTS {
            return Err(SparcForceError::Provider(
                "OTP request rate limit exceeded. Try again later.".to_string(),
            ));
        }

        if !response.status().is_success() {
            return Err(provider_status_error("Sparc Force login failed", response).await);
        }

        let body = response
            .json::<LoginResponse>()
            .await
            .map_err(|error| SparcForceError::Provider(error.to_string()))?;

        if let (Some(access_token), Some(refresh_token), Some(expires_at)) =
            (body.access_token, body.refresh_token, body.expires_at)
        {
            let old_otp_ref = connection.otp_session_ref.clone();
            let now = current_timestamp();
            connection.status = "connected".to_string();
            connection.remote_user_id = body.user.as_ref().and_then(|user| user.user_id);
            connection.remote_username = body.user.and_then(|user| user.username);
            connection.masked_email = None;
            connection.otp_session_ref = None;
            connection.otp_expires_at = None;
            connection.access_expires_at = Some(expires_at);
            connection.connected_at = connection.connected_at.or(Some(now.clone()));
            connection.last_validated_at = Some(now.clone());
            connection.last_error = None;
            connection.updated_at = now;
            ensure_token_refs(&mut connection);
            set_secret(
                connection.access_token_ref.as_deref().unwrap_or_default(),
                &access_token,
            )?;
            set_secret(
                connection.refresh_token_ref.as_deref().unwrap_or_default(),
                &refresh_token,
            )?;
            if let Some(reference) = old_otp_ref.as_deref() {
                delete_secret(reference).ok();
            }
            repository
                .save(&connection)
                .await
                .map_err(SparcForceError::Database)?;

            return Ok(SparcForceLoginOutcome {
                status: status_from_connection(repository, Some(&connection)).await?,
                otp_required: false,
                message: "Sparc Force connected.".to_string(),
            });
        }

        let Some(login_session_token) = body.login_session_token else {
            return Err(SparcForceError::Provider(
                "Sparc Force returned an unsupported login response.".to_string(),
            ));
        };

        let otp_ref = format!("sparc_force:{}:otp_session", connection.id);
        set_secret(&otp_ref, &login_session_token)?;
        connection.status = "otp_required".to_string();
        connection.otp_session_ref = Some(otp_ref);
        connection.masked_email = body.masked_email;
        connection.otp_expires_at = body.otp_expires_at;
        connection.last_error = None;
        connection.updated_at = current_timestamp();
        ensure_token_refs(&mut connection);
        repository
            .save(&connection)
            .await
            .map_err(SparcForceError::Database)?;

        Ok(SparcForceLoginOutcome {
            status: status_from_connection(repository, Some(&connection)).await?,
            otp_required: true,
            message: body
                .message
                .unwrap_or_else(|| "Enter the OTP sent by Sparc Force.".to_string()),
        })
    }

    pub async fn verify_otp(
        repository: &SparcForceConnectionRepository<'_>,
        input: VerifySparcForceOtpInput,
    ) -> Result<SparcForceIntegrationStatus, SparcForceError> {
        let mut connection = connected_or_pending(repository).await?;
        let otp_code = input.otp_code.trim();
        if otp_code.is_empty() {
            return Err(SparcForceError::Validation(
                "OTP code is required".to_string(),
            ));
        }

        let otp_ref = connection
            .otp_session_ref
            .clone()
            .ok_or_else(|| SparcForceError::Validation("No OTP login is pending.".to_string()))?;
        let login_session_token = get_secret(&otp_ref)?;

        let response = client()
            .post(format!("{}/api/Auth/verify-login-otp", connection.base_url))
            .json(&json!({
                "loginSessionToken": login_session_token,
                "otpCode": otp_code,
            }))
            .send()
            .await
            .map_err(reqwest_error)?;

        if !response.status().is_success() {
            return Err(
                provider_status_error("Sparc Force OTP verification failed", response).await,
            );
        }

        let body = response
            .json::<LoginResponse>()
            .await
            .map_err(|error| SparcForceError::Provider(error.to_string()))?;
        let access_token = body.access_token.ok_or_else(|| {
            SparcForceError::Provider("Sparc Force did not return an access token.".to_string())
        })?;
        let refresh_token = body.refresh_token.ok_or_else(|| {
            SparcForceError::Provider("Sparc Force did not return a refresh token.".to_string())
        })?;

        let now = current_timestamp();
        ensure_token_refs(&mut connection);
        set_secret(
            connection.access_token_ref.as_deref().unwrap_or_default(),
            &access_token,
        )?;
        set_secret(
            connection.refresh_token_ref.as_deref().unwrap_or_default(),
            &refresh_token,
        )?;
        delete_secret(&otp_ref).ok();
        connection.status = "connected".to_string();
        connection.remote_user_id = body.user.as_ref().and_then(|user| user.user_id);
        connection.remote_username = body.user.and_then(|user| user.username);
        connection.otp_session_ref = None;
        connection.otp_expires_at = None;
        connection.access_expires_at = body.expires_at;
        connection.connected_at = connection.connected_at.or(Some(now.clone()));
        connection.last_validated_at = Some(now.clone());
        connection.last_error = None;
        connection.updated_at = now;
        repository
            .save(&connection)
            .await
            .map_err(SparcForceError::Database)?;

        status_from_connection(repository, Some(&connection)).await
    }

    pub async fn test_connection(
        repository: &SparcForceConnectionRepository<'_>,
    ) -> Result<SparcForceIntegrationStatus, SparcForceError> {
        let mut connection = connected_or_pending(repository).await?;
        let token = access_token(repository, &mut connection).await?;
        let response = authorized_get(
            &connection.base_url,
            "/api/Cases/my-cases?page=1&limit=1",
            &token,
        )
        .await?;

        if !response.status().is_success() {
            return Err(provider_status_error("Sparc Force test failed", response).await);
        }

        connection.status = "connected".to_string();
        connection.last_validated_at = Some(current_timestamp());
        connection.last_error = None;
        connection.updated_at = current_timestamp();
        repository
            .save(&connection)
            .await
            .map_err(SparcForceError::Database)?;

        status_from_connection(repository, Some(&connection)).await
    }

    pub async fn sync(
        repository: &SparcForceConnectionRepository<'_>,
    ) -> Result<SparcForceSyncResult, SparcForceError> {
        let mut connection = connected_or_pending(repository).await?;
        let token = access_token(repository, &mut connection).await?;
        let user_id = match connection.remote_user_id {
            Some(id) => id,
            None => resolve_user_id(repository, &mut connection, &token).await?,
        };

        let mut cases_imported = 0usize;
        let mut projects_imported = 0usize;
        let mut tasks_imported = 0usize;
        let mut standalone_tasks_enabled = true;

        let cases = match fetch_paginated(
            &connection.base_url,
            "/api/Cases?sortBy=Updated_At&sortDirection=desc",
            "limit",
            &token,
        )
        .await
        {
            Ok(cases) => cases,
            Err(_) => {
                fetch_paginated(
                    &connection.base_url,
                    &format!("/api/Cases/assigned/{user_id}"),
                    "limit",
                    &token,
                )
                .await?
            }
        };
        let case_ids = cases
            .iter()
            .filter_map(|item| value_i64(item, &["case_ID", "caseId"]).map(|id| id.to_string()))
            .collect::<Vec<_>>();

        for item in cases {
            let record = case_record(&item)?;
            repository
                .upsert_case(&connection.id, &record)
                .await
                .map_err(SparcForceError::Database)?;
            cases_imported += 1;
        }

        for item in fetch_paginated(&connection.base_url, "/api/Project", "limit", &token).await? {
            let record = project_record(&item)?;
            repository
                .upsert_project(&connection.id, &record)
                .await
                .map_err(SparcForceError::Database)?;
            projects_imported += 1;
        }

        let mut seen_tasks = HashSet::<(String, String)>::new();

        for item in fetch_paginated(
            &connection.base_url,
            &format!("/api/ProjectTask/user/{user_id}"),
            "pageSize",
            &token,
        )
        .await?
        {
            let record = task_record(&item)?;
            if !seen_tasks.insert(("project_task".to_string(), record.external_id.clone())) {
                continue;
            }
            repository
                .upsert_task(&connection.id, "project_task_user", &record)
                .await
                .map_err(SparcForceError::Database)?;
            tasks_imported += 1;
        }

        match fetch_paginated(
            &connection.base_url,
            &format!("/api/tasks?assignedTo={user_id}"),
            "pageSize",
            &token,
        )
        .await
        {
            Ok(items) => {
                for item in items {
                    let record = task_record(&item)?;
                    if !seen_tasks.insert(("task".to_string(), record.external_id.clone())) {
                        continue;
                    }
                    repository
                        .upsert_task(&connection.id, "standalone_assigned", &record)
                        .await
                        .map_err(SparcForceError::Database)?;
                    tasks_imported += 1;
                }
            }
            Err(SparcForceError::StandaloneTasksDisabled) => {
                standalone_tasks_enabled = false;
            }
            Err(error) => return Err(error),
        }

        let case_task_results = stream::iter(case_ids)
            .map(|case_id| {
                let base_url = connection.base_url.clone();
                let token = token.clone();
                async move { fetch_case_scoped_tasks(&base_url, &token, &case_id).await }
            })
            .buffer_unordered(CASE_TASK_FETCH_CONCURRENCY);

        futures_util::pin_mut!(case_task_results);
        while let Some(result) = case_task_results.next().await {
            match result {
                Ok(items) => {
                    for (source, record) in items {
                        let canonical_kind = if source == "project_task_case" {
                            "project_task"
                        } else {
                            "task"
                        };
                        if !seen_tasks
                            .insert((canonical_kind.to_string(), record.external_id.clone()))
                        {
                            continue;
                        }
                        repository
                            .upsert_task(&connection.id, source, &record)
                            .await
                            .map_err(SparcForceError::Database)?;
                        tasks_imported += 1;
                    }
                }
                Err(SparcForceError::StandaloneTasksDisabled) => {
                    standalone_tasks_enabled = false;
                }
                Err(error) => return Err(error),
            }
        }

        connection.status = "connected".to_string();
        connection.last_synced_at = Some(current_timestamp());
        connection.last_error = None;
        connection.updated_at = current_timestamp();
        repository
            .save(&connection)
            .await
            .map_err(SparcForceError::Database)?;

        Ok(SparcForceSyncResult {
            cases_imported,
            projects_imported,
            tasks_imported,
            standalone_tasks_enabled,
            message: format!(
                "Imported {cases_imported} cases, {projects_imported} projects, and {tasks_imported} tasks."
            ),
        })
    }

    pub async fn imported_data(
        repository: &SparcForceConnectionRepository<'_>,
    ) -> Result<SparcForceImportedData, SparcForceError> {
        repository
            .imported_data(20)
            .await
            .map_err(SparcForceError::Database)
    }

    pub async fn list_records(
        repository: &SparcForceConnectionRepository<'_>,
        input: ListSparcForceRecordsInput,
    ) -> Result<SparcForceRecordQueryResult, SparcForceError> {
        repository
            .list_records(input)
            .await
            .map_err(SparcForceError::Database)
    }

    pub async fn get_case_detail(
        repository: &SparcForceConnectionRepository<'_>,
        external_id: String,
    ) -> Result<SparcForceImportedItem, SparcForceError> {
        let mut connection = connected_or_pending(repository).await?;
        let cached = repository
            .find_case_record(&external_id)
            .await
            .map_err(SparcForceError::Database)?
            .ok_or_else(|| {
                SparcForceError::Validation("Sparc Force case was not found.".to_string())
            })?;

        if case_raw_json_has_description(&cached.raw_json) {
            return Ok(cached);
        }

        let token = access_token(repository, &mut connection).await?;
        let detail = fetch_case_detail(&connection.base_url, &token, &external_id).await?;
        let merged = merge_case_detail(cached.raw_json.as_str(), detail);
        let record = case_record(&merged)?;
        repository
            .upsert_case(&connection.id, &record)
            .await
            .map_err(SparcForceError::Database)?;

        repository
            .find_case_record(&external_id)
            .await
            .map_err(SparcForceError::Database)?
            .ok_or_else(|| {
                SparcForceError::Validation("Sparc Force case was not found.".to_string())
            })
    }

    pub async fn disconnect(
        repository: &SparcForceConnectionRepository<'_>,
    ) -> Result<SparcForceIntegrationStatus, SparcForceError> {
        let Some(mut connection) = repository.get().await.map_err(SparcForceError::Database)?
        else {
            return Self::status(repository).await;
        };

        if let (Some(access_ref), Some(refresh_ref)) = (
            connection.access_token_ref.as_deref(),
            connection.refresh_token_ref.as_deref(),
        ) {
            if let (Ok(access_token), Ok(refresh_token)) =
                (get_secret(access_ref), get_secret(refresh_ref))
            {
                let _ = client()
                    .post(format!("{}/api/Auth/logout", connection.base_url))
                    .bearer_auth(access_token)
                    .json(&json!({ "refreshToken": refresh_token }))
                    .send()
                    .await;
            }
        }

        if let Some(reference) = connection.access_token_ref.as_deref() {
            delete_secret(reference).ok();
        }
        if let Some(reference) = connection.refresh_token_ref.as_deref() {
            delete_secret(reference).ok();
        }
        if let Some(reference) = connection.otp_session_ref.as_deref() {
            delete_secret(reference).ok();
        }

        connection.status = "disconnected".to_string();
        connection.otp_session_ref = None;
        connection.access_expires_at = None;
        connection.otp_expires_at = None;
        connection.last_error = None;
        connection.updated_at = current_timestamp();
        repository
            .save(&connection)
            .await
            .map_err(SparcForceError::Database)?;

        status_from_connection(repository, Some(&connection)).await
    }
}

async fn access_token(
    repository: &SparcForceConnectionRepository<'_>,
    connection: &mut SparcForceConnection,
) -> Result<String, SparcForceError> {
    if connection.status != "connected" {
        return Err(SparcForceError::Validation(
            "Connect Sparc Force before testing or syncing.".to_string(),
        ));
    }

    if should_refresh(connection.access_expires_at.as_deref()) {
        refresh_tokens(repository, connection).await?;
    }

    let access_ref = connection.access_token_ref.as_deref().ok_or_else(|| {
        SparcForceError::Validation("Sparc Force access token is missing.".to_string())
    })?;
    get_secret(access_ref)
}

async fn refresh_tokens(
    repository: &SparcForceConnectionRepository<'_>,
    connection: &mut SparcForceConnection,
) -> Result<(), SparcForceError> {
    let refresh_ref = connection.refresh_token_ref.as_deref().ok_or_else(|| {
        SparcForceError::Validation("Sparc Force refresh token is missing.".to_string())
    })?;
    let refresh_token = get_secret(refresh_ref)?;
    let response = client()
        .post(format!("{}/api/Auth/refresh", connection.base_url))
        .json(&json!({ "refreshToken": refresh_token }))
        .send()
        .await
        .map_err(reqwest_error)?;

    if !response.status().is_success() {
        connection.status = "reauth_required".to_string();
        connection.last_error =
            Some("Sparc Force session expired. Reconnect the integration.".to_string());
        connection.updated_at = current_timestamp();
        repository
            .save(connection)
            .await
            .map_err(SparcForceError::Database)?;
        return Err(SparcForceError::Validation(
            "Sparc Force session expired. Reconnect the integration.".to_string(),
        ));
    }

    let body = response
        .json::<LoginResponse>()
        .await
        .map_err(|error| SparcForceError::Provider(error.to_string()))?;
    let access_token = body.access_token.ok_or_else(|| {
        SparcForceError::Provider("Sparc Force refresh did not return an access token.".to_string())
    })?;
    let refresh_token = body.refresh_token.ok_or_else(|| {
        SparcForceError::Provider("Sparc Force refresh did not return a refresh token.".to_string())
    })?;
    ensure_token_refs(connection);
    set_secret(
        connection.access_token_ref.as_deref().unwrap_or_default(),
        &access_token,
    )?;
    set_secret(
        connection.refresh_token_ref.as_deref().unwrap_or_default(),
        &refresh_token,
    )?;
    connection.status = "connected".to_string();
    connection.access_expires_at = body.expires_at;
    connection.last_error = None;
    connection.updated_at = current_timestamp();
    repository
        .save(connection)
        .await
        .map_err(SparcForceError::Database)?;

    Ok(())
}

async fn resolve_user_id(
    repository: &SparcForceConnectionRepository<'_>,
    connection: &mut SparcForceConnection,
    token: &str,
) -> Result<i64, SparcForceError> {
    let path = format!(
        "/api/Auth/users?Search={}&page=1&pageSize=10",
        connection.account_email
    );
    let response = authorized_get(&connection.base_url, &path, token).await?;

    if response.status() == StatusCode::FORBIDDEN {
        return Err(SparcForceError::Validation(
            "The Sparc Force integration user cannot search users. Use an account with user-management visibility or disable user-specific import.".to_string(),
        ));
    }
    if !response.status().is_success() {
        return Err(provider_status_error("Sparc Force user lookup failed", response).await);
    }

    let body = response
        .json::<Paginated<Value>>()
        .await
        .map_err(|error| SparcForceError::Provider(error.to_string()))?;
    let email = connection.account_email.to_lowercase();
    let user = body
        .data
        .into_iter()
        .find(|item| {
            value_string(item, &["email"])
                .unwrap_or_default()
                .to_lowercase()
                == email
        })
        .ok_or_else(|| {
            SparcForceError::Validation("Sparc Force user email was not found.".to_string())
        })?;
    let user_id = value_i64(&user, &["user_ID", "userId"]).ok_or_else(|| {
        SparcForceError::Provider("Sparc Force user record did not include user_ID.".to_string())
    })?;

    connection.remote_user_id = Some(user_id);
    connection.remote_username = value_string(&user, &["username", "fullName"]);
    connection.updated_at = current_timestamp();
    repository
        .save(connection)
        .await
        .map_err(SparcForceError::Database)?;

    Ok(user_id)
}

async fn fetch_paginated(
    base_url: &str,
    path: &str,
    size_param: &str,
    token: &str,
) -> Result<Vec<Value>, SparcForceError> {
    let mut page = 1usize;
    let mut output = Vec::new();

    loop {
        let separator = if path.contains('?') { '&' } else { '?' };
        let page_path = format!("{path}{separator}page={page}&{size_param}={PAGE_SIZE}");
        let response = authorized_get(base_url, &page_path, token).await?;

        if response.status() == StatusCode::NOT_FOUND && path.starts_with("/api/tasks")
            || response.status() == StatusCode::NOT_FOUND && path.contains("/tasks")
        {
            return Err(SparcForceError::StandaloneTasksDisabled);
        }

        if !response.status().is_success() {
            return Err(provider_status_error("Sparc Force import failed", response).await);
        }

        let body = response
            .json::<Paginated<Value>>()
            .await
            .map_err(|error| SparcForceError::Provider(error.to_string()))?;
        output.extend(body.data);

        if !body.pagination.has_next {
            break;
        }
        page += 1;
    }

    Ok(output)
}

async fn fetch_case_detail(
    base_url: &str,
    token: &str,
    external_id: &str,
) -> Result<Value, SparcForceError> {
    let response = authorized_get(base_url, &format!("/api/Cases/{external_id}"), token).await?;
    if !response.status().is_success() {
        return Err(provider_status_error("Sparc Force case detail failed", response).await);
    }

    response
        .json::<Value>()
        .await
        .map_err(|error| SparcForceError::Provider(error.to_string()))
}

fn merge_case_detail(cached_raw_json: &str, detail: Value) -> Value {
    match serde_json::from_str::<Value>(cached_raw_json) {
        Ok(cached) => merge_json_objects(cached, detail),
        Err(_) => detail,
    }
}

fn case_raw_json_has_description(raw_json: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(raw_json) else {
        return false;
    };
    value_string(
        &value,
        &[
            "description",
            "Description",
            "case_description",
            "case_Description",
            "caseDescription",
            "caseDescriptionHtml",
            "case_Description_HTML",
            "htmlDescription",
            "descriptionHtml",
        ],
    )
    .is_some()
}

fn merge_json_objects(summary: Value, detail: Value) -> Value {
    let Value::Object(mut summary) = summary else {
        return detail;
    };
    let Value::Object(detail) = detail else {
        return detail;
    };

    for (key, value) in detail {
        if !value.is_null() {
            summary.insert(key, value);
        }
    }

    Value::Object(summary)
}

async fn fetch_case_scoped_tasks(
    base_url: &str,
    token: &str,
    case_id: &str,
) -> Result<Vec<(&'static str, SparcForceCacheRecord)>, SparcForceError> {
    let mut output = Vec::new();

    match fetch_paginated(
        base_url,
        &format!("/api/Cases/{case_id}/tasks"),
        "pageSize",
        token,
    )
    .await
    {
        Ok(items) => {
            for item in items {
                output.push(("case_task", task_record(&item)?));
            }
        }
        Err(SparcForceError::StandaloneTasksDisabled) => {}
        Err(error) => return Err(error),
    }

    for item in fetch_paginated(
        base_url,
        &format!("/api/ProjectTask?caseId={case_id}"),
        "pageSize",
        token,
    )
    .await?
    {
        output.push(("project_task_case", task_record(&item)?));
    }

    Ok(output)
}

async fn authorized_get(
    base_url: &str,
    path: &str,
    token: &str,
) -> Result<reqwest::Response, SparcForceError> {
    client()
        .get(format!("{base_url}{path}"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(reqwest_error)
}

fn case_record(value: &Value) -> Result<SparcForceCacheRecord, SparcForceError> {
    let external_id = required_id(value, &["case_ID", "caseId"])?;
    Ok(SparcForceCacheRecord {
        external_id,
        title: value_string(value, &["title"]).unwrap_or_else(|| "Untitled case".to_string()),
        status: value_string(value, &["status"]),
        priority: value_string(value, &["priority"]),
        project_external_id: value_i64(value, &["project_ID", "projectId"])
            .map(|id| id.to_string()),
        case_external_id: None,
        assigned_to: value_i64(value, &["assigned_To", "assignedTo"]),
        updated_at_remote: value_string(value, &["updated_At", "updatedAt", "lastActivityDate"]),
        created_at_remote: value_string(
            value,
            &["created_At", "createdAt", "created_Date", "createdDate"],
        ),
        raw_json: value.to_string(),
    })
}

fn project_record(value: &Value) -> Result<SparcForceCacheRecord, SparcForceError> {
    let external_id = required_id(value, &["project_ID", "projectId"])?;
    Ok(SparcForceCacheRecord {
        external_id,
        title: value_string(value, &["project_Name", "projectName", "name", "title"])
            .unwrap_or_else(|| "Untitled project".to_string()),
        status: value_string(value, &["project_Status", "projectStatus", "status"]),
        priority: value_string(value, &["project_Priority", "projectPriority", "priority"]),
        project_external_id: None,
        case_external_id: None,
        assigned_to: None,
        updated_at_remote: value_string(value, &["updated_At", "updatedAt"]),
        created_at_remote: value_string(
            value,
            &["created_At", "createdAt", "created_Date", "createdDate"],
        ),
        raw_json: value.to_string(),
    })
}

fn task_record(value: &Value) -> Result<SparcForceCacheRecord, SparcForceError> {
    let external_id = required_id(value, &["task_ID", "taskId"])?;
    Ok(SparcForceCacheRecord {
        external_id,
        title: value_string(
            value,
            &[
                "task_Name",
                "taskName",
                "title",
                "task_Title",
                "taskTitle",
                "name",
                "summary",
                "subject",
            ],
        )
        .unwrap_or_else(|| "Untitled task".to_string()),
        status: value_string(value, &["status", "task_Status", "taskStatus"]),
        priority: value_string(value, &["priority", "task_Priority", "taskPriority"]),
        project_external_id: value_i64(
            value,
            &["project_ID", "projectId", "fk_Project_ID", "fkProjectId"],
        )
        .map(|id| id.to_string()),
        case_external_id: value_i64(value, &["case_ID", "caseId", "fk_Case_ID", "fkCaseId"])
            .map(|id| id.to_string()),
        assigned_to: value_i64(value, &["assigned_To", "assignedTo", "assigned_User_ID"]),
        updated_at_remote: value_string(
            value,
            &["updated_At", "updatedAt", "created_At", "createdAt"],
        ),
        created_at_remote: value_string(
            value,
            &["created_At", "createdAt", "created_Date", "createdDate"],
        ),
        raw_json: value.to_string(),
    })
}

fn required_id(value: &Value, keys: &[&str]) -> Result<String, SparcForceError> {
    value_i64(value, keys)
        .map(|id| id.to_string())
        .or_else(|| value_string(value, keys))
        .ok_or_else(|| {
            SparcForceError::Provider("Sparc Force record is missing its external id.".to_string())
        })
}

fn value_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|field| {
            field
                .as_str()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(|text| text.to_string())
                .or_else(|| field.as_i64().map(|number| number.to_string()))
        })
    })
}

fn value_i64(value: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|field| {
            field
                .as_i64()
                .or_else(|| field.as_str().and_then(|text| text.parse::<i64>().ok()))
        })
    })
}

async fn connected_or_pending(
    repository: &SparcForceConnectionRepository<'_>,
) -> Result<SparcForceConnection, SparcForceError> {
    repository
        .get()
        .await
        .map_err(SparcForceError::Database)?
        .ok_or_else(|| SparcForceError::Validation("Sparc Force is not configured.".to_string()))
}

async fn status_from_connection(
    repository: &SparcForceConnectionRepository<'_>,
    connection: Option<&SparcForceConnection>,
) -> Result<SparcForceIntegrationStatus, SparcForceError> {
    let Some(connection) = connection else {
        return Ok(SparcForceIntegrationStatus {
            addon_enabled: false,
            connected: false,
            status: "disconnected".to_string(),
            base_url: None,
            account_email: None,
            remote_user_id: None,
            remote_username: None,
            masked_email: None,
            connected_at: None,
            last_validated_at: None,
            last_synced_at: None,
            access_expires_at: None,
            otp_expires_at: None,
            has_access_token: false,
            has_refresh_token: false,
            imported_cases: 0,
            imported_projects: 0,
            imported_tasks: 0,
            last_error: None,
        });
    };

    let has_access_token = connection
        .access_token_ref
        .as_deref()
        .map(|reference| get_secret(reference).is_ok())
        .unwrap_or(false);
    let has_refresh_token = connection
        .refresh_token_ref
        .as_deref()
        .map(|reference| get_secret(reference).is_ok())
        .unwrap_or(false);
    let mut status = connection.status.clone();
    if status == "connected" && (!has_access_token || !has_refresh_token) {
        status = "reauth_required".to_string();
    }
    let counts = repository
        .import_counts(&connection.id)
        .await
        .map_err(SparcForceError::Database)?;

    Ok(SparcForceIntegrationStatus {
        addon_enabled: true,
        connected: status == "connected",
        status,
        base_url: Some(connection.base_url.clone()),
        account_email: Some(connection.account_email.clone()),
        remote_user_id: connection.remote_user_id,
        remote_username: connection.remote_username.clone(),
        masked_email: connection.masked_email.clone(),
        connected_at: connection.connected_at.clone(),
        last_validated_at: connection.last_validated_at.clone(),
        last_synced_at: connection.last_synced_at.clone(),
        access_expires_at: connection.access_expires_at.clone(),
        otp_expires_at: connection.otp_expires_at.clone(),
        has_access_token,
        has_refresh_token,
        imported_cases: counts.cases,
        imported_projects: counts.projects,
        imported_tasks: counts.tasks,
        last_error: connection.last_error.clone(),
    })
}

fn normalize_base_url(value: &str) -> Result<String, SparcForceError> {
    let trimmed = value.trim().trim_end_matches('/').to_string();
    if trimmed.is_empty() {
        return Err(SparcForceError::Validation(
            "Sparc Force URL is required".to_string(),
        ));
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err(SparcForceError::Validation(
            "Sparc Force URL must start with http:// or https://".to_string(),
        ));
    }
    Ok(trimmed)
}

fn should_refresh(expires_at: Option<&str>) -> bool {
    let Some(expires_at) = expires_at else {
        return true;
    };
    DateTime::parse_from_rfc3339(expires_at)
        .map(|date| date.with_timezone(&Utc) <= Utc::now() + Duration::minutes(2))
        .unwrap_or(true)
}

fn ensure_token_refs(connection: &mut SparcForceConnection) {
    if connection.access_token_ref.is_none() {
        connection.access_token_ref = Some(format!("sparc_force:{}:access_token", connection.id));
    }
    if connection.refresh_token_ref.is_none() {
        connection.refresh_token_ref = Some(format!("sparc_force:{}:refresh_token", connection.id));
    }
}

fn client() -> Client {
    Client::builder()
        .user_agent("WorkTrace")
        .build()
        .expect("Sparc Force client")
}

fn key_entry(reference: &str) -> Result<Entry, SparcForceError> {
    Entry::new(KEYRING_SERVICE, reference)
        .map_err(|error| SparcForceError::Keyring(error.to_string()))
}

fn get_secret(reference: &str) -> Result<String, SparcForceError> {
    key_entry(reference)?.get_password().map_err(|_| {
        SparcForceError::Validation(
            "Sparc Force credentials are missing. Reconnect the integration.".to_string(),
        )
    })
}

fn set_secret(reference: &str, value: &str) -> Result<(), SparcForceError> {
    key_entry(reference)?
        .set_password(value)
        .map_err(|error| SparcForceError::Keyring(error.to_string()))
}

fn delete_secret(reference: &str) -> Result<(), SparcForceError> {
    key_entry(reference)?
        .delete_credential()
        .map_err(|error| SparcForceError::Keyring(error.to_string()))
}

async fn provider_status_error(prefix: &str, response: reqwest::Response) -> SparcForceError {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    SparcForceError::Provider(format!("{prefix} with {status}: {body}"))
}

fn reqwest_error(error: reqwest::Error) -> SparcForceError {
    let mut message = error.to_string();
    let mut source = error.source();

    while let Some(error_source) = source {
        message.push_str(": ");
        message.push_str(&error_source.to_string());
        source = error_source.source();
    }

    SparcForceError::Provider(message)
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339()
}

#[derive(Debug)]
pub enum SparcForceError {
    Validation(String),
    Database(sqlx::Error),
    Keyring(String),
    Provider(String),
    AddonLocked,
    StandaloneTasksDisabled,
}

impl std::fmt::Display for SparcForceError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(message) => write!(formatter, "{message}"),
            Self::Database(error) => write!(formatter, "{error}"),
            Self::Keyring(message) => write!(formatter, "Secret storage failed: {message}"),
            Self::Provider(message) => write!(formatter, "{message}"),
            Self::AddonLocked => write!(formatter, "Sparc Force add-on is not enabled."),
            Self::StandaloneTasksDisabled => write!(formatter, "Standalone tasks are disabled."),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_at: Option<String>,
    user: Option<LoginUser>,
    login_session_token: Option<String>,
    message: Option<String>,
    otp_expires_at: Option<String>,
    masked_email: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginUser {
    #[serde(rename = "user_ID", alias = "userId")]
    user_id: Option<i64>,
    username: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Paginated<T> {
    data: Vec<T>,
    pagination: Pagination,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pagination {
    has_next: bool,
}
