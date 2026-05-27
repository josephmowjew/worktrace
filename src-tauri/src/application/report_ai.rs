use std::path::Path;

use futures_util::StreamExt;
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{timeout, Duration};

use crate::domain::activity::ListActivityInput;
use crate::domain::report::{
    ConnectReportAiProviderInput, ReportAiModel, ReportAiModelList, ReportAiProvider,
    ReportAiProviderStatus, ReportAiStatus, ReportPolishInput, ReportPolishResult,
    ReportReadinessAnalysis, ReportReadinessFinding, ReportReadinessInput,
    TestReportAiProviderInput,
};
use crate::domain::settings::Settings;
use crate::domain::weekly_task::ListWeeklyTasksInput;
use crate::infrastructure::database::repositories::{
    ActivityRepository, GitMetadataRepository, ProjectRepository, ReportNoteRepository,
    SettingsRepository, WeeklyTaskRepository,
};
use crate::AppState;

const KEYRING_SERVICE: &str = "WorkTrace";
const OPENROUTER_KEY_USER: &str = "report_ai_openrouter";
const GROQ_KEY_USER: &str = "report_ai_groq";
const NVIDIA_BUILD_KEY_USER: &str = "report_ai_nvidia_build";
const OPENROUTER_MODEL: &str = "openrouter/free";
const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL: &str = "https://openrouter.ai/api/v1/models";
const GROQ_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL: &str = "https://api.groq.com/openai/v1/models";
const NVIDIA_BUILD_URL: &str = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_BUILD_MODELS_URL: &str = "https://integrate.api.nvidia.com/v1/models";
const PROVIDER_REQUEST_TIMEOUT_SECONDS: u64 = 120;
const STREAM_CHUNK_POLL_TIMEOUT_SECONDS: u64 = 2;

pub struct ReportAiService;

impl ReportAiService {
    pub async fn status(
        settings_repository: &SettingsRepository<'_>,
    ) -> Result<ReportAiStatus, ReportAiError> {
        let settings = settings_repository
            .get()
            .await
            .map_err(ReportAiError::Database)?;

        Ok(ReportAiStatus {
            enabled: settings.report_ai_enabled,
            preferred_provider: settings.report_ai_provider.clone(),
            providers: vec![
                local_status(&settings),
                online_status(
                    ReportAiProvider::OpenrouterFree,
                    has_key(OPENROUTER_KEY_USER),
                    settings.report_ai_online_allowed && settings.report_ai_privacy_acknowledged,
                    OPENROUTER_MODEL,
                ),
                online_status(
                    ReportAiProvider::Groq,
                    has_key(GROQ_KEY_USER),
                    settings.report_ai_online_allowed && settings.report_ai_privacy_acknowledged,
                    &settings.report_ai_groq_model,
                ),
                online_status(
                    ReportAiProvider::NvidiaBuild,
                    has_key(NVIDIA_BUILD_KEY_USER),
                    settings.report_ai_online_allowed && settings.report_ai_privacy_acknowledged,
                    &settings.report_ai_nvidia_model,
                ),
            ],
        })
    }

    pub async fn connect_provider(
        input: ConnectReportAiProviderInput,
    ) -> Result<(), ReportAiError> {
        let api_key = input.api_key.trim();
        if api_key.is_empty() {
            return Err(ReportAiError::Validation("API key is required".to_string()));
        }

        set_key(key_user(&input.provider)?, api_key)
    }

    pub fn disconnect_provider(input: TestReportAiProviderInput) -> Result<(), ReportAiError> {
        delete_key(key_user(&input.provider)?)
    }

    pub async fn test_provider(
        settings_repository: &SettingsRepository<'_>,
        input: TestReportAiProviderInput,
    ) -> Result<String, ReportAiError> {
        let settings = settings_repository
            .get()
            .await
            .map_err(ReportAiError::Database)?;
        let model = model_for_provider(&input.provider, &settings);
        let response = call_provider(
            &input.provider,
            &settings,
            &[
                chat_message("system", "Reply with exactly: ok"),
                chat_message("user", "ok"),
            ],
            16,
            None,
        )
        .await?;

        Ok(format!("{} is ready using {model}.", response.provider))
    }

    pub async fn list_provider_models(
        input: TestReportAiProviderInput,
    ) -> Result<ReportAiModelList, ReportAiError> {
        match input.provider {
            ReportAiProvider::LocalLlamaCpp => Err(ReportAiError::Validation(
                "Local llama.cpp models are selected from disk, not a provider catalog."
                    .to_string(),
            )),
            ReportAiProvider::OpenrouterFree => list_openrouter_models().await,
            ReportAiProvider::Groq => list_groq_models().await,
            ReportAiProvider::NvidiaBuild => list_nvidia_models().await,
        }
    }

    pub async fn polish(
        app: Option<&AppHandle>,
        settings_repository: &SettingsRepository<'_>,
        activity_repository: &ActivityRepository<'_>,
        weekly_task_repository: &WeeklyTaskRepository<'_>,
        report_note_repository: &ReportNoteRepository<'_>,
        project_repository: &ProjectRepository<'_>,
        git_metadata_repository: &GitMetadataRepository<'_>,
        input: ReportPolishInput,
    ) -> Result<ReportPolishResult, ReportAiError> {
        if input.draft.trim().is_empty() {
            return Err(ReportAiError::Validation(
                "Generate a deterministic report before polishing.".to_string(),
            ));
        }

        let settings = settings_repository
            .get()
            .await
            .map_err(ReportAiError::Database)?;
        let provider = effective_provider(input.provider, &settings);
        let context = build_context(
            activity_repository,
            weekly_task_repository,
            report_note_repository,
            project_repository,
            git_metadata_repository,
            &input.start_date,
            &input.end_date,
            input.project_ids.clone(),
            input.git_refs.clone(),
            input.worktree_paths.clone(),
            input.use_project_git_focus.unwrap_or(true),
            input.include_hidden.unwrap_or(false),
        )
        .await?;

        if provider_unavailable(&provider, &settings) {
            return Ok(ReportPolishResult {
                content: input.draft,
                provider: provider.as_str().to_string(),
                model: model_for_provider(&provider, &settings),
                used_fallback: true,
                message: unavailable_message(&provider, &settings),
            });
        }

        let prompt =
            build_polish_prompt(&input.start_date, &input.end_date, &context, &input.draft);
        let stream = app.and_then(|app| {
            input
                .stream_id
                .as_deref()
                .map(|stream_id| ReportAiStream::new(app, stream_id))
        });
        let response = call_provider(
            &provider,
            &settings,
            &[
                chat_message("system", polish_system_message()),
                chat_message("user", &prompt),
            ],
            1600,
            stream.as_ref(),
        )
        .await;

        match response {
            Ok(response) if !response.content.trim().is_empty() => Ok(ReportPolishResult {
                content: response.content,
                provider: response.provider,
                model: response.model,
                used_fallback: false,
                message: "Report polished with AI.".to_string(),
            }),
            Ok(response) => Ok(ReportPolishResult {
                content: input.draft,
                provider: response.provider,
                model: response.model,
                used_fallback: true,
                message: response.diagnostics.unwrap_or_else(|| {
                    "The provider returned an empty response; kept the deterministic draft."
                        .to_string()
                }),
            }),
            Err(error) => Ok(ReportPolishResult {
                content: input.draft,
                provider: provider.as_str().to_string(),
                model: model_for_provider(&provider, &settings),
                used_fallback: true,
                message: error.to_string(),
            }),
        }
    }

    pub async fn analyze_readiness(
        settings_repository: &SettingsRepository<'_>,
        activity_repository: &ActivityRepository<'_>,
        weekly_task_repository: &WeeklyTaskRepository<'_>,
        report_note_repository: &ReportNoteRepository<'_>,
        project_repository: &ProjectRepository<'_>,
        git_metadata_repository: &GitMetadataRepository<'_>,
        input: ReportReadinessInput,
    ) -> Result<ReportReadinessAnalysis, ReportAiError> {
        let settings = settings_repository
            .get()
            .await
            .map_err(ReportAiError::Database)?;
        let provider = effective_provider(input.provider, &settings);
        let context = build_context(
            activity_repository,
            weekly_task_repository,
            report_note_repository,
            project_repository,
            git_metadata_repository,
            &input.start_date,
            &input.end_date,
            input.project_ids,
            input.git_refs,
            input.worktree_paths,
            input.use_project_git_focus.unwrap_or(true),
            input.include_hidden.unwrap_or(false),
        )
        .await?;

        let fallback = deterministic_readiness(&context, &provider, &settings);
        if provider_unavailable(&provider, &settings) {
            return Ok(ReportReadinessAnalysis {
                used_fallback: true,
                ..fallback
            });
        }

        let prompt = format!(
            "Analyze whether this weekly engineering report context is ready for a polished manager report. Return concise Markdown bullets, focusing on missing context, blockers, weak evidence, and project coverage.\n\nContext JSON:\n{context}"
        );
        let response = call_provider(
            &provider,
            &settings,
            &[
                chat_message(
                    "system",
                    "You review weekly engineering report readiness. Be concise and grounded in the provided JSON.",
                ),
                chat_message("user", &prompt),
            ],
            700,
            None,
        )
        .await;

        match response {
            Ok(response) if !response.content.trim().is_empty() => Ok(ReportReadinessAnalysis {
                provider: response.provider,
                model: response.model,
                score: fallback.score,
                summary: response.content,
                findings: fallback.findings,
                used_fallback: false,
            }),
            _ => Ok(ReportReadinessAnalysis {
                used_fallback: true,
                ..fallback
            }),
        }
    }
}

#[derive(Debug)]
pub enum ReportAiError {
    Validation(String),
    Database(sqlx::Error),
    Keyring(String),
    Provider(String),
}

impl std::fmt::Display for ReportAiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(message) | Self::Keyring(message) | Self::Provider(message) => {
                formatter.write_str(message)
            }
            Self::Database(error) => write!(formatter, "{error}"),
        }
    }
}

#[derive(Debug)]
struct AiResponse {
    provider: String,
    model: String,
    content: String,
    diagnostics: Option<String>,
}

struct ReportAiStream<'a> {
    app: &'a AppHandle,
    stream_id: &'a str,
}

impl<'a> ReportAiStream<'a> {
    fn new(app: &'a AppHandle, stream_id: &'a str) -> Self {
        Self { app, stream_id }
    }

    fn emit(&self, event_type: &str, content: &str, message: Option<String>) {
        let _ = self.app.emit(
            "report_ai_stream",
            ReportAiStreamPayload {
                stream_id: self.stream_id.to_string(),
                event_type: event_type.to_string(),
                content: content.to_string(),
                message,
            },
        );
    }

    fn clear_cancelled(&self) {
        let state = self.app.state::<AppState>();
        let lock_result = state.cancelled_report_ai_streams.lock();
        if let Ok(mut streams) = lock_result {
            streams.remove(self.stream_id);
        }
    }

    fn is_cancelled(&self) -> bool {
        let state = self.app.state::<AppState>();
        let lock_result = state.cancelled_report_ai_streams.lock();
        lock_result
            .map(|streams| streams.contains(self.stream_id))
            .unwrap_or(false)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportAiStreamPayload {
    stream_id: String,
    event_type: String,
    content: String,
    message: Option<String>,
}

fn effective_provider(provider: Option<ReportAiProvider>, settings: &Settings) -> ReportAiProvider {
    provider.unwrap_or_else(|| match settings.report_ai_provider.as_str() {
        "openrouter_free" => ReportAiProvider::OpenrouterFree,
        "groq" => ReportAiProvider::Groq,
        "nvidia_build" => ReportAiProvider::NvidiaBuild,
        _ => ReportAiProvider::LocalLlamaCpp,
    })
}

fn local_status(settings: &Settings) -> ReportAiProviderStatus {
    let configured = !settings.report_ai_local_model_path.trim().is_empty()
        && Path::new(&settings.report_ai_local_model_path).exists();

    ReportAiProviderStatus {
        provider: ReportAiProvider::LocalLlamaCpp.as_str().to_string(),
        available: configured,
        configured,
        online: false,
        model: if settings.report_ai_local_model_path.trim().is_empty() {
            "Qwen GGUF model not selected".to_string()
        } else {
            settings.report_ai_local_model_path.clone()
        },
        message: if configured {
            "Local model path is configured. llama.cpp sidecar setup can use this model."
                .to_string()
        } else {
            "Choose a local GGUF model path before using offline AI polish.".to_string()
        },
    }
}

fn online_status(
    provider: ReportAiProvider,
    has_key: bool,
    online_allowed: bool,
    model: &str,
) -> ReportAiProviderStatus {
    ReportAiProviderStatus {
        provider: provider.as_str().to_string(),
        available: has_key && online_allowed,
        configured: has_key,
        online: true,
        model: model.to_string(),
        message: if !online_allowed {
            "Online AI is disabled or privacy acknowledgement is missing.".to_string()
        } else if has_key {
            "API key is stored in OS credential storage.".to_string()
        } else {
            "Connect an API key to use this provider.".to_string()
        },
    }
}

fn provider_unavailable(provider: &ReportAiProvider, settings: &Settings) -> bool {
    match provider {
        ReportAiProvider::LocalLlamaCpp => {
            settings.report_ai_local_model_path.trim().is_empty()
                || !Path::new(&settings.report_ai_local_model_path).exists()
        }
        ReportAiProvider::OpenrouterFree => {
            !settings.report_ai_online_allowed
                || !settings.report_ai_privacy_acknowledged
                || !has_key(OPENROUTER_KEY_USER)
        }
        ReportAiProvider::Groq => {
            !settings.report_ai_online_allowed
                || !settings.report_ai_privacy_acknowledged
                || !has_key(GROQ_KEY_USER)
        }
        ReportAiProvider::NvidiaBuild => {
            !settings.report_ai_online_allowed
                || !settings.report_ai_privacy_acknowledged
                || !has_key(NVIDIA_BUILD_KEY_USER)
        }
    }
}

fn unavailable_message(provider: &ReportAiProvider, settings: &Settings) -> String {
    match provider {
        ReportAiProvider::LocalLlamaCpp => {
            "Local report AI is not configured yet. Choose a GGUF model path; the deterministic draft was kept.".to_string()
        }
        ReportAiProvider::OpenrouterFree
        | ReportAiProvider::Groq
        | ReportAiProvider::NvidiaBuild => {
            if !settings.report_ai_online_allowed || !settings.report_ai_privacy_acknowledged {
                "Online AI is disabled until privacy acknowledgement is enabled; the deterministic draft was kept.".to_string()
            } else {
                "The selected online provider has no stored API key; the deterministic draft was kept.".to_string()
            }
        }
    }
}

fn model_for_provider(provider: &ReportAiProvider, settings: &Settings) -> String {
    match provider {
        ReportAiProvider::LocalLlamaCpp => settings.report_ai_local_model_path.clone(),
        ReportAiProvider::OpenrouterFree => OPENROUTER_MODEL.to_string(),
        ReportAiProvider::Groq => settings.report_ai_groq_model.clone(),
        ReportAiProvider::NvidiaBuild => settings.report_ai_nvidia_model.clone(),
    }
}

async fn call_provider(
    provider: &ReportAiProvider,
    settings: &Settings,
    messages: &[serde_json::Value],
    max_tokens: i32,
    stream: Option<&ReportAiStream<'_>>,
) -> Result<AiResponse, ReportAiError> {
    match provider {
        ReportAiProvider::LocalLlamaCpp => Err(ReportAiError::Provider(
            "Local llama.cpp server supervision is not configured yet.".to_string(),
        )),
        ReportAiProvider::OpenrouterFree => {
            call_openai_compatible(
                OPENROUTER_URL,
                &get_key(OPENROUTER_KEY_USER)?,
                OPENROUTER_MODEL,
                provider.as_str(),
                messages,
                max_tokens,
                stream,
            )
            .await
        }
        ReportAiProvider::Groq => {
            call_openai_compatible(
                GROQ_URL,
                &get_key(GROQ_KEY_USER)?,
                &settings.report_ai_groq_model,
                provider.as_str(),
                messages,
                max_tokens,
                stream,
            )
            .await
        }
        ReportAiProvider::NvidiaBuild => {
            call_openai_compatible(
                NVIDIA_BUILD_URL,
                &get_key(NVIDIA_BUILD_KEY_USER)?,
                &settings.report_ai_nvidia_model,
                provider.as_str(),
                messages,
                max_tokens,
                stream,
            )
            .await
        }
    }
}

async fn call_openai_compatible(
    url: &str,
    api_key: &str,
    model: &str,
    provider: &str,
    messages: &[serde_json::Value],
    max_tokens: i32,
    stream: Option<&ReportAiStream<'_>>,
) -> Result<AiResponse, ReportAiError> {
    if let Some(stream) = stream {
        let streamed = call_openai_compatible_streaming(
            url, api_key, model, provider, messages, max_tokens, stream,
        )
        .await?;
        if provider == ReportAiProvider::NvidiaBuild.as_str()
            && streamed.content.trim().is_empty()
        {
            // Some NVIDIA routes return stream frames without assistant content.
            // Retry once without streaming before falling back to deterministic draft.
            return call_openai_compatible_non_stream(
                url,
                api_key,
                model,
                provider,
                messages,
                max_tokens,
            )
            .await;
        }
        return Ok(streamed);
    }

    call_openai_compatible_non_stream(url, api_key, model, provider, messages, max_tokens).await
}

async fn call_openai_compatible_non_stream(
    url: &str,
    api_key: &str,
    model: &str,
    provider: &str,
    messages: &[serde_json::Value],
    max_tokens: i32,
) -> Result<AiResponse, ReportAiError> {
    let response = Client::new()
        .post(url)
        .bearer_auth(api_key)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }))
        .timeout(Duration::from_secs(PROVIDER_REQUEST_TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| ReportAiError::Provider(error.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ReportAiError::Provider(format!(
            "{provider} request failed with {status}: {body}"
        )));
    }

    let body: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|error| ReportAiError::Provider(error.to_string()))?;
    let first_choice = body.choices.first();
    let content = first_choice
        .and_then(|choice| choice.message.content.clone())
        .unwrap_or_default();
    let diagnostics = if content.trim().is_empty() {
        Some(format!(
            "{provider} returned empty non-stream output (model={} choices={} finish_reason={}).",
            body.model.clone().unwrap_or_else(|| model.to_string()),
            body.choices.len(),
            first_choice
                .and_then(|choice| choice.finish_reason.clone())
                .unwrap_or_else(|| "missing".to_string())
        ))
    } else {
        None
    };

    Ok(AiResponse {
        provider: provider.to_string(),
        model: body.model.unwrap_or_else(|| model.to_string()),
        content,
        diagnostics,
    })
}

async fn call_openai_compatible_streaming(
    url: &str,
    api_key: &str,
    model: &str,
    provider: &str,
    messages: &[serde_json::Value],
    max_tokens: i32,
    stream: &ReportAiStream<'_>,
) -> Result<AiResponse, ReportAiError> {
    stream.clear_cancelled();
    stream.emit("start", "", None);
    let response = Client::new()
        .post(url)
        .bearer_auth(api_key)
        .header("Accept", "text/event-stream")
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens,
            "stream": true,
        }))
        .timeout(Duration::from_secs(PROVIDER_REQUEST_TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| ReportAiError::Provider(error.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        stream.emit(
            "error",
            "",
            Some(format!("{provider} request failed with {status}")),
        );
        return Err(ReportAiError::Provider(format!(
            "{provider} request failed with {status}: {body}"
        )));
    }

    let mut chunks = response.bytes_stream();
    let mut buffer = String::new();
    let mut content = String::new();
    let mut response_model = model.to_string();
    let mut saw_chunk_event = false;
    let mut content_delta_count = 0usize;
    let mut reasoning_delta_count = 0usize;
    let mut finish_reasons: Vec<String> = Vec::new();

    loop {
        if stream.is_cancelled() {
            stream.emit(
                "cancelled",
                "",
                Some("Report polish was cancelled.".to_string()),
            );
            stream.clear_cancelled();
            return Err(ReportAiError::Provider(
                "Report polish was cancelled.".to_string(),
            ));
        }

        let next_chunk = match timeout(
            Duration::from_secs(STREAM_CHUNK_POLL_TIMEOUT_SECONDS),
            chunks.next(),
        )
        .await
        {
            Ok(value) => value,
            Err(_) => {
                // No chunk yet; continue looping so cancellation can be observed quickly.
                continue;
            }
        };

        let Some(chunk) = next_chunk else {
            break;
        };
        let chunk = chunk.map_err(|error| ReportAiError::Provider(error.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(index) = buffer.find('\n') {
            let line = buffer[..index].trim_end_matches('\r').to_string();
            buffer.drain(..=index);
            append_stream_event(
                &line,
                stream,
                &mut content,
                &mut response_model,
                &mut saw_chunk_event,
                &mut content_delta_count,
                &mut reasoning_delta_count,
                &mut finish_reasons,
            )?;
        }
    }
    append_stream_event(
        &buffer,
        stream,
        &mut content,
        &mut response_model,
        &mut saw_chunk_event,
        &mut content_delta_count,
        &mut reasoning_delta_count,
        &mut finish_reasons,
    )?;

    stream.emit("done", "", None);
    let diagnostics = if content.trim().is_empty() {
        Some(format!(
            "{provider} returned empty streamed output (model={} saw_events={} content_deltas={} reasoning_deltas={} finish_reasons=[{}]).",
            response_model,
            saw_chunk_event,
            content_delta_count,
            reasoning_delta_count,
            finish_reasons.join(",")
        ))
    } else {
        None
    };
    Ok(AiResponse {
        provider: provider.to_string(),
        model: response_model,
        content,
        diagnostics,
    })
}

fn append_stream_event(
    line: &str,
    stream: &ReportAiStream<'_>,
    content: &mut String,
    response_model: &mut String,
    saw_chunk_event: &mut bool,
    content_delta_count: &mut usize,
    reasoning_delta_count: &mut usize,
    finish_reasons: &mut Vec<String>,
) -> Result<(), ReportAiError> {
    if let Some(event) = parse_stream_line(line)? {
        *saw_chunk_event = true;
        if let Some(model) = event.model {
            *response_model = model;
        }

        for choice in event.choices {
            if let Some(reason) = choice.finish_reason.clone().filter(|value| !value.is_empty()) {
                finish_reasons.push(reason);
            }
            if let Some(delta) = choice.delta.content.filter(|value| !value.is_empty()) {
                content.push_str(&delta);
                *content_delta_count += 1;
                stream.emit("delta", &delta, None);
            }

            let reasoning = choice
                .delta
                .reasoning
                .or(choice.delta.reasoning_content)
                .filter(|value| !value.is_empty());
            if let Some(reasoning) = reasoning {
                *reasoning_delta_count += 1;
                stream.emit("reasoning", &reasoning, None);
            }
        }
    }

    Ok(())
}

fn parse_stream_line(line: &str) -> Result<Option<ChatCompletionChunk>, ReportAiError> {
    let Some(data) = line.strip_prefix("data:") else {
        return Ok(None);
    };
    let data = data.trim();
    if data.is_empty() || data == "[DONE]" {
        return Ok(None);
    }

    serde_json::from_str(data)
        .map(Some)
        .map_err(|error| ReportAiError::Provider(error.to_string()))
}

async fn list_openrouter_models() -> Result<ReportAiModelList, ReportAiError> {
    let response = Client::new()
        .get(OPENROUTER_MODELS_URL)
        .bearer_auth(get_key(OPENROUTER_KEY_USER)?)
        .send()
        .await
        .map_err(|error| ReportAiError::Provider(error.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ReportAiError::Provider(format!(
            "openrouter models request failed with {status}: {body}"
        )));
    }

    let body: OpenRouterModelsResponse = response
        .json()
        .await
        .map_err(|error| ReportAiError::Provider(error.to_string()))?;
    let mut models = body
        .data
        .into_iter()
        .map(|model| ReportAiModel {
            id: model.id.clone(),
            name: model.name.unwrap_or_else(|| model.id.clone()),
            provider: ReportAiProvider::OpenrouterFree.as_str().to_string(),
            context_length: model.context_length,
            description: model.description,
            input_price: model
                .pricing
                .as_ref()
                .and_then(|pricing| pricing.prompt.clone()),
            output_price: model
                .pricing
                .as_ref()
                .and_then(|pricing| pricing.completion.clone()),
        })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(ReportAiModelList {
        provider: ReportAiProvider::OpenrouterFree.as_str().to_string(),
        models,
    })
}

async fn list_groq_models() -> Result<ReportAiModelList, ReportAiError> {
    let response = Client::new()
        .get(GROQ_MODELS_URL)
        .bearer_auth(get_key(GROQ_KEY_USER)?)
        .send()
        .await
        .map_err(|error| ReportAiError::Provider(error.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ReportAiError::Provider(format!(
            "groq models request failed with {status}: {body}"
        )));
    }

    let body: GroqModelsResponse = response
        .json()
        .await
        .map_err(|error| ReportAiError::Provider(error.to_string()))?;
    let mut models = body
        .data
        .into_iter()
        .map(|model| ReportAiModel {
            id: model.id.clone(),
            name: model.id,
            provider: ReportAiProvider::Groq.as_str().to_string(),
            context_length: model.context_window,
            description: model.owned_by.map(|owner| format!("Owned by {owner}")),
            input_price: None,
            output_price: None,
        })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(ReportAiModelList {
        provider: ReportAiProvider::Groq.as_str().to_string(),
        models,
    })
}

async fn list_nvidia_models() -> Result<ReportAiModelList, ReportAiError> {
    let response = Client::new()
        .get(NVIDIA_BUILD_MODELS_URL)
        .bearer_auth(get_key(NVIDIA_BUILD_KEY_USER)?)
        .send()
        .await
        .map_err(|error| ReportAiError::Provider(error.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ReportAiError::Provider(format!(
            "nvidia build models request failed with {status}: {body}"
        )));
    }

    let body: GroqModelsResponse = response
        .json()
        .await
        .map_err(|error| ReportAiError::Provider(error.to_string()))?;
    let mut models = body
        .data
        .into_iter()
        .map(|model| ReportAiModel {
            id: model.id.clone(),
            name: model.id,
            provider: ReportAiProvider::NvidiaBuild.as_str().to_string(),
            context_length: model.context_window,
            description: model.owned_by.map(|owner| format!("Owned by {owner}")),
            input_price: None,
            output_price: None,
        })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(ReportAiModelList {
        provider: ReportAiProvider::NvidiaBuild.as_str().to_string(),
        models,
    })
}

async fn build_context(
    activity_repository: &ActivityRepository<'_>,
    weekly_task_repository: &WeeklyTaskRepository<'_>,
    report_note_repository: &ReportNoteRepository<'_>,
    project_repository: &ProjectRepository<'_>,
    git_metadata_repository: &GitMetadataRepository<'_>,
    start_date: &str,
    end_date: &str,
    project_ids: Option<Vec<String>>,
    git_refs: Option<Vec<crate::domain::git_metadata::GitRefFilter>>,
    worktree_paths: Option<Vec<String>>,
    use_project_git_focus: bool,
    include_hidden: bool,
) -> Result<String, ReportAiError> {
    let (git_refs, worktree_paths) = resolve_context_git_focus(
        git_metadata_repository,
        project_ids.as_deref(),
        git_refs,
        worktree_paths,
        use_project_git_focus,
    )
    .await?;
    let activity = activity_repository
        .list(ListActivityInput {
            from: start_date.to_string(),
            to: end_date.to_string(),
            activity_type: None,
            project_ids: project_ids.clone(),
            git_refs,
            worktree_paths,
        })
        .await
        .map_err(ReportAiError::Database)?;
    let tasks = weekly_task_repository
        .list(ListWeeklyTasksInput {
            week_start_date: start_date.to_string(),
            week_end_date: end_date.to_string(),
            project_ids: project_ids.clone(),
            task_type: None,
            status: None,
            included_in_report: None,
        })
        .await
        .map_err(ReportAiError::Database)?;
    let notes = report_note_repository
        .list_by_date_range(start_date, end_date)
        .await
        .map_err(ReportAiError::Database)?;
    let projects = project_repository
        .list()
        .await
        .map_err(ReportAiError::Database)?
        .into_iter()
        .filter(|project| {
            project.status == "active"
                && project_ids
                    .as_ref()
                    .map(|ids| ids.contains(&project.id))
                    .unwrap_or(true)
        })
        .collect::<Vec<_>>();

    let activity_items = activity
        .iter()
        .flat_map(|day| {
            day.items.iter().filter_map(move |item| {
                if !include_hidden && !item.included_in_report {
                    return None;
                }
                Some(json!({
                    "id": item.id,
                    "date": day.date,
                    "project": item.project_name,
                    "type": item.activity_type,
                    "summary": item.summary,
                    "commit_hash": item.commit_hash,
                    "branch": item.branch,
                    "files_changed": item.files_changed,
                    "insertions": item.insertions,
                    "deletions": item.deletions,
                }))
            })
        })
        .collect::<Vec<_>>();

    let task_items = tasks
        .iter()
        .filter(|task| include_hidden || task.included_in_report)
        .map(|task| {
            json!({
                "id": task.id,
                "project": task.project_name,
                "type": task.task_type.as_storage_value(),
                "status": task.status.as_storage_value(),
                "title": task.title,
                "details": task.details,
                "target_date": task.target_date,
                "completed_at": task.completed_at,
                "priority": task.priority.as_storage_value(),
            })
        })
        .collect::<Vec<_>>();

    let note_items = notes
        .iter()
        .filter(|note| include_hidden || note.included_in_report)
        .map(|note| {
            json!({
                "id": note.id,
                "date": note.date,
                "project_id": note.project_id,
                "type": note.note_type,
                "content": note.content,
            })
        })
        .collect::<Vec<_>>();

    let project_items = projects
        .iter()
        .map(|project| {
            json!({
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "type": project.project_type,
                "github_url": project.github_url,
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "range": { "start": start_date, "end": end_date },
        "counts": {
            "activity": activity_items.len(),
            "weekly_tasks": task_items.len(),
            "notes": note_items.len(),
            "projects": project_items.len(),
        },
        "projects": project_items,
        "activity": activity_items,
        "weekly_tasks": task_items,
        "notes": note_items,
    })
    .to_string())
}

async fn resolve_context_git_focus(
    git_metadata_repository: &GitMetadataRepository<'_>,
    project_ids: Option<&[String]>,
    git_refs: Option<Vec<crate::domain::git_metadata::GitRefFilter>>,
    worktree_paths: Option<Vec<String>>,
    use_project_git_focus: bool,
) -> Result<
    (
        Option<Vec<crate::domain::git_metadata::GitRefFilter>>,
        Option<Vec<String>>,
    ),
    ReportAiError,
> {
    if git_refs.is_some() || worktree_paths.is_some() {
        return Ok((git_refs, worktree_paths));
    }

    if use_project_git_focus {
        let (refs, paths) = git_metadata_repository
            .focus_for_projects(project_ids)
            .await
            .map_err(ReportAiError::Database)?;
        return Ok((
            if refs.is_empty() { None } else { Some(refs) },
            if paths.is_empty() { None } else { Some(paths) },
        ));
    }

    Ok((None, None))
}

fn deterministic_readiness(
    context: &str,
    provider: &ReportAiProvider,
    settings: &Settings,
) -> ReportReadinessAnalysis {
    let parsed: serde_json::Value = serde_json::from_str(context).unwrap_or_else(|_| json!({}));
    let counts = &parsed["counts"];
    let activity = counts["activity"].as_u64().unwrap_or(0);
    let tasks = counts["weekly_tasks"].as_u64().unwrap_or(0);
    let notes = counts["notes"].as_u64().unwrap_or(0);
    let projects = counts["projects"].as_u64().unwrap_or(0);

    let mut findings = Vec::new();
    if activity == 0 {
        findings.push(finding(
            "warning",
            "No report-ready activity",
            "Sync repositories or add manual logs before polishing the report.",
        ));
    }
    if tasks == 0 {
        findings.push(finding(
            "info",
            "No weekly plan items",
            "Add completed work, blockers, or planned follow-ups for stronger context.",
        ));
    }
    if notes == 0 {
        findings.push(finding(
            "info",
            "No daily review notes",
            "Daily review notes help the report explain why the work mattered.",
        ));
    }
    if projects == 0 {
        findings.push(finding(
            "warning",
            "No active project context",
            "Project descriptions help AI polish the report without guessing.",
        ));
    }

    let penalty = findings
        .iter()
        .map(|finding| {
            if finding.severity == "warning" {
                20
            } else {
                10
            }
        })
        .sum::<i32>();
    let score = (100 - penalty).clamp(0, 100);

    ReportReadinessAnalysis {
        provider: provider.as_str().to_string(),
        model: model_for_provider(provider, settings),
        score,
        summary: if findings.is_empty() {
            "The report has enough structured evidence for AI polish.".to_string()
        } else {
            "The report can be polished, but the findings below would improve context.".to_string()
        },
        findings,
        used_fallback: true,
    }
}

fn polish_system_message() -> &'static str {
    "You polish weekly work reports into concise, manager-ready Markdown. Preserve source facts, dates, names, statuses, and evidence exactly; do not invent work or unsupported outcomes."
}

fn build_polish_prompt(start_date: &str, end_date: &str, context: &str, draft: &str) -> String {
    format!(
        "Rewrite this weekly report into the exact email-style Markdown format below.\n\n\
Format requirements:\n\
- Start with exactly: Hello,\n\
- After a blank line, write exactly: I hope you're well. Please find below my weekly report for {start_date} to {end_date}, outlining the progress made during the period.\n\
- After another blank line, group the work by project, product area, department, or workstream.\n\
- Use bold Markdown section headings only, for example: **Sparc Force Updates - Marketing Department**\n\
- After each bold heading, write one concise first-person paragraph describing the work completed or attended.\n\
- Do not use # headings, ## headings, bullet lists, numbered lists, tables, stats summaries, raw commit hashes, or internal JSON details in the final report.\n\
- Keep the final report in Markdown.\n\
- Preserve facts, counts, dates, names, project names, statuses, blockers, decisions, and evidence from the context and draft.\n\
- Do not invent work, outcomes, meetings, people, departments, dates, or status changes.\n\n\
Context JSON:\n{context}\n\n\
Draft Markdown:\n{draft}"
    )
}

fn finding(severity: &str, title: &str, detail: &str) -> ReportReadinessFinding {
    ReportReadinessFinding {
        severity: severity.to_string(),
        title: title.to_string(),
        detail: detail.to_string(),
    }
}

fn chat_message(role: &str, content: &str) -> serde_json::Value {
    json!({ "role": role, "content": content })
}

fn key_user(provider: &ReportAiProvider) -> Result<&'static str, ReportAiError> {
    match provider {
        ReportAiProvider::OpenrouterFree => Ok(OPENROUTER_KEY_USER),
        ReportAiProvider::Groq => Ok(GROQ_KEY_USER),
        ReportAiProvider::NvidiaBuild => Ok(NVIDIA_BUILD_KEY_USER),
        ReportAiProvider::LocalLlamaCpp => Err(ReportAiError::Validation(
            "Local report AI does not use an online API key.".to_string(),
        )),
    }
}

fn key_entry(user: &str) -> Result<Entry, ReportAiError> {
    Entry::new(KEYRING_SERVICE, user).map_err(|error| ReportAiError::Keyring(error.to_string()))
}

fn has_key(user: &str) -> bool {
    get_key(user).is_ok()
}

fn get_key(user: &str) -> Result<String, ReportAiError> {
    key_entry(user)?
        .get_password()
        .map_err(|error| ReportAiError::Keyring(error.to_string()))
}

fn set_key(user: &str, api_key: &str) -> Result<(), ReportAiError> {
    key_entry(user)?
        .set_password(api_key)
        .map_err(|error| ReportAiError::Keyring(error.to_string()))
}

fn delete_key(user: &str) -> Result<(), ReportAiError> {
    key_entry(user)?
        .delete_credential()
        .map_err(|error| ReportAiError::Keyring(error.to_string()))
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    model: Option<String>,
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChunk {
    model: Option<String>,
    choices: Vec<ChatChunkChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChunkChoice {
    delta: ChatChunkDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatChunkDelta {
    content: Option<String>,
    reasoning: Option<String>,
    reasoning_content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModelsResponse {
    data: Vec<OpenRouterModel>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModel {
    id: String,
    name: Option<String>,
    context_length: Option<i64>,
    description: Option<String>,
    pricing: Option<OpenRouterModelPricing>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModelPricing {
    prompt: Option<String>,
    completion: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GroqModelsResponse {
    data: Vec<GroqModel>,
}

#[derive(Debug, Deserialize)]
struct GroqModel {
    id: String,
    owned_by: Option<String>,
    context_window: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::{build_polish_prompt, polish_system_message};

    #[test]
    fn polish_prompt_requires_generic_email_style_report() {
        let prompt = build_polish_prompt(
            "2026-03-23",
            "2026-03-27",
            r#"{"activity":[]}"#,
            "# Weekly Report\n- Shipped work",
        );

        assert!(prompt.contains("Start with exactly: Hello,"));
        assert!(prompt.contains(
            "I hope you're well. Please find below my weekly report for 2026-03-23 to 2026-03-27, outlining the progress made during the period."
        ));
        assert!(
            prompt.contains("group the work by project, product area, department, or workstream")
        );
        assert!(prompt.contains("**Sparc Force Updates - Marketing Department**"));
        assert!(prompt.contains("one concise first-person paragraph"));
    }

    #[test]
    fn polish_prompt_rejects_detailed_markdown_artifacts() {
        let prompt = build_polish_prompt("2026-03-23", "2026-03-27", "{}", "draft");

        assert!(prompt.contains("Do not use # headings"));
        assert!(prompt.contains("## headings"));
        assert!(prompt.contains("bullet lists"));
        assert!(prompt.contains("numbered lists"));
        assert!(prompt.contains("tables"));
        assert!(prompt.contains("stats summaries"));
        assert!(prompt.contains("raw commit hashes"));
        assert!(prompt.contains("internal JSON details"));
    }

    #[test]
    fn polish_prompt_preserves_facts_without_invention() {
        let system = polish_system_message();
        let prompt = build_polish_prompt("2026-03-23", "2026-03-27", "{}", "draft");

        assert!(system.contains("Preserve source facts"));
        assert!(system.contains("do not invent work"));
        assert!(prompt.contains("Preserve facts, counts, dates, names, project names, statuses, blockers, decisions, and evidence"));
        assert!(prompt.contains("Do not invent work, outcomes, meetings, people, departments, dates, or status changes."));
    }
}
