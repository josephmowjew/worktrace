use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EmbeddingProvider {
    NativeLocal,
    LocalEndpoint,
    OpenAiCompatible,
}

impl EmbeddingProvider {
    pub fn as_storage_value(&self) -> &'static str {
        match self {
            Self::NativeLocal => "native_local",
            Self::LocalEndpoint => "local_endpoint",
            Self::OpenAiCompatible => "openai_compatible",
        }
    }
}

impl TryFrom<String> for EmbeddingProvider {
    type Error = ();

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "native_local" => Ok(Self::NativeLocal),
            "local_endpoint" => Ok(Self::LocalEndpoint),
            "openai_compatible" => Ok(Self::OpenAiCompatible),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingStatus {
    pub enabled: bool,
    pub provider: String,
    pub configured: bool,
    pub available: bool,
    pub online: bool,
    pub model: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectEmbeddingProviderInput {
    pub api_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshActivityEmbeddingsInput {
    pub from: String,
    pub to: String,
    pub project_ids: Option<Vec<String>>,
    pub classification: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshActivityEmbeddingsResult {
    pub indexed: usize,
    pub skipped: usize,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticActivitySearchInput {
    pub query: String,
    pub from: String,
    pub to: String,
    pub project_ids: Option<Vec<String>>,
    pub classification: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticActivitySearchResult {
    pub source_type: String,
    pub source_id: String,
    pub score: f32,
    pub semantic_match: bool,
}

#[derive(Debug, Clone)]
pub struct ActivityEmbeddingRecord {
    pub id: String,
    pub source_type: String,
    pub source_id: String,
    pub evidence_kind: String,
    pub model: String,
    pub provider: String,
    pub text_hash: String,
    pub vector_path: String,
    pub dimensions: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct UpsertActivityEmbeddingInput {
    pub source_type: String,
    pub source_id: String,
    pub evidence_kind: String,
    pub model: String,
    pub provider: String,
    pub text_hash: String,
    pub vector_path: String,
    pub dimensions: i64,
}
