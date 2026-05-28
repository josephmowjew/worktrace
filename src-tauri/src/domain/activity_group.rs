use serde::{Deserialize, Serialize};

use crate::domain::activity::ActivityItem;
use crate::domain::git_metadata::GitRefFilter;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListActivityGroupsInput {
    pub from: String,
    pub to: String,
    pub project_ids: Option<Vec<String>>,
    pub classification: Option<String>,
    pub git_refs: Option<Vec<GitRefFilter>>,
    pub worktree_paths: Option<Vec<String>>,
    pub include_hidden: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestActivityGroupsInput {
    pub from: String,
    pub to: String,
    pub project_ids: Option<Vec<String>>,
    pub classification: Option<String>,
    pub git_refs: Option<Vec<GitRefFilter>>,
    pub worktree_paths: Option<Vec<String>>,
    pub use_ai: Option<bool>,
    pub use_embeddings: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateActivityGroupInput {
    pub project_id: Option<String>,
    pub title: String,
    pub summary: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub source: Option<String>,
    pub confidence: Option<f64>,
    pub included_in_report: Option<bool>,
    pub fingerprint: Option<String>,
    pub algorithm_version: Option<String>,
    pub confidence_label: Option<String>,
    pub rationale_json: Option<String>,
    pub report_summary: Option<String>,
    pub locked: Option<bool>,
    pub review_status: Option<String>,
    pub title_confidence: Option<f64>,
    pub title_confidence_label: Option<String>,
    pub title_quality_label: Option<String>,
    pub title_strategy: Option<String>,
    pub title_classification_json: Option<String>,
    pub title_candidates_json: Option<String>,
    pub title_rationale_json: Option<String>,
    pub title_rejected_terms_json: Option<String>,
    pub items: Vec<ActivityGroupItemInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateActivityGroupInput {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub source: Option<String>,
    pub confidence: Option<f64>,
    pub included_in_report: Option<bool>,
    pub report_summary: Option<String>,
    pub locked: Option<bool>,
    pub review_status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceActivityGroupItemsInput {
    pub items: Vec<ActivityGroupItemInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewActivityGroupSuggestionsInput {
    pub from: String,
    pub to: String,
    pub project_ids: Option<Vec<String>>,
    pub classification: Option<String>,
    pub git_refs: Option<Vec<GitRefFilter>>,
    pub worktree_paths: Option<Vec<String>>,
    pub use_embeddings: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeActivityGroupsInput {
    pub source_group_ids: Vec<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitActivityGroupInput {
    pub item_ids: Vec<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveActivityGroupItemInput {
    pub item_id: String,
    pub target_group_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockActivityGroupInput {
    pub locked: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewActivityGroupTitleInput {
    pub group_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerateActivityGroupTitleInput {
    pub group_id: String,
    pub persist: bool,
    pub respect_user_edited: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectActivityGroupTitleCandidateInput {
    pub group_id: String,
    pub candidate_title: String,
    pub candidate_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordActivityGroupTitleFeedbackInput {
    pub group_id: String,
    pub event_type: String,
    pub previous_title: Option<String>,
    pub new_title: Option<String>,
    pub previous_summary: Option<String>,
    pub new_summary: Option<String>,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityGroupItemInput {
    pub source_type: String,
    pub source_id: String,
    pub occurred_at: String,
    pub summary_snapshot: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityGroup {
    pub id: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub title: String,
    pub summary: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub source: String,
    pub confidence: f64,
    pub included_in_report: bool,
    pub fingerprint: Option<String>,
    pub algorithm_version: Option<String>,
    pub confidence_label: String,
    pub rationale_json: Option<String>,
    pub report_summary: Option<String>,
    pub locked: bool,
    pub user_edited_at: Option<String>,
    pub review_status: String,
    pub title_confidence: Option<f64>,
    pub title_confidence_label: Option<String>,
    pub title_quality_label: Option<String>,
    pub title_strategy: Option<String>,
    pub title_rationale_json: Option<String>,
    pub title_candidates_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub items: Vec<ActivityGroupItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityGroupNarrative {
    pub group_id: String,
    pub title: String,
    pub summary: Option<String>,
    pub report_summary: Option<String>,
    pub title_confidence: f64,
    pub title_confidence_label: String,
    pub title_quality_label: String,
    pub naming_strategy: String,
    pub classification_json: String,
    pub candidates_json: String,
    pub rationale_json: String,
    pub rejected_terms_json: Option<String>,
    pub algorithm_version: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleCandidateDto {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub report_summary: String,
    pub action: String,
    pub domains: Vec<String>,
    pub strategy: String,
    pub score: f64,
    pub quality_label: String,
    pub rationale: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleRationaleDto {
    pub selected_title: String,
    pub selected_action: String,
    pub selected_domains: Vec<String>,
    pub naming_strategy: String,
    pub title_confidence: f64,
    pub title_confidence_label: String,
    pub title_quality_label: String,
    pub positive_evidence: Vec<String>,
    pub rejected_terms: Vec<String>,
    pub rejected_candidates: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewActivityGroupTitleResponse {
    pub selected_title: String,
    pub selected_summary: String,
    pub selected_report_summary: String,
    pub title_confidence: f64,
    pub title_confidence_label: String,
    pub title_quality_label: String,
    pub naming_strategy: String,
    pub candidates: Vec<TitleCandidateDto>,
    pub rationale: TitleRationaleDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityGroupItem {
    pub id: String,
    pub group_id: String,
    pub source_type: String,
    pub source_id: String,
    pub occurred_at: String,
    pub summary_snapshot: String,
    pub activity: Option<ActivityItem>,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct ActivityGroupTitleMemory {
    pub edited_title: String,
    pub edited_summary: Option<String>,
    pub project_id: Option<String>,
    pub evidence_terms: String,
    pub evidence_terms_json: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupingEvidence {
    pub group: ActivityGroup,
    pub reasons: Vec<String>,
    pub changed_paths: Vec<String>,
    pub diff_snippets: Vec<GroupingDiffSnippet>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupingDiffSnippet {
    pub commit_hash: String,
    pub path: String,
    pub snippet: String,
}
