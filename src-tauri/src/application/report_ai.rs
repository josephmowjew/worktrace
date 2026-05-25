use std::path::Path;

use keyring::Entry;
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use crate::domain::activity::ListActivityInput;
use crate::domain::report::{
    ConnectReportAiProviderInput, ReportAiModel, ReportAiModelList, ReportAiProvider,
    ReportAiProviderStatus, ReportAiStatus,
    ReportPolishInput, ReportPolishResult, ReportReadinessAnalysis, ReportReadinessFinding,
    ReportReadinessInput, TestReportAiProviderInput,
};
use crate::domain::settings::Settings;
use crate::domain::weekly_task::ListWeeklyTasksInput;
use crate::infrastructure::database::repositories::{
    ActivityRepository, ProjectRepository, ReportNoteRepository, SettingsRepository,
    WeeklyTaskRepository,
};

const KEYRING_SERVICE: &str = "WorkTrace";
const OPENROUTER_KEY_USER: &str = "report_ai_openrouter";
const GROQ_KEY_USER: &str = "report_ai_groq";
const OPENROUTER_MODEL: &str = "openrouter/free";
const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL: &str = "https://openrouter.ai/api/v1/models";
const GROQ_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL: &str = "https://api.groq.com/openai/v1/models";

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
        )
        .await?;

        Ok(format!("{} is ready using {model}.", response.provider))
    }

    pub async fn list_provider_models(
        input: TestReportAiProviderInput,
    ) -> Result<ReportAiModelList, ReportAiError> {
        match input.provider {
            ReportAiProvider::LocalLlamaCpp => Err(ReportAiError::Validation(
                "Local llama.cpp models are selected from disk, not a provider catalog.".to_string(),
            )),
            ReportAiProvider::OpenrouterFree => list_openrouter_models().await,
            ReportAiProvider::Groq => list_groq_models().await,
        }
    }

    pub async fn polish(
        settings_repository: &SettingsRepository<'_>,
        activity_repository: &ActivityRepository<'_>,
        weekly_task_repository: &WeeklyTaskRepository<'_>,
        report_note_repository: &ReportNoteRepository<'_>,
        project_repository: &ProjectRepository<'_>,
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
            &input.start_date,
            &input.end_date,
            input.project_ids.clone(),
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

        let prompt = format!(
            "Rewrite this weekly report into polished, manager-ready Markdown. Preserve facts, counts, dates, names, and statuses. Do not invent work. Use the context as evidence.\n\nContext JSON:\n{}\n\nDraft Markdown:\n{}",
            context, input.draft
        );
        let response = call_provider(
            &provider,
            &settings,
            &[
                chat_message(
                    "system",
                    "You polish engineering status reports. Keep Markdown, preserve source facts, and avoid unsupported claims.",
                ),
                chat_message("user", &prompt),
            ],
            1600,
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
                message: "The provider returned an empty response; kept the deterministic draft.".to_string(),
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
            &input.start_date,
            &input.end_date,
            input.project_ids,
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
            Self::Validation(message)
            | Self::Keyring(message)
            | Self::Provider(message) => formatter.write_str(message),
            Self::Database(error) => write!(formatter, "{error}"),
        }
    }
}

#[derive(Debug)]
struct AiResponse {
    provider: String,
    model: String,
    content: String,
}

fn effective_provider(provider: Option<ReportAiProvider>, settings: &Settings) -> ReportAiProvider {
    provider.unwrap_or_else(|| match settings.report_ai_provider.as_str() {
        "openrouter_free" => ReportAiProvider::OpenrouterFree,
        "groq" => ReportAiProvider::Groq,
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
            "Local model path is configured. llama.cpp sidecar setup can use this model.".to_string()
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
    }
}

fn unavailable_message(provider: &ReportAiProvider, settings: &Settings) -> String {
    match provider {
        ReportAiProvider::LocalLlamaCpp => {
            "Local report AI is not configured yet. Choose a GGUF model path; the deterministic draft was kept.".to_string()
        }
        ReportAiProvider::OpenrouterFree | ReportAiProvider::Groq => {
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
    }
}

async fn call_provider(
    provider: &ReportAiProvider,
    settings: &Settings,
    messages: &[serde_json::Value],
    max_tokens: i32,
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
) -> Result<AiResponse, ReportAiError> {
    let response = Client::new()
        .post(url)
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }))
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
    let content = body
        .choices
        .first()
        .and_then(|choice| choice.message.content.clone())
        .unwrap_or_default();

    Ok(AiResponse {
        provider: provider.to_string(),
        model: body.model.unwrap_or_else(|| model.to_string()),
        content,
    })
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
            input_price: model.pricing.as_ref().and_then(|pricing| pricing.prompt.clone()),
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

async fn build_context(
    activity_repository: &ActivityRepository<'_>,
    weekly_task_repository: &WeeklyTaskRepository<'_>,
    report_note_repository: &ReportNoteRepository<'_>,
    project_repository: &ProjectRepository<'_>,
    start_date: &str,
    end_date: &str,
    project_ids: Option<Vec<String>>,
    include_hidden: bool,
) -> Result<String, ReportAiError> {
    let activity = activity_repository
        .list(ListActivityInput {
            from: start_date.to_string(),
            to: end_date.to_string(),
            activity_type: None,
            project_ids: project_ids.clone(),
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
        .map(|finding| if finding.severity == "warning" { 20 } else { 10 })
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
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
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
