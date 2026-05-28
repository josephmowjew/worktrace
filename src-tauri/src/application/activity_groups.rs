use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::hash::{Hash, Hasher};

use chrono::{DateTime, Utc};

use crate::application::activity_group_narrative::{
    branch_phrases_from_ref, clean_commit_subject, diff_terms_from_text, issue_tokens_from_text,
    path_terms_from_path, preview_response_from_narrative, GroupNarrativeSynthesizer,
    NarrativeEvidence, NarrativeEvidenceTerms,
};
use crate::application::embeddings::EmbeddingIndexService;
use crate::domain::activity::{ActivityItem, ListActivityInput};
use crate::domain::activity_group::{
    ActivityGroup, ActivityGroupItemInput, ActivityGroupTitleMemory, CreateActivityGroupInput,
    ListActivityGroupsInput, LockActivityGroupInput, MergeActivityGroupsInput,
    MoveActivityGroupItemInput, PreviewActivityGroupSuggestionsInput,
    PreviewActivityGroupTitleInput, PreviewActivityGroupTitleResponse,
    RecordActivityGroupTitleFeedbackInput, RegenerateActivityGroupTitleInput,
    ReplaceActivityGroupItemsInput, SelectActivityGroupTitleCandidateInput,
    SplitActivityGroupInput, SuggestActivityGroupsInput, UpdateActivityGroupInput,
};
use crate::domain::git_metadata::{CommitDiffSnippet, CommitFileChange};
use crate::infrastructure::database::repositories::{
    ActivityEmbeddingRepository, ActivityGroupRepository, ActivityRepository,
    GitMetadataRepository, SettingsRepository,
};

const ALGORITHM_VERSION: &str = "graph-v1";
const EDGE_THRESHOLD: f64 = 0.56;
const STRONG_ANCHOR_EDGE_THRESHOLD: f64 = 0.42;
const CONTEXTUAL_EDGE_THRESHOLD: f64 = 0.48;
const SESSION_GAP_MINUTES: i64 = 75;

pub struct ActivityGroupService;

impl ActivityGroupService {
    pub async fn list(
        repository: &ActivityGroupRepository<'_>,
        input: ListActivityGroupsInput,
    ) -> Result<Vec<ActivityGroup>, ActivityGroupServiceError> {
        validate_range(&input.from, &input.to)?;
        repository
            .list(input)
            .await
            .map_err(ActivityGroupServiceError::Database)
    }

    pub async fn preview(
        group_repository: &ActivityGroupRepository<'_>,
        activity_repository: &ActivityRepository<'_>,
        git_repository: &GitMetadataRepository<'_>,
        settings_repository: &SettingsRepository<'_>,
        embedding_repository: &ActivityEmbeddingRepository<'_>,
        input: PreviewActivityGroupSuggestionsInput,
    ) -> Result<Vec<CreateActivityGroupInput>, ActivityGroupServiceError> {
        validate_range(&input.from, &input.to)?;
        build_group_drafts(
            group_repository,
            activity_repository,
            git_repository,
            settings_repository,
            embedding_repository,
            input,
        )
        .await
    }

    pub async fn suggest(
        group_repository: &ActivityGroupRepository<'_>,
        activity_repository: &ActivityRepository<'_>,
        git_repository: &GitMetadataRepository<'_>,
        settings_repository: &SettingsRepository<'_>,
        embedding_repository: &ActivityEmbeddingRepository<'_>,
        input: SuggestActivityGroupsInput,
    ) -> Result<Vec<ActivityGroup>, ActivityGroupServiceError> {
        validate_range(&input.from, &input.to)?;
        let preview_input = PreviewActivityGroupSuggestionsInput {
            from: input.from.clone(),
            to: input.to.clone(),
            project_ids: input.project_ids.clone(),
            workspace_ids: input.workspace_ids.clone(),
            classification: input.classification.clone(),
            git_refs: input.git_refs.clone(),
            worktree_paths: input.worktree_paths.clone(),
            use_embeddings: input.use_embeddings,
        };
        let existing_input = ListActivityGroupsInput {
            from: input.from.clone(),
            to: input.to.clone(),
            project_ids: input.project_ids.clone(),
            workspace_ids: input.workspace_ids.clone(),
            classification: input.classification.clone(),
            git_refs: input.git_refs.clone(),
            worktree_paths: input.worktree_paths.clone(),
            include_hidden: Some(true),
        };
        let drafts = build_group_drafts(
            group_repository,
            activity_repository,
            git_repository,
            settings_repository,
            embedding_repository,
            preview_input,
        )
        .await?;
        let mut groups = Vec::new();
        let draft_fingerprints = drafts
            .iter()
            .filter_map(|draft| draft.fingerprint.clone())
            .collect::<HashSet<_>>();

        for existing in group_repository
            .list(existing_input)
            .await
            .map_err(ActivityGroupServiceError::Database)?
        {
            let is_generated = (existing.source == "local_rule"
                || existing.source == "ai"
                || existing.algorithm_version.is_some()
                || existing.fingerprint.is_some())
                && !existing.locked
                && existing.user_edited_at.is_none();
            let is_stale = existing
                .fingerprint
                .as_ref()
                .is_some_and(|fingerprint| !draft_fingerprints.contains(fingerprint));
            let is_weak_existing_singleton = existing.items.len() == 1
                && (existing.source == "ai" || existing.confidence_label == "needs_review")
                && existing.review_status != "reviewed";
            if is_generated && (is_stale || is_weak_existing_singleton) {
                group_repository
                    .delete(&existing.id)
                    .await
                    .map_err(ActivityGroupServiceError::Database)?;
            }
        }

        for draft in drafts {
            if let Some(fingerprint) = draft.fingerprint.as_deref() {
                if let Some(existing) = group_repository
                    .find_by_fingerprint(fingerprint)
                    .await
                    .map_err(ActivityGroupServiceError::Database)?
                {
                    let updated = group_repository
                        .update_generated_group(&existing.id, draft)
                        .await
                        .map_err(ActivityGroupServiceError::Database)?
                        .unwrap_or(existing);
                    groups.push(updated);
                    continue;
                }
            }
            groups.push(
                group_repository
                    .create(draft)
                    .await
                    .map_err(ActivityGroupServiceError::Database)?,
            );
        }

        Ok(groups)
    }

    pub async fn create(
        repository: &ActivityGroupRepository<'_>,
        input: CreateActivityGroupInput,
    ) -> Result<ActivityGroup, ActivityGroupServiceError> {
        validate_group_title(&input.title)?;
        repository
            .create(input)
            .await
            .map_err(ActivityGroupServiceError::Database)
    }

    pub async fn update(
        repository: &ActivityGroupRepository<'_>,
        id: &str,
        input: UpdateActivityGroupInput,
    ) -> Result<ActivityGroup, ActivityGroupServiceError> {
        if let Some(title) = &input.title {
            validate_group_title(title)?;
        }
        repository
            .update(id, input)
            .await
            .map_err(ActivityGroupServiceError::Database)?
            .ok_or_else(|| {
                ActivityGroupServiceError::Validation("Activity group not found".to_string())
            })
    }

    pub async fn delete(
        repository: &ActivityGroupRepository<'_>,
        id: &str,
    ) -> Result<bool, ActivityGroupServiceError> {
        repository
            .delete(id)
            .await
            .map_err(ActivityGroupServiceError::Database)
    }

    pub async fn replace_items(
        repository: &ActivityGroupRepository<'_>,
        id: &str,
        input: ReplaceActivityGroupItemsInput,
    ) -> Result<ActivityGroup, ActivityGroupServiceError> {
        repository
            .replace_items(id, input)
            .await
            .map_err(ActivityGroupServiceError::Database)?;
        repository
            .get(id)
            .await
            .map_err(ActivityGroupServiceError::Database)?
            .ok_or_else(|| {
                ActivityGroupServiceError::Validation("Activity group not found".to_string())
            })
    }

    pub async fn merge(
        repository: &ActivityGroupRepository<'_>,
        target_id: &str,
        input: MergeActivityGroupsInput,
    ) -> Result<ActivityGroup, ActivityGroupServiceError> {
        let mut target = repository
            .get(target_id)
            .await
            .map_err(ActivityGroupServiceError::Database)?
            .ok_or_else(|| {
                ActivityGroupServiceError::Validation("Activity group not found".to_string())
            })?;
        let mut items = target.items.iter().map(item_to_input).collect::<Vec<_>>();
        for source_id in input.source_group_ids {
            if source_id == target_id {
                continue;
            }
            if let Some(source) = repository
                .get(&source_id)
                .await
                .map_err(ActivityGroupServiceError::Database)?
            {
                items.extend(source.items.iter().map(item_to_input));
                repository
                    .delete(&source_id)
                    .await
                    .map_err(ActivityGroupServiceError::Database)?;
            }
        }
        items.sort_by(|left, right| left.occurred_at.cmp(&right.occurred_at));
        items.dedup_by(|left, right| {
            left.source_type == right.source_type && left.source_id == right.source_id
        });
        if let Some(title) = input.title {
            target = repository
                .update(
                    target_id,
                    UpdateActivityGroupInput {
                        title: Some(title),
                        summary: None,
                        start_date: None,
                        end_date: None,
                        source: None,
                        confidence: None,
                        included_in_report: None,
                        report_summary: None,
                        locked: None,
                        review_status: Some("reviewed".to_string()),
                    },
                )
                .await
                .map_err(ActivityGroupServiceError::Database)?
                .unwrap_or(target);
        }
        repository
            .replace_items(target_id, ReplaceActivityGroupItemsInput { items })
            .await
            .map_err(ActivityGroupServiceError::Database)?;
        repository
            .get(&target.id)
            .await
            .map_err(ActivityGroupServiceError::Database)?
            .ok_or_else(|| {
                ActivityGroupServiceError::Validation("Activity group not found".to_string())
            })
    }

    pub async fn split(
        repository: &ActivityGroupRepository<'_>,
        id: &str,
        input: SplitActivityGroupInput,
    ) -> Result<ActivityGroup, ActivityGroupServiceError> {
        let group = repository
            .get(id)
            .await
            .map_err(ActivityGroupServiceError::Database)?
            .ok_or_else(|| {
                ActivityGroupServiceError::Validation("Activity group not found".to_string())
            })?;
        let selected = input.item_ids.into_iter().collect::<HashSet<_>>();
        let moved = group
            .items
            .iter()
            .filter(|item| selected.contains(&item.id))
            .map(item_to_input)
            .collect::<Vec<_>>();
        if moved.is_empty() {
            return Err(ActivityGroupServiceError::Validation(
                "Select at least one evidence item to split".to_string(),
            ));
        }
        let remaining = group
            .items
            .iter()
            .filter(|item| !selected.contains(&item.id))
            .map(item_to_input)
            .collect::<Vec<_>>();
        repository
            .replace_items(id, ReplaceActivityGroupItemsInput { items: remaining })
            .await
            .map_err(ActivityGroupServiceError::Database)?;
        repository
            .create(CreateActivityGroupInput {
                project_id: group.project_id.clone(),
                workspace_id: group.workspace_id.clone(),
                title: input
                    .title
                    .unwrap_or_else(|| format!("{} - Split", group.title)),
                summary: group.summary.clone(),
                start_date: moved
                    .first()
                    .map(|item| item.occurred_at.chars().take(10).collect())
                    .unwrap_or_else(|| group.start_date.clone()),
                end_date: moved
                    .last()
                    .map(|item| item.occurred_at.chars().take(10).collect())
                    .unwrap_or_else(|| group.end_date.clone()),
                source: Some("user".to_string()),
                confidence: Some(group.confidence),
                included_in_report: Some(group.included_in_report),
                fingerprint: None,
                algorithm_version: Some(ALGORITHM_VERSION.to_string()),
                confidence_label: Some("strong".to_string()),
                rationale_json: Some(json_reasons(&["Split by user review"])),
                report_summary: group.report_summary.clone(),
                locked: Some(false),
                review_status: Some("reviewed".to_string()),
                title_confidence: group.title_confidence,
                title_confidence_label: group.title_confidence_label.clone(),
                title_quality_label: group.title_quality_label.clone(),
                title_strategy: group.title_strategy.clone(),
                title_classification_json: None,
                title_candidates_json: group.title_candidates_json.clone(),
                title_rationale_json: group.title_rationale_json.clone(),
                title_rejected_terms_json: None,
                items: moved,
            })
            .await
            .map_err(ActivityGroupServiceError::Database)
    }

    pub async fn move_item(
        repository: &ActivityGroupRepository<'_>,
        _source_group_id: &str,
        input: MoveActivityGroupItemInput,
    ) -> Result<ActivityGroup, ActivityGroupServiceError> {
        repository
            .move_item(&input.item_id, &input.target_group_id)
            .await
            .map_err(ActivityGroupServiceError::Database)?
            .ok_or_else(|| {
                ActivityGroupServiceError::Validation("Target group not found".to_string())
            })
    }

    pub async fn lock(
        repository: &ActivityGroupRepository<'_>,
        id: &str,
        input: LockActivityGroupInput,
    ) -> Result<ActivityGroup, ActivityGroupServiceError> {
        repository
            .set_lock(id, input.locked)
            .await
            .map_err(ActivityGroupServiceError::Database)?
            .ok_or_else(|| {
                ActivityGroupServiceError::Validation("Activity group not found".to_string())
            })
    }

    pub async fn reset(
        repository: &ActivityGroupRepository<'_>,
        id: &str,
    ) -> Result<bool, ActivityGroupServiceError> {
        let Some(group) = repository
            .get(id)
            .await
            .map_err(ActivityGroupServiceError::Database)?
        else {
            return Ok(false);
        };
        if group.locked {
            return Err(ActivityGroupServiceError::Validation(
                "Unlock the group before resetting it".to_string(),
            ));
        }
        repository
            .delete(id)
            .await
            .map_err(ActivityGroupServiceError::Database)
    }

    pub async fn preview_title(
        repository: &ActivityGroupRepository<'_>,
        input: PreviewActivityGroupTitleInput,
    ) -> Result<PreviewActivityGroupTitleResponse, ActivityGroupServiceError> {
        if let Some(narrative) = repository
            .get_narrative(&input.group_id)
            .await
            .map_err(ActivityGroupServiceError::Database)?
        {
            let group_narrative = crate::application::activity_group_narrative::GroupNarrative {
                title: narrative.title,
                summary: narrative.summary.unwrap_or_default(),
                report_summary: narrative.report_summary.unwrap_or_default(),
                reasons: vec!["Loaded persisted title narrative".to_string()],
                title_confidence: narrative.title_confidence,
                title_confidence_label: narrative.title_confidence_label,
                title_quality_label: narrative.title_quality_label,
                naming_strategy: narrative.naming_strategy,
                classification_json: narrative.classification_json,
                candidates_json: narrative.candidates_json,
                title_rationale_json: narrative.rationale_json,
                rejected_terms_json: narrative.rejected_terms_json,
            };
            return Ok(preview_response_from_narrative(&group_narrative));
        }

        let group = repository
            .get(&input.group_id)
            .await
            .map_err(ActivityGroupServiceError::Database)?
            .ok_or_else(|| {
                ActivityGroupServiceError::Validation("Activity group not found".to_string())
            })?;
        let memories = repository
            .list_title_memories(group.project_id.as_ref().map(|id| std::slice::from_ref(id)))
            .await
            .map_err(ActivityGroupServiceError::Database)?;
        let evidence = narrative_evidence_from_group(repository, &group).await?;
        let narrative = GroupNarrativeSynthesizer::new(&evidence, &memories).synthesize();
        Ok(preview_response_from_narrative(&narrative))
    }

    pub async fn regenerate_title(
        repository: &ActivityGroupRepository<'_>,
        input: RegenerateActivityGroupTitleInput,
    ) -> Result<PreviewActivityGroupTitleResponse, ActivityGroupServiceError> {
        let group = repository
            .get(&input.group_id)
            .await
            .map_err(ActivityGroupServiceError::Database)?
            .ok_or_else(|| {
                ActivityGroupServiceError::Validation("Activity group not found".to_string())
            })?;
        if input.respect_user_edited && (group.locked || group.user_edited_at.is_some()) {
            return Self::preview_title(
                repository,
                PreviewActivityGroupTitleInput {
                    group_id: input.group_id,
                },
            )
            .await;
        }

        let memories = repository
            .list_title_memories(group.project_id.as_ref().map(|id| std::slice::from_ref(id)))
            .await
            .map_err(ActivityGroupServiceError::Database)?;
        let evidence = narrative_evidence_from_group(repository, &group).await?;
        let narrative = GroupNarrativeSynthesizer::new(&evidence, &memories).synthesize();
        let response = preview_response_from_narrative(&narrative);
        if input.persist {
            repository
                .update(
                    &input.group_id,
                    UpdateActivityGroupInput {
                        title: Some(response.selected_title.clone()),
                        summary: Some(response.selected_summary.clone()),
                        start_date: None,
                        end_date: None,
                        source: None,
                        confidence: None,
                        included_in_report: None,
                        report_summary: Some(response.selected_report_summary.clone()),
                        locked: None,
                        review_status: Some(
                            if response.title_confidence_label == "needs_review" {
                                "needs_review"
                            } else {
                                "draft"
                            }
                            .to_string(),
                        ),
                    },
                )
                .await
                .map_err(ActivityGroupServiceError::Database)?;
        }
        Ok(response)
    }

    pub async fn select_title_candidate(
        repository: &ActivityGroupRepository<'_>,
        input: SelectActivityGroupTitleCandidateInput,
    ) -> Result<ActivityGroup, ActivityGroupServiceError> {
        repository
            .select_title_candidate(input)
            .await
            .map_err(ActivityGroupServiceError::Database)?
            .ok_or_else(|| {
                ActivityGroupServiceError::Validation("Activity group not found".to_string())
            })
    }

    pub async fn record_title_feedback(
        repository: &ActivityGroupRepository<'_>,
        input: RecordActivityGroupTitleFeedbackInput,
    ) -> Result<bool, ActivityGroupServiceError> {
        repository
            .record_title_event(input)
            .await
            .map_err(ActivityGroupServiceError::Database)?;
        Ok(true)
    }
}

#[derive(Debug)]
pub enum ActivityGroupServiceError {
    Validation(String),
    Database(sqlx::Error),
}

#[derive(Clone)]
struct EvidenceNode {
    item: ActivityItem,
    changes: Vec<CommitFileChange>,
    snippets: Vec<CommitDiffSnippet>,
    embedding: Option<Vec<f32>>,
    tokens: BTreeSet<String>,
    path_tokens: BTreeSet<String>,
    module_tokens: BTreeSet<String>,
    change_types: BTreeSet<String>,
}

async fn build_group_drafts(
    group_repository: &ActivityGroupRepository<'_>,
    activity_repository: &ActivityRepository<'_>,
    git_repository: &GitMetadataRepository<'_>,
    settings_repository: &SettingsRepository<'_>,
    embedding_repository: &ActivityEmbeddingRepository<'_>,
    input: PreviewActivityGroupSuggestionsInput,
) -> Result<Vec<CreateActivityGroupInput>, ActivityGroupServiceError> {
    let memory_project_ids = input.project_ids.clone();
    let days = activity_repository
        .list(ListActivityInput {
            from: input.from,
            to: input.to,
            activity_type: Some("commit".to_string()),
            project_ids: input.project_ids,
            workspace_ids: input.workspace_ids,
            classification: input.classification,
            git_refs: input.git_refs,
            worktree_paths: input.worktree_paths,
        })
        .await
        .map_err(ActivityGroupServiceError::Database)?;

    let commits = days
        .into_iter()
        .flat_map(|day| day.items)
        .collect::<Vec<_>>();
    let mut by_project: BTreeMap<String, Vec<ActivityItem>> = BTreeMap::new();
    for item in commits {
        if let (Some(project_id), Some(_hash)) = (&item.project_id, &item.commit_hash) {
            by_project.entry(project_id.clone()).or_default().push(item);
        }
    }
    let memories = group_repository
        .list_title_memories(memory_project_ids.as_deref())
        .await
        .map_err(ActivityGroupServiceError::Database)?;

    let mut nodes = Vec::new();
    for (project_id, mut project_items) in by_project {
        project_items.sort_by(|left, right| left.occurred_at.cmp(&right.occurred_at));
        let hashes = project_items
            .iter()
            .filter_map(|item| item.commit_hash.clone())
            .collect::<Vec<_>>();
        let changes = git_repository
            .list_file_changes_for_commits(&project_id, &hashes)
            .await
            .map_err(ActivityGroupServiceError::Database)?;
        let snippets = git_repository
            .list_diff_snippets_for_commits(&project_id, &hashes)
            .await
            .map_err(ActivityGroupServiceError::Database)?;
        let changes_by_hash = bucket_changes(changes);
        let snippets_by_hash = bucket_snippets(snippets);

        let item_ids = project_items
            .iter()
            .map(|item| item.id.clone())
            .collect::<Vec<_>>();
        let embeddings = if input.use_embeddings.unwrap_or(true) {
            EmbeddingIndexService::embeddings_for_activity_items(
                settings_repository,
                embedding_repository,
                &item_ids,
            )
            .await
            .unwrap_or_default()
        } else {
            HashMap::new()
        };

        for item in project_items {
            let hash = item.commit_hash.clone().unwrap_or_default();
            let changes = changes_by_hash.get(&hash).cloned().unwrap_or_default();
            let snippets = snippets_by_hash.get(&hash).cloned().unwrap_or_default();
            let embedding = embeddings.get(&item.id).cloned();
            nodes.push(EvidenceNode::new(item, changes, snippets, embedding));
        }
    }

    Ok(cluster_nodes(nodes, &memories))
}

impl EvidenceNode {
    fn new(
        item: ActivityItem,
        changes: Vec<CommitFileChange>,
        snippets: Vec<CommitDiffSnippet>,
        embedding: Option<Vec<f32>>,
    ) -> Self {
        let mut text = format!(
            "{} {} {}",
            item.summary,
            item.branch.as_deref().unwrap_or(""),
            item.project_name.as_deref().unwrap_or("")
        );
        for snippet in &snippets {
            text.push(' ');
            text.push_str(&snippet.snippet);
        }
        let tokens = text_tokens(&text);
        let path_tokens = changes
            .iter()
            .flat_map(|change| path_terms(&change.path))
            .collect::<BTreeSet<_>>();
        let module_tokens = changes
            .iter()
            .flat_map(module_terms)
            .chain(branch_phrases_from_ref(item.branch.as_deref()))
            .flat_map(|term| text_tokens(&term))
            .collect::<BTreeSet<_>>();
        let mut change_types = BTreeSet::new();
        for change in &changes {
            if change.is_test {
                change_types.insert("test".to_string());
            }
            if change.is_docs {
                change_types.insert("docs".to_string());
            }
            if change.is_config {
                change_types.insert("config".to_string());
            }
            if change.is_migration {
                change_types.insert("migration".to_string());
            }
            if change.is_generated {
                change_types.insert("generated".to_string());
            }
        }
        if change_types.is_empty() {
            change_types.insert("source".to_string());
        }
        Self {
            item,
            changes,
            snippets,
            embedding,
            tokens,
            path_tokens,
            module_tokens,
            change_types,
        }
    }
}

fn cluster_nodes(
    mut nodes: Vec<EvidenceNode>,
    memories: &[ActivityGroupTitleMemory],
) -> Vec<CreateActivityGroupInput> {
    nodes.sort_by(|left, right| left.item.occurred_at.cmp(&right.item.occurred_at));
    let commit_count = nodes.len();
    let mut parent = (0..nodes.len()).collect::<Vec<_>>();
    let mut reasons: HashMap<usize, BTreeSet<String>> = HashMap::new();
    let mut scores: HashMap<usize, Vec<f64>> = HashMap::new();

    for left in 0..nodes.len() {
        for right in (left + 1)..nodes.len() {
            if !same_weekish(&nodes[left].item, &nodes[right].item) {
                continue;
            }
            if !should_score_candidate(&nodes[left], &nodes[right], nodes.len()) {
                continue;
            }
            let scored = score_edge(&nodes[left], &nodes[right]);
            if accepts_edge(&scored) {
                let root = union(&mut parent, left, right);
                reasons.entry(root).or_default().extend(scored.reasons);
                scores.entry(root).or_default().push(scored.score);
            }
        }
    }

    merge_theme_components(&nodes, &mut parent, &mut reasons, &mut scores);

    let mut components: BTreeMap<usize, Vec<EvidenceNode>> = BTreeMap::new();
    for index in 0..nodes.len() {
        let root = find(&mut parent, index);
        components
            .entry(root)
            .or_default()
            .push(nodes[index].clone());
    }

    let mut drafts = components
        .into_iter()
        .filter_map(|(root, mut group_nodes)| {
            group_nodes.sort_by(|left, right| left.item.occurred_at.cmp(&right.item.occurred_at));
            let avg_score = scores
                .get(&root)
                .map(|values| values.iter().sum::<f64>() / values.len().max(1) as f64)
                .unwrap_or(0.42);
            let reasons = reasons.remove(&root).unwrap_or_else(|| {
                BTreeSet::from(["Single evidence item needs review".to_string()])
            });
            draft_from_nodes(
                group_nodes,
                avg_score,
                reasons.into_iter().collect(),
                memories,
            )
        })
        .collect::<Vec<_>>();

    drafts.retain(|draft| {
        if draft.items.len() > 1 {
            return true;
        }
        is_high_quality_singleton_draft(draft)
    });

    if commit_count >= 8 {
        let target = ((commit_count as f64) * 0.60).ceil() as usize;
        if drafts.len() > target {
            drafts.sort_by(|left, right| {
                right.items.len().cmp(&left.items.len()).then_with(|| {
                    right
                        .confidence
                        .unwrap_or_default()
                        .total_cmp(&left.confidence.unwrap_or_default())
                })
            });
            let mut kept = Vec::new();
            let mut singleton_budget =
                target.saturating_sub(drafts.iter().filter(|draft| draft.items.len() > 1).count());
            for draft in drafts {
                if draft.items.len() > 1 {
                    kept.push(draft);
                } else if singleton_budget > 0
                    && draft.confidence_label.as_deref() != Some("needs_review")
                {
                    singleton_budget -= 1;
                    kept.push(draft);
                }
            }
            drafts = kept;
        }
    }

    drafts
}

fn should_score_candidate(left: &EvidenceNode, right: &EvidenceNode, node_count: usize) -> bool {
    if node_count <= 80 {
        return true;
    }
    if anchor_score(&left.item, &right.item) >= 0.8 {
        return true;
    }
    let same_family = grouping_family(&left.item) == grouping_family(&right.item);
    if same_family && temporal_score(&left.item, &right.item) >= 0.62 {
        return true;
    }
    if !left.module_tokens.is_disjoint(&right.module_tokens)
        || !left.path_tokens.is_disjoint(&right.path_tokens)
    {
        return true;
    }
    if taskish_overlap(&left.tokens, &right.tokens) >= 0.8 {
        return true;
    }
    same_family && jaccard(&left.tokens, &right.tokens) >= 0.18
}

struct ScoredEdge {
    score: f64,
    is_groupable: bool,
    strong_anchor: bool,
    contextual: bool,
    reasons: BTreeSet<String>,
}

fn score_edge(left: &EvidenceNode, right: &EvidenceNode) -> ScoredEdge {
    let path = jaccard(&left.path_tokens, &right.path_tokens);
    let module = jaccard(&left.module_tokens, &right.module_tokens);
    let structural = path.max(module);
    let temporal = temporal_score(&left.item, &right.item);
    let anchor = anchor_score(&left.item, &right.item);
    let lexical = jaccard(&left.tokens, &right.tokens);
    let semantic = semantic_score(left.embedding.as_deref(), right.embedding.as_deref());
    let family = if grouping_family(&left.item) == grouping_family(&right.item) {
        1.0
    } else {
        0.0
    };
    let source_link = taskish_overlap(&left.tokens, &right.tokens);
    let change_type = jaccard(&left.change_types, &right.change_types);
    let non_temporal_signals = [
        structural >= 0.30,
        anchor >= 0.8,
        lexical >= 0.25,
        semantic >= 0.74,
        source_link >= 0.8,
        change_type >= 0.75,
    ]
    .into_iter()
    .filter(|matched| *matched)
    .count();
    let is_strong_anchor = anchor >= 0.8 || source_link >= 0.8;
    let contextual = family >= 1.0 && temporal >= 0.55 && (structural >= 0.22 || lexical >= 0.18);
    let semantic_contextual = family >= 1.0 && temporal >= 0.55 && semantic >= 0.72;
    let has_embeddings = left.embedding.is_some() && right.embedding.is_some();
    let mut score = if has_embeddings {
        (0.22 * structural)
            + (0.18 * temporal)
            + (0.14 * anchor)
            + (0.10 * lexical)
            + (0.16 * semantic)
            + (0.08 * family)
            + (0.07 * source_link)
            + (0.05 * change_type)
    } else {
        (0.25 * structural)
            + (0.20 * temporal)
            + (0.15 * anchor)
            + (0.15 * lexical)
            + (0.10 * family)
            + (0.10 * source_link)
            + (0.05 * change_type)
    };

    if generated_only(left) || generated_only(right) {
        score -= 0.12;
    }
    if temporal == 0.0 {
        score -= 0.08;
    }
    if release_config_mix(left, right) {
        score -= 0.10;
    }
    if structural == 0.0 && left.path_tokens.len() > 3 && right.path_tokens.len() > 3 {
        score -= 0.08;
    }
    if is_strong_anchor && temporal >= 0.35 {
        score += 0.10;
    }
    if contextual || semantic_contextual {
        score += 0.08;
    }

    let mut reasons = BTreeSet::new();
    if anchor >= 0.8 {
        reasons.insert("Same branch, ref, or issue anchor".to_string());
    }
    if structural >= 0.30 {
        reasons.insert("Shared changed module or path family".to_string());
    }
    if temporal >= 0.65 {
        reasons.insert(format!(
            "Adjacent commits within {SESSION_GAP_MINUTES} minutes"
        ));
    }
    if lexical >= 0.25 {
        reasons.insert("Similar message or diff terms".to_string());
    }
    if semantic >= 0.74 {
        reasons.insert("Semantically similar evidence".to_string());
    }
    if change_type >= 0.75 {
        reasons.insert("Similar change type".to_string());
    }

    ScoredEdge {
        score: score.clamp(0.0, 1.0),
        is_groupable: is_strong_anchor
            || contextual
            || semantic_contextual
            || non_temporal_signals >= 2,
        strong_anchor: is_strong_anchor,
        contextual: contextual || semantic_contextual,
        reasons,
    }
}

fn accepts_edge(edge: &ScoredEdge) -> bool {
    edge.is_groupable
        && (edge.score >= EDGE_THRESHOLD
            || (edge.strong_anchor && edge.score >= STRONG_ANCHOR_EDGE_THRESHOLD)
            || (edge.contextual && edge.score >= CONTEXTUAL_EDGE_THRESHOLD))
}

fn merge_theme_components(
    nodes: &[EvidenceNode],
    parent: &mut [usize],
    reasons: &mut HashMap<usize, BTreeSet<String>>,
    scores: &mut HashMap<usize, Vec<f64>>,
) {
    let mut changed = true;
    let mut passes = 0;
    while changed && passes < 4 {
        changed = false;
        passes += 1;
        let mut components: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
        for index in 0..nodes.len() {
            let root = find(parent, index);
            components.entry(root).or_default().push(index);
        }
        let component_entries = components.into_iter().collect::<Vec<_>>();
        'outer: for left_index in 0..component_entries.len() {
            for right_index in (left_index + 1)..component_entries.len() {
                let (left_root, left_nodes) = &component_entries[left_index];
                let (right_root, right_nodes) = &component_entries[right_index];
                if let Some(merge) = should_merge_theme_components(nodes, left_nodes, right_nodes) {
                    let root = union(parent, *left_root, *right_root);
                    reasons.entry(root).or_default().insert(merge.reason);
                    scores.entry(root).or_default().push(merge.score);
                    changed = true;
                    break 'outer;
                }
            }
        }
    }
}

struct ThemeMerge {
    score: f64,
    reason: String,
}

fn should_merge_theme_components(
    nodes: &[EvidenceNode],
    left_indexes: &[usize],
    right_indexes: &[usize],
) -> Option<ThemeMerge> {
    let left = component_theme(nodes, left_indexes)?;
    let right = component_theme(nodes, right_indexes)?;
    if left.project_family != right.project_family {
        return None;
    }
    let branch = jaccard(&left.branch_phrases, &right.branch_phrases);
    let issues = jaccard(&left.issue_tokens, &right.issue_tokens);
    let modules = jaccard(&left.module_tokens, &right.module_tokens);
    let lexical = jaccard(&left.theme_tokens, &right.theme_tokens);
    let close = component_temporal_score(&left, &right);
    if branch >= 0.60 || issues >= 0.60 {
        return Some(ThemeMerge {
            score: 0.72,
            reason: "Merged related evidence by shared branch or issue theme".to_string(),
        });
    }
    if close >= 0.45 && modules >= 0.34 && lexical >= 0.12 {
        return Some(ThemeMerge {
            score: 0.64,
            reason: "Merged related evidence by shared module and nearby work".to_string(),
        });
    }
    if close >= 0.45 && lexical >= 0.30 && !left.branch_phrases.is_empty() {
        return Some(ThemeMerge {
            score: 0.61,
            reason: "Merged related evidence by repeated product terms".to_string(),
        });
    }
    None
}

struct ComponentTheme {
    project_family: String,
    branch_phrases: BTreeSet<String>,
    issue_tokens: BTreeSet<String>,
    module_tokens: BTreeSet<String>,
    theme_tokens: BTreeSet<String>,
    first_at: DateTime<Utc>,
    last_at: DateTime<Utc>,
}

fn component_theme(nodes: &[EvidenceNode], indexes: &[usize]) -> Option<ComponentTheme> {
    let first_item = &nodes.get(*indexes.first()?)?.item;
    let mut first_at = parse_time(&first_item.occurred_at)?;
    let mut last_at = first_at;
    let mut branch_phrases = BTreeSet::new();
    let mut issue_tokens_set = BTreeSet::new();
    let mut module_tokens = BTreeSet::new();
    let mut theme_tokens = BTreeSet::new();
    for index in indexes {
        let node = &nodes[*index];
        let occurred_at = parse_time(&node.item.occurred_at)?;
        first_at = first_at.min(occurred_at);
        last_at = last_at.max(occurred_at);
        branch_phrases.extend(branch_phrases_from_ref(node.item.branch.as_deref()));
        issue_tokens_set.extend(issue_tokens(&format!(
            "{} {}",
            node.item.summary,
            node.item.branch.as_deref().unwrap_or("")
        )));
        module_tokens.extend(node.module_tokens.iter().cloned());
        theme_tokens.extend(
            node.tokens
                .iter()
                .filter(|token| !WEAK_THEME_WORDS.contains(&token.as_str()))
                .cloned(),
        );
    }
    Some(ComponentTheme {
        project_family: grouping_family(first_item),
        branch_phrases,
        issue_tokens: issue_tokens_set,
        module_tokens,
        theme_tokens,
        first_at,
        last_at,
    })
}

fn component_temporal_score(left: &ComponentTheme, right: &ComponentTheme) -> f64 {
    let gap = if left.last_at < right.first_at {
        (right.first_at - left.last_at).num_minutes()
    } else if right.last_at < left.first_at {
        (left.first_at - right.last_at).num_minutes()
    } else {
        0
    };
    if gap <= SESSION_GAP_MINUTES {
        1.0
    } else if gap <= 480 {
        0.65
    } else if gap <= 2_880 {
        0.45
    } else {
        0.0
    }
}

fn is_high_quality_singleton_draft(draft: &CreateActivityGroupInput) -> bool {
    if draft.items.len() != 1 {
        return true;
    }
    let title = draft.title.to_lowercase();
    let rationale = draft.rationale_json.as_deref().unwrap_or("").to_lowercase();
    draft.confidence_label.as_deref() != Some("needs_review")
        || rationale.contains("branch phrase")
        || rationale.contains("task or imported")
        || title.contains("release")
        || title.contains("updater")
}

fn draft_from_nodes(
    nodes: Vec<EvidenceNode>,
    score: f64,
    mut reasons: Vec<String>,
    memories: &[ActivityGroupTitleMemory],
) -> Option<CreateActivityGroupInput> {
    let first = nodes.first()?;
    let last = nodes.last().unwrap_or(first);
    let confidence_label = if score >= 0.76 && nodes.len() > 1 {
        "strong"
    } else if score >= 0.56 || nodes.len() > 1 {
        "likely"
    } else {
        "needs_review"
    };
    if reasons.is_empty() {
        reasons.push("Needs review: only one strong local evidence item was found".to_string());
    }
    let narrative_evidence = narrative_evidence_from_nodes(&nodes);
    let narrative = GroupNarrativeSynthesizer::new(&narrative_evidence, memories).synthesize();
    reasons.extend(narrative.reasons.clone());
    let fingerprint = fingerprint_for_nodes(&nodes);

    Some(CreateActivityGroupInput {
        project_id: common_project_id(&nodes),
        workspace_id: common_workspace_id(&nodes),
        title: narrative.title,
        summary: Some(narrative.summary.clone()),
        start_date: first.item.occurred_at.chars().take(10).collect(),
        end_date: last.item.occurred_at.chars().take(10).collect(),
        source: Some("local_rule".to_string()),
        confidence: Some(score),
        included_in_report: Some(confidence_label != "needs_review" || nodes.len() > 1),
        fingerprint: Some(fingerprint),
        algorithm_version: Some(ALGORITHM_VERSION.to_string()),
        confidence_label: Some(confidence_label.to_string()),
        rationale_json: Some(serde_json::to_string(&reasons).unwrap_or_else(|_| "[]".to_string())),
        report_summary: Some(narrative.report_summary),
        locked: Some(false),
        review_status: Some(
            if confidence_label == "needs_review" {
                "needs_review"
            } else {
                "draft"
            }
            .to_string(),
        ),
        title_confidence: Some(narrative.title_confidence),
        title_confidence_label: Some(narrative.title_confidence_label),
        title_quality_label: Some(narrative.title_quality_label),
        title_strategy: Some(narrative.naming_strategy),
        title_classification_json: Some(narrative.classification_json),
        title_candidates_json: Some(narrative.candidates_json),
        title_rationale_json: Some(narrative.title_rationale_json),
        title_rejected_terms_json: narrative.rejected_terms_json,
        items: nodes
            .iter()
            .map(|node| ActivityGroupItemInput {
                source_type: "commit".to_string(),
                source_id: node.item.id.clone(),
                occurred_at: node.item.occurred_at.clone(),
                summary_snapshot: node.item.summary.clone(),
            })
            .collect(),
    })
}

fn narrative_evidence_from_nodes(nodes: &[EvidenceNode]) -> Vec<NarrativeEvidence> {
    nodes
        .iter()
        .map(|node| {
            let mut terms = NarrativeEvidenceTerms {
                project_family: node.item.project_name.clone(),
                branch_phrases: branch_phrases_from_ref(node.item.branch.as_deref()),
                issue_tokens: issue_tokens_from_text(&format!(
                    "{} {}",
                    node.item.summary,
                    node.item.branch.as_deref().unwrap_or("")
                )),
                commit_subjects: vec![clean_commit_subject(&node.item.summary)],
                change_terms: node.change_types.iter().cloned().collect(),
                ..NarrativeEvidenceTerms::default()
            };

            for change in &node.changes {
                if let Some(module) = &change.top_level_dir {
                    terms.module_terms.push(module.clone());
                }
                terms.path_terms.extend(path_terms_from_path(&change.path));
                terms.change_terms.push(change.change_kind.clone());
                if change.is_test {
                    terms.change_terms.push("test".to_string());
                }
                if change.is_docs {
                    terms.change_terms.push("docs".to_string());
                }
                if change.is_config {
                    terms.change_terms.push("config".to_string());
                }
            }

            for snippet in &node.snippets {
                terms
                    .diff_terms
                    .extend(diff_terms_from_text(&snippet.snippet));
            }

            NarrativeEvidence {
                project_id: node.item.project_id.clone(),
                project_name: node.item.project_name.clone(),
                terms,
            }
        })
        .collect()
}

async fn narrative_evidence_from_group(
    repository: &ActivityGroupRepository<'_>,
    group: &ActivityGroup,
) -> Result<Vec<NarrativeEvidence>, ActivityGroupServiceError> {
    let mut changes_by_hash = HashMap::<String, Vec<CommitFileChange>>::new();
    let mut snippets_by_hash = HashMap::<String, Vec<CommitDiffSnippet>>::new();
    let mut hashes_by_project = BTreeMap::<String, Vec<String>>::new();

    for activity in group.items.iter().filter_map(|item| item.activity.as_ref()) {
        if let (Some(project_id), Some(hash)) = (&activity.project_id, &activity.commit_hash) {
            hashes_by_project
                .entry(project_id.clone())
                .or_default()
                .push(hash.clone());
        }
    }

    for (project_id, hashes) in hashes_by_project {
        for change in repository
            .list_file_changes_for_project_commits(&project_id, &hashes)
            .await
            .map_err(ActivityGroupServiceError::Database)?
        {
            changes_by_hash
                .entry(change.commit_hash.clone())
                .or_default()
                .push(change);
        }
        for snippet in repository
            .list_diff_snippets_for_project_commits(&project_id, &hashes)
            .await
            .map_err(ActivityGroupServiceError::Database)?
        {
            snippets_by_hash
                .entry(snippet.commit_hash.clone())
                .or_default()
                .push(snippet);
        }
    }

    let mut evidence = group
        .items
        .iter()
        .filter_map(|item| item.activity.as_ref())
        .map(|activity| {
            let subject = clean_commit_subject(&activity.summary);
            let text = format!(
                "{} {} {}",
                subject,
                activity.branch.as_deref().unwrap_or(""),
                group.summary.as_deref().unwrap_or("")
            );
            let hash = activity.commit_hash.clone().unwrap_or_default();
            let changes = changes_by_hash.get(&hash).cloned().unwrap_or_default();
            let snippets = snippets_by_hash.get(&hash).cloned().unwrap_or_default();
            NarrativeEvidence {
                project_id: activity
                    .project_id
                    .clone()
                    .or_else(|| group.project_id.clone()),
                project_name: activity
                    .project_name
                    .clone()
                    .or_else(|| group.project_name.clone()),
                terms: NarrativeEvidenceTerms {
                    project_family: activity
                        .project_name
                        .clone()
                        .or_else(|| group.project_name.clone()),
                    branch_phrases: branch_phrases_from_ref(activity.branch.as_deref()),
                    issue_tokens: issue_tokens_from_text(&text),
                    module_terms: changes
                        .iter()
                        .flat_map(|change| {
                            change
                                .top_level_dir
                                .clone()
                                .into_iter()
                                .chain(path_terms_from_path(&change.path))
                        })
                        .collect(),
                    path_terms: changes
                        .iter()
                        .flat_map(|change| path_terms_from_path(&change.path))
                        .collect(),
                    diff_terms: snippets
                        .iter()
                        .flat_map(|snippet| diff_terms_from_text(&snippet.snippet))
                        .chain(diff_terms_from_text(group.summary.as_deref().unwrap_or("")))
                        .collect(),
                    source_titles: Vec::new(),
                    commit_subjects: vec![subject],
                    change_terms: changes
                        .iter()
                        .flat_map(|change| {
                            [
                                change.is_test.then_some("test"),
                                change.is_docs.then_some("docs"),
                                change.is_config.then_some("config"),
                                change.is_migration.then_some("migration"),
                                change.is_generated.then_some("generated"),
                            ]
                            .into_iter()
                            .flatten()
                            .chain(std::iter::once(change.change_kind.as_str()))
                            .map(str::to_string)
                            .collect::<Vec<_>>()
                        })
                        .collect(),
                },
            }
        })
        .collect::<Vec<_>>();
    if evidence.is_empty() {
        evidence.push(NarrativeEvidence {
            project_id: group.project_id.clone(),
            project_name: group.project_name.clone(),
            terms: NarrativeEvidenceTerms {
                project_family: group.project_name.clone(),
                branch_phrases: Vec::new(),
                issue_tokens: issue_tokens_from_text(&group.title),
                module_terms: Vec::new(),
                path_terms: Vec::new(),
                diff_terms: diff_terms_from_text(group.summary.as_deref().unwrap_or("")),
                source_titles: Vec::new(),
                commit_subjects: vec![group.title.clone()],
                change_terms: Vec::new(),
            },
        });
    }
    Ok(evidence)
}

fn fingerprint_for_nodes(nodes: &[EvidenceNode]) -> String {
    let mut ids = nodes
        .iter()
        .map(|node| node.item.id.clone())
        .collect::<Vec<_>>();
    ids.sort();
    let mut project_ids = nodes
        .iter()
        .filter_map(|node| node.item.project_id.clone())
        .collect::<Vec<_>>();
    project_ids.sort();
    project_ids.dedup();
    let workspace_id = common_workspace_id(nodes).unwrap_or_else(|| "no-workspace".to_string());
    let input = format!(
        "{ALGORITHM_VERSION}|workspace:{workspace_id}|projects:{}|{}",
        project_ids.join(","),
        ids.join("|")
    );
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    input.hash(&mut hasher);
    format!("grp_{:x}", hasher.finish())
}

fn item_to_input(
    item: &crate::domain::activity_group::ActivityGroupItem,
) -> ActivityGroupItemInput {
    ActivityGroupItemInput {
        source_type: item.source_type.clone(),
        source_id: item.source_id.clone(),
        occurred_at: item.occurred_at.clone(),
        summary_snapshot: item.summary_snapshot.clone(),
    }
}

fn bucket_changes(changes: Vec<CommitFileChange>) -> HashMap<String, Vec<CommitFileChange>> {
    let mut map = HashMap::new();
    for change in changes {
        map.entry(change.commit_hash.clone())
            .or_insert_with(Vec::new)
            .push(change);
    }
    map
}

fn bucket_snippets(snippets: Vec<CommitDiffSnippet>) -> HashMap<String, Vec<CommitDiffSnippet>> {
    let mut map = HashMap::new();
    for snippet in snippets {
        map.entry(snippet.commit_hash.clone())
            .or_insert_with(Vec::new)
            .push(snippet);
    }
    map
}

fn union(parent: &mut [usize], left: usize, right: usize) -> usize {
    let left_root = find(parent, left);
    let right_root = find(parent, right);
    if left_root != right_root {
        parent[right_root] = left_root;
    }
    left_root
}

fn find(parent: &mut [usize], index: usize) -> usize {
    if parent[index] != index {
        parent[index] = find(parent, parent[index]);
    }
    parent[index]
}

fn same_weekish(left: &ActivityItem, right: &ActivityItem) -> bool {
    grouping_family(left) == grouping_family(right) || anchor_score(left, right) >= 0.8
}

fn temporal_score(left: &ActivityItem, right: &ActivityItem) -> f64 {
    let Some(left_time) = parse_time(&left.occurred_at) else {
        return 0.0;
    };
    let Some(right_time) = parse_time(&right.occurred_at) else {
        return 0.0;
    };
    let minutes = (right_time - left_time).num_minutes().abs();
    if minutes <= SESSION_GAP_MINUTES {
        1.0 - (minutes as f64 / (SESSION_GAP_MINUTES as f64 * 2.0))
    } else if minutes <= 480 {
        0.35
    } else {
        0.0
    }
}

fn parse_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|time| time.with_timezone(&Utc))
        .ok()
}

fn anchor_score(left: &ActivityItem, right: &ActivityItem) -> f64 {
    let left_branch = branch_anchor(left);
    let right_branch = branch_anchor(right);
    if !left_branch.is_empty() && left_branch == right_branch {
        return 1.0;
    }
    let left_issues = issue_tokens(&format!("{} {}", left.summary, left_branch));
    let right_issues = issue_tokens(&format!("{} {}", right.summary, right_branch));
    if !left_issues.is_empty() && !left_issues.is_disjoint(&right_issues) {
        return 1.0;
    }
    0.0
}

fn taskish_overlap(left: &BTreeSet<String>, right: &BTreeSet<String>) -> f64 {
    let anchors = [
        "task",
        "case",
        "ticket",
        "issue",
        "contract",
        "notification",
        "report",
    ];
    let left = left
        .iter()
        .filter(|token| anchors.contains(&token.as_str()))
        .collect::<BTreeSet<_>>();
    let right = right
        .iter()
        .filter(|token| anchors.contains(&token.as_str()))
        .collect::<BTreeSet<_>>();
    if left.is_empty() || right.is_empty() {
        0.0
    } else if left == right {
        1.0
    } else {
        0.35
    }
}

fn jaccard(left: &BTreeSet<String>, right: &BTreeSet<String>) -> f64 {
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let intersection = left.intersection(right).count() as f64;
    let union = left.union(right).count() as f64;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

fn semantic_score(left: Option<&[f32]>, right: Option<&[f32]>) -> f64 {
    let (Some(left), Some(right)) = (left, right) else {
        return 0.0;
    };
    if left.is_empty() || right.is_empty() || left.len() != right.len() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut left_norm = 0.0f32;
    let mut right_norm = 0.0f32;
    for (left, right) in left.iter().zip(right.iter()) {
        dot += left * right;
        left_norm += left * left;
        right_norm += right * right;
    }
    if left_norm == 0.0 || right_norm == 0.0 {
        0.0
    } else {
        (dot / (left_norm.sqrt() * right_norm.sqrt())).clamp(0.0, 1.0) as f64
    }
}

fn generated_only(node: &EvidenceNode) -> bool {
    !node.changes.is_empty() && node.changes.iter().all(|change| change.is_generated)
}

fn release_config_mix(left: &EvidenceNode, right: &EvidenceNode) -> bool {
    let release_words = ["release", "manifest", "updater", "version", "v0"];
    let left_release = release_words.iter().any(|word| left.tokens.contains(*word));
    let right_release = release_words
        .iter()
        .any(|word| right.tokens.contains(*word));
    (left_release && !right_release && right.change_types.contains("source"))
        || (right_release && !left_release && left.change_types.contains("source"))
}

fn common_project_id(nodes: &[EvidenceNode]) -> Option<String> {
    let first = nodes.first()?.item.project_id.clone()?;
    nodes
        .iter()
        .all(|node| node.item.project_id.as_deref() == Some(first.as_str()))
        .then_some(first)
}

fn common_workspace_id(nodes: &[EvidenceNode]) -> Option<String> {
    let first = nodes.first()?.item.workspace_id.clone()?;
    nodes
        .iter()
        .all(|node| node.item.workspace_id.as_deref() == Some(first.as_str()))
        .then_some(first)
}

fn grouping_family(item: &ActivityItem) -> String {
    if let Some(workspace_id) = item.workspace_id.as_deref().filter(|value| !value.is_empty()) {
        return format!("workspace:{workspace_id}");
    }
    project_family(item)
}

fn project_family(item: &ActivityItem) -> String {
    let name = item
        .project_name
        .as_deref()
        .unwrap_or("general")
        .to_lowercase();
    if name.starts_with("sparc-force") || name.starts_with("sparc force") {
        "sparc-force".to_string()
    } else {
        name
    }
}

fn branch_anchor(item: &ActivityItem) -> String {
    let branch = item
        .worktree
        .as_ref()
        .and_then(|worktree| worktree.branch.as_deref())
        .or(item.branch.as_deref())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let branch = normalize_branch_anchor(&branch);
    if is_default_branch(&branch) {
        String::new()
    } else {
        branch
    }
}

fn normalize_branch_anchor(branch: &str) -> String {
    branch
        .trim()
        .trim_start_matches("refs/heads/")
        .trim_start_matches("refs/remotes/")
        .trim_start_matches("origin/")
        .to_lowercase()
}

fn is_default_branch(branch: &str) -> bool {
    matches!(
        normalize_branch_anchor(branch).as_str(),
        "" | "head" | "main" | "master"
    )
}

fn issue_tokens(text: &str) -> BTreeSet<String> {
    let normalized = text
        .to_lowercase()
        .replace(['/', '\\', '_'], " ")
        .replace('#', " #");
    let words = normalized
        .split_whitespace()
        .map(|word| {
            word.trim_matches(|character: char| {
                !character.is_ascii_alphanumeric() && character != '#' && character != '-'
            })
        })
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();
    let mut tokens = BTreeSet::new();
    for (index, word) in words.iter().enumerate() {
        if word.starts_with('#')
            && word[1..]
                .chars()
                .all(|character| character.is_ascii_digit())
        {
            tokens.insert((*word).to_string());
            continue;
        }
        let has_digit = word.chars().any(|character| character.is_ascii_digit());
        let has_alpha = word
            .chars()
            .any(|character| character.is_ascii_alphabetic());
        if has_digit && has_alpha {
            tokens.insert((*word).to_string());
            continue;
        }
        if matches!(*word, "case" | "issue" | "ticket" | "task" | "bug" | "pr") {
            if let Some(next) = words.get(index + 1) {
                if next.chars().any(|character| character.is_ascii_digit()) {
                    tokens.insert(format!("{word}-{next}"));
                }
            }
        }
    }
    tokens
}

fn path_terms(path: &str) -> BTreeSet<String> {
    path.split(|character: char| !character.is_ascii_alphanumeric())
        .filter_map(normalize_token)
        .collect()
}

fn module_terms(change: &CommitFileChange) -> BTreeSet<String> {
    let mut terms = BTreeSet::new();
    if let Some(top_level) = change.top_level_dir.as_deref() {
        if let Some(token) = normalize_token(top_level) {
            terms.insert(token);
        }
    }
    let parts = change
        .path
        .split('/')
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>();
    for part in parts.iter().take(3) {
        terms.extend(path_terms(part));
    }
    if let Some(file_name) = parts.last() {
        let stem = file_name
            .rsplit_once('.')
            .map(|(stem, _)| stem)
            .unwrap_or(file_name);
        terms.extend(path_terms(stem));
    }
    terms
}

fn text_tokens(text: &str) -> BTreeSet<String> {
    text.split(|character: char| !character.is_ascii_alphanumeric())
        .filter_map(normalize_token)
        .collect()
}

fn normalize_token(token: &str) -> Option<String> {
    let token = token.trim().to_lowercase();
    if token.len() < 3 || STOP_WORDS.contains(&token.as_str()) {
        None
    } else {
        Some(token)
    }
}

fn json_reasons(reasons: &[&str]) -> String {
    serde_json::to_string(reasons).unwrap_or_else(|_| "[]".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn activity(id: &str, summary: &str, branch: Option<&str>, minute: &str) -> ActivityItem {
        activity_with_project_workspace(id, summary, branch, minute, "project_1", "WorkTrace", None)
    }

    fn activity_with_project_workspace(
        id: &str,
        summary: &str,
        branch: Option<&str>,
        minute: &str,
        project_id: &str,
        project_name: &str,
        workspace_id: Option<&str>,
    ) -> ActivityItem {
        ActivityItem {
            id: id.to_string(),
            project_id: Some(project_id.to_string()),
            project_name: Some(project_name.to_string()),
            workspace_id: workspace_id.map(str::to_string),
            workspace_name: workspace_id.map(|_| "Sparc Force".to_string()),
            workspace_relative_path: None,
            activity_type: "commit".to_string(),
            summary: summary.to_string(),
            occurred_at: format!("2026-05-27T10:{minute}:00Z"),
            included_in_report: true,
            commit_hash: Some(format!("hash_{id}")),
            author_name: None,
            author_email: None,
            branch: branch.map(str::to_string),
            files_changed: Some(1),
            insertions: Some(1),
            deletions: Some(0),
            refs: Vec::new(),
            worktree: None,
        }
    }

    fn change(hash: &str, path: &str, top_level: &str) -> CommitFileChange {
        CommitFileChange {
            project_id: "project_1".to_string(),
            commit_hash: hash.to_string(),
            path: path.to_string(),
            old_path: None,
            change_kind: "modified".to_string(),
            additions: 1,
            deletions: 0,
            is_binary: false,
            language: Some("TypeScript".to_string()),
            top_level_dir: Some(top_level.to_string()),
            is_test: false,
            is_docs: false,
            is_config: false,
            is_migration: false,
            is_generated: false,
            collected_at: "2026-05-27T10:00:00Z".to_string(),
        }
    }

    fn node(
        id: &str,
        summary: &str,
        branch: Option<&str>,
        minute: &str,
        path: &str,
    ) -> EvidenceNode {
        EvidenceNode::new(
            activity(id, summary, branch, minute),
            vec![change(&format!("hash_{id}"), path, "contracts")],
            Vec::new(),
            None,
        )
    }

    #[test]
    fn default_branches_do_not_anchor_grouping() {
        let left = activity("a", "fix", Some("main"), "00");
        let right = activity("b", "update", Some("origin/main"), "05");

        assert_eq!(anchor_score(&left, &right), 0.0);
    }

    #[test]
    fn weak_singletons_are_not_persisted_as_groups() {
        let drafts = cluster_nodes(
            vec![node("a", "update", Some("main"), "00", "src/misc/file.ts")],
            &[],
        );

        assert!(drafts.is_empty());
    }

    #[test]
    fn related_commits_become_one_work_item() {
        let drafts = cluster_nodes(
            vec![
                node(
                    "a",
                    "fix escalation email",
                    Some("feature/contracts-escalation-email"),
                    "00",
                    "src/contracts/notifications.ts",
                ),
                node(
                    "b",
                    "update notification template",
                    Some("feature/contracts-escalation-email"),
                    "18",
                    "src/contracts/email-template.ts",
                ),
            ],
            &[],
        );

        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].items.len(), 2);
    }

    #[test]
    fn shared_workspace_and_feature_branch_can_group_across_projects() {
        let drafts = cluster_nodes(
            vec![
                EvidenceNode::new(
                    activity_with_project_workspace(
                        "api_1",
                        "feat: add campaign invite metrics",
                        Some("feature/tasks-analytics"),
                        "00",
                        "api",
                        "SPARC-FORCE-API",
                        Some("workspace_sparc"),
                    ),
                    vec![change("hash_api_1", "src/campaigns/invites.rs", "src")],
                    Vec::new(),
                    None,
                ),
                EvidenceNode::new(
                    activity_with_project_workspace(
                        "web_1",
                        "feat: update campaign invites table",
                        Some("feature/tasks-analytics"),
                        "12",
                        "web",
                        "SPARC-FORCE-WEB",
                        Some("workspace_sparc"),
                    ),
                    vec![change("hash_web_1", "src/components/CampaignInvitesTable.tsx", "src")],
                    Vec::new(),
                    None,
                ),
            ],
            &[],
        );

        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].project_id, None);
        assert_eq!(drafts[0].workspace_id.as_deref(), Some("workspace_sparc"));
        assert_eq!(drafts[0].items.len(), 2);
    }

    #[test]
    fn same_workspace_alone_does_not_group_unrelated_commits() {
        let drafts = cluster_nodes(
            vec![
                EvidenceNode::new(
                    activity_with_project_workspace(
                        "api_2",
                        "feat: add billing export",
                        None,
                        "00",
                        "api",
                        "SPARC-FORCE-API",
                        Some("workspace_sparc"),
                    ),
                    vec![change("hash_api_2", "src/billing/export.rs", "src")],
                    Vec::new(),
                    None,
                ),
                EvidenceNode::new(
                    activity_with_project_workspace(
                        "web_2",
                        "fix: improve profile avatar upload",
                        None,
                        "09",
                        "web",
                        "SPARC-FORCE-WEB",
                        Some("workspace_sparc"),
                    ),
                    vec![change("hash_web_2", "src/profile/avatar.tsx", "src")],
                    Vec::new(),
                    None,
                ),
            ],
            &[],
        );

        assert!(drafts.is_empty());
    }
}

fn validate_range(from: &str, to: &str) -> Result<(), ActivityGroupServiceError> {
    if from.trim().is_empty() || to.trim().is_empty() {
        return Err(ActivityGroupServiceError::Validation(
            "Activity group date range is required".to_string(),
        ));
    }
    Ok(())
}

fn validate_group_title(title: &str) -> Result<(), ActivityGroupServiceError> {
    if title.trim().is_empty() {
        return Err(ActivityGroupServiceError::Validation(
            "Activity group title is required".to_string(),
        ));
    }
    Ok(())
}

const STOP_WORDS: &[&str] = &[
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "into",
    "update",
    "updated",
    "add",
    "added",
    "fix",
    "fixed",
    "worktrace",
    "commit",
    "file",
    "files",
    "src",
    "app",
];

const WEAK_THEME_WORDS: &[&str] = &[
    "add", "added", "change", "changes", "cleanup", "commit", "fix", "fixed", "misc", "page",
    "project", "projects", "refactor", "related", "stuff", "temp", "update", "updated", "work",
    "wip",
];
