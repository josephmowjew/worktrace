use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::str::FromStr;

use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use keyring::Entry;
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use tokio::time::{timeout, Duration};

use crate::domain::activity::ListActivityInput;
use crate::domain::embedding::{
    BackgroundJobStatus, BackgroundJobStatusInput, ConnectEmbeddingProviderInput,
    EmbeddingProvider, EmbeddingStatus, QueueActivityEmbeddingRefreshInput,
    QueueBackgroundJobResult, RefreshActivityEmbeddingsInput, RefreshActivityEmbeddingsResult,
    RunBackgroundJobsResult, SemanticActivitySearchInput, SemanticActivitySearchResult,
    UpsertActivityEmbeddingInput,
};
use crate::domain::settings::Settings;
use crate::infrastructure::database::repositories::{
    ActivityEmbeddingRepository, ActivityRepository, BackgroundJobRepository, SettingsRepository,
};

const KEYRING_SERVICE: &str = "WorkTrace";
const EMBEDDING_KEY_USER: &str = "embedding_openai_compatible";
const EVIDENCE_KIND: &str = "activity_text_v1";
const REQUEST_TIMEOUT_SECONDS: u64 = 60;
const SEMANTIC_THRESHOLD: f32 = 0.68;

pub struct EmbeddingService;

impl EmbeddingService {
    pub async fn status(
        settings_repository: &SettingsRepository<'_>,
    ) -> Result<EmbeddingStatus, EmbeddingError> {
        let settings = settings_repository
            .get()
            .await
            .map_err(EmbeddingError::Database)?;
        Ok(status_from_settings(&settings))
    }

    pub async fn connect_provider(
        input: ConnectEmbeddingProviderInput,
    ) -> Result<(), EmbeddingError> {
        let api_key = input.api_key.trim();
        if api_key.is_empty() {
            return Err(EmbeddingError::Validation(
                "API key is required".to_string(),
            ));
        }
        key_entry()?
            .set_password(api_key)
            .map_err(|error| EmbeddingError::Keyring(error.to_string()))
    }

    pub fn disconnect_provider() -> Result<(), EmbeddingError> {
        key_entry()?
            .delete_credential()
            .map_err(|error| EmbeddingError::Keyring(error.to_string()))
    }

    pub async fn test_provider(
        settings_repository: &SettingsRepository<'_>,
    ) -> Result<String, EmbeddingError> {
        let settings = settings_repository
            .get()
            .await
            .map_err(EmbeddingError::Database)?;
        let provider = effective_provider(&settings)?;
        let embeddings = embed_texts(
            &settings,
            &provider,
            vec!["WorkTrace embedding test".to_string()],
        )
        .await?;
        let dimensions = embeddings
            .first()
            .map(|vector| vector.len())
            .unwrap_or_default();
        Ok(format!(
            "{} embeddings are ready using {} ({dimensions} dimensions).",
            provider_label(&provider),
            settings.embedding_model
        ))
    }
}

pub struct EmbeddingIndexService;

impl EmbeddingIndexService {
    pub async fn queue_refresh(
        job_repository: &BackgroundJobRepository<'_>,
        input: QueueActivityEmbeddingRefreshInput,
    ) -> Result<QueueBackgroundJobResult, EmbeddingError> {
        let payload = serde_json::to_string(&RefreshActivityEmbeddingsInput {
            from: input.from,
            to: input.to,
            project_ids: input.project_ids,
            classification: input.classification,
        })
        .map_err(|error| EmbeddingError::Provider(error.to_string()))?;
        let job = job_repository
            .enqueue_unique("embedding_refresh", &payload)
            .await
            .map_err(EmbeddingError::Database)?;

        Ok(QueueBackgroundJobResult {
            queued: job.is_some(),
            job_id: job.map(|job| job.id),
        })
    }

    pub async fn job_status(
        job_repository: &BackgroundJobRepository<'_>,
        input: BackgroundJobStatusInput,
    ) -> Result<BackgroundJobStatus, EmbeddingError> {
        job_repository
            .status(input.kind.as_deref())
            .await
            .map_err(EmbeddingError::Database)
    }

    pub async fn run_background_jobs_once(
        settings_repository: &SettingsRepository<'_>,
        activity_repository: &ActivityRepository<'_>,
        embedding_repository: &ActivityEmbeddingRepository<'_>,
        job_repository: &BackgroundJobRepository<'_>,
        app_data_dir: &Path,
    ) -> Result<RunBackgroundJobsResult, EmbeddingError> {
        let Some(job) = job_repository
            .next_queued(Some("embedding_refresh"))
            .await
            .map_err(EmbeddingError::Database)?
        else {
            return Ok(RunBackgroundJobsResult {
                processed: 0,
                succeeded: 0,
                failed: 0,
            });
        };

        job_repository
            .mark_running(&job.id)
            .await
            .map_err(EmbeddingError::Database)?;
        let input = match serde_json::from_str::<RefreshActivityEmbeddingsInput>(&job.payload_json)
        {
            Ok(input) => input,
            Err(error) => {
                job_repository
                    .mark_failed(&job.id, &error.to_string())
                    .await
                    .map_err(EmbeddingError::Database)?;
                return Ok(RunBackgroundJobsResult {
                    processed: 1,
                    succeeded: 0,
                    failed: 1,
                });
            }
        };

        match Self::refresh_for_range(
            settings_repository,
            activity_repository,
            embedding_repository,
            app_data_dir,
            input,
        )
        .await
        {
            Ok(_) => {
                job_repository
                    .mark_completed(&job.id)
                    .await
                    .map_err(EmbeddingError::Database)?;
                Ok(RunBackgroundJobsResult {
                    processed: 1,
                    succeeded: 1,
                    failed: 0,
                })
            }
            Err(error) => {
                let message = error.to_string();
                job_repository
                    .mark_failed(&job.id, &message)
                    .await
                    .map_err(EmbeddingError::Database)?;
                Ok(RunBackgroundJobsResult {
                    processed: 1,
                    succeeded: 0,
                    failed: 1,
                })
            }
        }
    }

    pub async fn refresh_for_range(
        settings_repository: &SettingsRepository<'_>,
        activity_repository: &ActivityRepository<'_>,
        embedding_repository: &ActivityEmbeddingRepository<'_>,
        app_data_dir: &Path,
        input: RefreshActivityEmbeddingsInput,
    ) -> Result<RefreshActivityEmbeddingsResult, EmbeddingError> {
        let settings = settings_repository
            .get()
            .await
            .map_err(EmbeddingError::Database)?;
        let provider = effective_provider(&settings)?;
        let evidence = activity_evidence(activity_repository, input).await?;
        let mut to_embed = Vec::new();
        let mut skipped = 0;

        for item in evidence {
            let text_hash = stable_hash(&item.text);
            if let Some(existing) = embedding_repository
                .find(
                    &item.source_type,
                    &item.source_id,
                    EVIDENCE_KIND,
                    &settings.embedding_model,
                    provider.as_storage_value(),
                )
                .await
                .map_err(EmbeddingError::Database)?
            {
                if existing.text_hash == text_hash && Path::new(&existing.vector_path).exists() {
                    skipped += 1;
                    continue;
                }
            }
            to_embed.push((item, text_hash));
        }

        let texts = to_embed
            .iter()
            .map(|(item, _)| embedding_payload(&settings, &provider, &item.text))
            .collect::<Vec<_>>();
        let vectors = if texts.is_empty() {
            Vec::new()
        } else {
            embed_texts(&settings, &provider, texts).await?
        };

        let base = app_data_dir.join("embeddings").join(stable_hash(&format!(
            "{}:{}",
            provider.as_storage_value(),
            settings.embedding_model
        )));
        let mut indexed = 0;
        for ((item, text_hash), vector) in to_embed.into_iter().zip(vectors.into_iter()) {
            let vector_path = vector_path(&base, &item.source_type, &item.source_id);
            write_vector(&vector_path, &vector)?;
            embedding_repository
                .upsert(UpsertActivityEmbeddingInput {
                    source_type: item.source_type,
                    source_id: item.source_id,
                    evidence_kind: EVIDENCE_KIND.to_string(),
                    model: settings.embedding_model.clone(),
                    provider: provider.as_storage_value().to_string(),
                    text_hash,
                    vector_path: vector_path.to_string_lossy().to_string(),
                    dimensions: vector.len() as i64,
                })
                .await
                .map_err(EmbeddingError::Database)?;
            indexed += 1;
        }

        Ok(RefreshActivityEmbeddingsResult {
            indexed,
            skipped,
            provider: provider.as_storage_value().to_string(),
            model: settings.embedding_model,
        })
    }

    pub async fn semantic_search(
        settings_repository: &SettingsRepository<'_>,
        activity_repository: &ActivityRepository<'_>,
        embedding_repository: &ActivityEmbeddingRepository<'_>,
        input: SemanticActivitySearchInput,
    ) -> Result<Vec<SemanticActivitySearchResult>, EmbeddingError> {
        let settings = settings_repository
            .get()
            .await
            .map_err(EmbeddingError::Database)?;
        let provider = effective_provider(&settings)?;
        let evidence = activity_evidence(
            activity_repository,
            RefreshActivityEmbeddingsInput {
                from: input.from,
                to: input.to,
                project_ids: input.project_ids,
                classification: input.classification,
            },
        )
        .await?;
        let sources = evidence
            .iter()
            .map(|item| (item.source_type.clone(), item.source_id.clone()))
            .collect::<Vec<_>>();
        let records = embedding_repository
            .list_by_sources(
                &sources,
                EVIDENCE_KIND,
                &settings.embedding_model,
                provider.as_storage_value(),
            )
            .await
            .map_err(EmbeddingError::Database)?;
        let records_by_key = records
            .into_iter()
            .map(|record| {
                (
                    format!("{}\u{1f}{}", record.source_type, record.source_id),
                    record,
                )
            })
            .collect::<HashMap<_, _>>();
        let query_vector = embed_texts(&settings, &provider, vec![input.query.clone()])
            .await?
            .into_iter()
            .next()
            .unwrap_or_default();
        let query_lower = input.query.to_lowercase();
        let mut results = Vec::new();
        for item in evidence {
            let exact = item.text.to_lowercase().contains(&query_lower);
            let key = format!("{}\u{1f}{}", item.source_type, item.source_id);
            let semantic_score = records_by_key
                .get(&key)
                .and_then(|record| read_vector(Path::new(&record.vector_path)).ok())
                .map(|vector| cosine_similarity(&query_vector, &vector))
                .unwrap_or(0.0);
            if exact || semantic_score >= SEMANTIC_THRESHOLD {
                results.push(SemanticActivitySearchResult {
                    source_type: item.source_type,
                    source_id: item.source_id,
                    score: if exact {
                        semantic_score.max(1.0)
                    } else {
                        semantic_score
                    },
                    semantic_match: !exact,
                });
            }
        }
        results.sort_by(|left, right| right.score.total_cmp(&left.score));
        results.truncate(input.limit.unwrap_or(50));
        Ok(results)
    }

    pub async fn embeddings_for_activity_items(
        settings_repository: &SettingsRepository<'_>,
        embedding_repository: &ActivityEmbeddingRepository<'_>,
        source_ids: &[String],
    ) -> Result<HashMap<String, Vec<f32>>, EmbeddingError> {
        let settings = settings_repository
            .get()
            .await
            .map_err(EmbeddingError::Database)?;
        let provider = effective_provider(&settings)?;
        let sources = source_ids
            .iter()
            .map(|id| ("commit".to_string(), id.clone()))
            .collect::<Vec<_>>();
        let records = embedding_repository
            .list_by_sources(
                &sources,
                EVIDENCE_KIND,
                &settings.embedding_model,
                provider.as_storage_value(),
            )
            .await
            .map_err(EmbeddingError::Database)?;
        Ok(records
            .into_iter()
            .filter_map(|record| {
                read_vector(Path::new(&record.vector_path))
                    .ok()
                    .map(|vector| (record.source_id, vector))
            })
            .collect())
    }
}

#[derive(Debug)]
pub enum EmbeddingError {
    Validation(String),
    Database(sqlx::Error),
    Keyring(String),
    Provider(String),
    Io(std::io::Error),
}

impl std::fmt::Display for EmbeddingError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(message) | Self::Keyring(message) | Self::Provider(message) => {
                formatter.write_str(message)
            }
            Self::Database(error) => write!(formatter, "{error}"),
            Self::Io(error) => write!(formatter, "{error}"),
        }
    }
}

struct EvidenceText {
    source_type: String,
    source_id: String,
    text: String,
}

async fn activity_evidence(
    activity_repository: &ActivityRepository<'_>,
    input: RefreshActivityEmbeddingsInput,
) -> Result<Vec<EvidenceText>, EmbeddingError> {
    let days = activity_repository
        .list(ListActivityInput {
            from: input.from,
            to: input.to,
            activity_type: None,
            project_ids: input.project_ids,
            workspace_ids: None,
            classification: input.classification,
            git_refs: None,
            worktree_paths: None,
        })
        .await
        .map_err(EmbeddingError::Database)?;
    Ok(days
        .into_iter()
        .flat_map(|day| day.items)
        .map(|item| EvidenceText {
            source_type: item.activity_type.clone(),
            source_id: item.id,
            text: format!(
                "{} {} {} {}",
                item.summary,
                item.project_name.unwrap_or_default(),
                item.branch.unwrap_or_default(),
                item.commit_hash.unwrap_or_default()
            ),
        })
        .collect())
}

fn status_from_settings(settings: &Settings) -> EmbeddingStatus {
    let provider = selected_provider(settings).unwrap_or(EmbeddingProvider::NativeLocal);
    let configured = match provider {
        EmbeddingProvider::NativeLocal => !settings.embedding_model.trim().is_empty(),
        EmbeddingProvider::LocalEndpoint => !settings.embedding_local_endpoint.trim().is_empty(),
        EmbeddingProvider::OpenAiCompatible => {
            !settings.embedding_online_endpoint.trim().is_empty()
                && has_key()
                && settings.embedding_online_allowed
                && settings.embedding_privacy_acknowledged
        }
    };
    EmbeddingStatus {
        enabled: settings.embeddings_enabled,
        provider: provider.as_storage_value().to_string(),
        configured,
        available: settings.embeddings_enabled && configured,
        online: provider == EmbeddingProvider::OpenAiCompatible,
        model: settings.embedding_model.clone(),
        message: status_message(settings, &provider, configured),
    }
}

fn effective_provider(settings: &Settings) -> Result<EmbeddingProvider, EmbeddingError> {
    if !settings.embeddings_enabled {
        return Err(EmbeddingError::Validation(
            "Embeddings are disabled.".to_string(),
        ));
    }
    match selected_provider(settings)? {
        EmbeddingProvider::NativeLocal => {
            if settings.embedding_model.trim().is_empty() {
                return Err(EmbeddingError::Validation(
                    "Native embeddings require a model name.".to_string(),
                ));
            }
            Ok(EmbeddingProvider::NativeLocal)
        }
        EmbeddingProvider::LocalEndpoint => {
            if settings.embedding_local_endpoint.trim().is_empty() {
                return Err(EmbeddingError::Validation(
                    "Configure a local embedding endpoint before using endpoint embeddings."
                        .to_string(),
                ));
            }
            Ok(EmbeddingProvider::LocalEndpoint)
        }
        EmbeddingProvider::OpenAiCompatible => {
            if !settings.embedding_online_allowed || !settings.embedding_privacy_acknowledged {
                return Err(EmbeddingError::Validation(
                    "Online embeddings require privacy acknowledgement.".to_string(),
                ));
            }
            if !has_key() {
                return Err(EmbeddingError::Validation(
                    "Online embedding provider has no stored API key.".to_string(),
                ));
            }
            Ok(EmbeddingProvider::OpenAiCompatible)
        }
    }
}

async fn embed_texts(
    settings: &Settings,
    provider: &EmbeddingProvider,
    texts: Vec<String>,
) -> Result<Vec<Vec<f32>>, EmbeddingError> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }
    if provider == &EmbeddingProvider::NativeLocal {
        return embed_texts_native(settings.embedding_model.clone(), texts).await;
    }
    let endpoint = match provider {
        EmbeddingProvider::NativeLocal => unreachable!("native provider is handled above"),
        EmbeddingProvider::LocalEndpoint => settings.embedding_local_endpoint.trim(),
        EmbeddingProvider::OpenAiCompatible => settings.embedding_online_endpoint.trim(),
    };
    if endpoint.is_empty() {
        return Err(EmbeddingError::Validation(
            "Embedding endpoint is required.".to_string(),
        ));
    }
    let mut request = Client::new()
        .post(endpoint)
        .json(&json!({ "model": settings.embedding_model, "input": texts }));
    if provider == &EmbeddingProvider::OpenAiCompatible {
        request = request.bearer_auth(get_key()?);
    }
    let response = timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS), request.send())
        .await
        .map_err(|_| EmbeddingError::Provider("Embedding request timed out.".to_string()))?
        .map_err(|error| EmbeddingError::Provider(error.to_string()))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(EmbeddingError::Provider(format!(
            "Embedding request failed with {status}: {body}"
        )));
    }
    let body: EmbeddingResponse = response
        .json()
        .await
        .map_err(|error| EmbeddingError::Provider(error.to_string()))?;
    let mut data = body.data;
    data.sort_by_key(|item| item.index.unwrap_or(0));
    let vectors = data
        .into_iter()
        .map(|item| item.embedding)
        .collect::<Vec<_>>();
    if vectors.is_empty() {
        return Err(EmbeddingError::Provider(
            "Embedding provider returned no vectors.".to_string(),
        ));
    }
    Ok(vectors)
}

async fn embed_texts_native(
    model_name: String,
    texts: Vec<String>,
) -> Result<Vec<Vec<f32>>, EmbeddingError> {
    tokio::task::spawn_blocking(move || {
        let model_code = parse_fastembed_model(&model_name)?;
        let mut model =
            TextEmbedding::try_new(InitOptions::new(model_code).with_show_download_progress(false))
                .map_err(|error| EmbeddingError::Provider(error.to_string()))?;
        model
            .embed(texts, None)
            .map_err(|error| EmbeddingError::Provider(error.to_string()))
    })
    .await
    .map_err(|error| EmbeddingError::Provider(error.to_string()))?
}

fn parse_fastembed_model(value: &str) -> Result<EmbeddingModel, EmbeddingError> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Ok(EmbeddingModel::BGESmallENV15);
    }
    let model = match normalized.to_ascii_lowercase().as_str() {
        "bge-small-en-v1.5" | "baai/bge-small-en-v1.5" => EmbeddingModel::BGESmallENV15,
        "bge-small-en-v1.5-q" | "bgesmallenv15q" => EmbeddingModel::BGESmallENV15Q,
        "all-minilm-l6-v2" | "sentence-transformers/all-minilm-l6-v2" => {
            EmbeddingModel::AllMiniLML6V2
        }
        "nomic-embed-text-v1.5" | "nomic-ai/nomic-embed-text-v1.5" => {
            EmbeddingModel::NomicEmbedTextV15
        }
        _ => EmbeddingModel::from_str(normalized).map_err(|error| {
            EmbeddingError::Validation(format!("Unsupported native embedding model: {error}"))
        })?,
    };
    Ok(model)
}

fn embedding_payload(_settings: &Settings, provider: &EmbeddingProvider, text: &str) -> String {
    let bounded = if provider == &EmbeddingProvider::OpenAiCompatible {
        text.lines()
            .filter(|line| {
                !line.trim_start().starts_with('+') && !line.trim_start().starts_with('-')
            })
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        text.to_string()
    };
    bounded.chars().take(2_000).collect::<String>()
}

fn selected_provider(settings: &Settings) -> Result<EmbeddingProvider, EmbeddingError> {
    EmbeddingProvider::try_from(settings.embedding_provider.clone()).map_err(|_| {
        EmbeddingError::Validation(format!(
            "Unsupported embedding provider: {}",
            settings.embedding_provider
        ))
    })
}

fn status_message(settings: &Settings, provider: &EmbeddingProvider, configured: bool) -> String {
    if !settings.embeddings_enabled {
        return "Embeddings are disabled.".to_string();
    }
    match provider {
        EmbeddingProvider::NativeLocal if configured => {
            "Native local embeddings are enabled. The model may download once, then run locally."
                .to_string()
        }
        EmbeddingProvider::NativeLocal => "Choose a native embedding model.".to_string(),
        EmbeddingProvider::LocalEndpoint if configured => {
            "Local embedding endpoint is configured.".to_string()
        }
        EmbeddingProvider::LocalEndpoint => {
            "Configure a local embedding endpoint or switch to native local.".to_string()
        }
        EmbeddingProvider::OpenAiCompatible if configured => {
            "Online embedding fallback is configured.".to_string()
        }
        EmbeddingProvider::OpenAiCompatible => {
            "Online embeddings require an endpoint, stored key, and privacy acknowledgement."
                .to_string()
        }
    }
}

fn provider_label(provider: &EmbeddingProvider) -> &'static str {
    match provider {
        EmbeddingProvider::NativeLocal => "native local",
        EmbeddingProvider::LocalEndpoint => "local endpoint",
        EmbeddingProvider::OpenAiCompatible => "OpenAI-compatible",
    }
}

fn vector_path(base: &Path, source_type: &str, source_id: &str) -> PathBuf {
    base.join(source_type)
        .join(format!("{}.bin", stable_hash(source_id)))
}

fn write_vector(path: &Path, vector: &[f32]) -> Result<(), EmbeddingError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(EmbeddingError::Io)?;
    }
    let mut bytes = Vec::with_capacity(vector.len() * 4);
    for value in vector {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    fs::write(path, bytes).map_err(EmbeddingError::Io)
}

fn read_vector(path: &Path) -> Result<Vec<f32>, EmbeddingError> {
    let bytes = fs::read(path).map_err(EmbeddingError::Io)?;
    Ok(bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

fn cosine_similarity(left: &[f32], right: &[f32]) -> f32 {
    if left.is_empty() || right.is_empty() || left.len() != right.len() {
        return 0.0;
    }
    let mut dot = 0.0;
    let mut left_norm = 0.0;
    let mut right_norm = 0.0;
    for (left, right) in left.iter().zip(right.iter()) {
        dot += left * right;
        left_norm += left * left;
        right_norm += right * right;
    }
    if left_norm == 0.0 || right_norm == 0.0 {
        0.0
    } else {
        dot / (left_norm.sqrt() * right_norm.sqrt())
    }
}

fn stable_hash(value: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn key_entry() -> Result<Entry, EmbeddingError> {
    Entry::new(KEYRING_SERVICE, EMBEDDING_KEY_USER)
        .map_err(|error| EmbeddingError::Keyring(error.to_string()))
}

fn has_key() -> bool {
    get_key().is_ok()
}

fn get_key() -> Result<String, EmbeddingError> {
    key_entry()?
        .get_password()
        .map_err(|error| EmbeddingError::Keyring(error.to_string()))
}

#[derive(Debug, Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingDatum>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingDatum {
    index: Option<usize>,
    embedding: Vec<f32>,
}
