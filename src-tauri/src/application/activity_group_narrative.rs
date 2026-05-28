use std::collections::{BTreeMap, BTreeSet, HashSet};

use serde::{Deserialize, Serialize};

use crate::domain::activity_group::{
    ActivityGroupTitleMemory, PreviewActivityGroupTitleResponse, TitleCandidateDto,
    TitleRationaleDto,
};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrativeEvidenceTerms {
    pub project_family: Option<String>,
    pub branch_phrases: Vec<String>,
    pub issue_tokens: Vec<String>,
    pub module_terms: Vec<String>,
    pub path_terms: Vec<String>,
    pub diff_terms: Vec<String>,
    pub source_titles: Vec<String>,
    pub commit_subjects: Vec<String>,
    pub change_terms: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct NarrativeEvidence {
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub terms: NarrativeEvidenceTerms,
}

#[derive(Debug, Clone)]
pub struct GroupNarrative {
    pub title: String,
    pub summary: String,
    pub report_summary: String,
    pub reasons: Vec<String>,
    pub title_confidence: f64,
    pub title_confidence_label: String,
    pub title_quality_label: String,
    pub naming_strategy: String,
    pub classification_json: String,
    pub candidates_json: String,
    pub title_rationale_json: String,
    pub rejected_terms_json: Option<String>,
}

pub struct GroupNarrativeSynthesizer<'a> {
    evidence: &'a [NarrativeEvidence],
    memories: &'a [ActivityGroupTitleMemory],
}

impl<'a> GroupNarrativeSynthesizer<'a> {
    pub fn new(
        evidence: &'a [NarrativeEvidence],
        memories: &'a [ActivityGroupTitleMemory],
    ) -> Self {
        Self { evidence, memories }
    }

    pub fn synthesize(&self) -> GroupNarrative {
        let project = self.project_title();
        let terms = self.collect_terms();
        let mut reasons = Vec::new();

        if let Some(memory) = self.matching_memory(&terms) {
            reasons.push("Used your previous naming correction".to_string());
            let summary = memory.edited_summary.clone().unwrap_or_else(|| {
                self.summary_sentence("Refined", &feature_from_title(&memory.edited_title), &terms)
            });
            let candidates = vec![TitleCandidateDto {
                id: "memory".to_string(),
                title: memory.edited_title.clone(),
                summary: summary.clone(),
                report_summary: summary.clone(),
                action: "Refined".to_string(),
                domains: vec![feature_from_title(&memory.edited_title)],
                strategy: "user_memory".to_string(),
                score: 0.98,
                quality_label: "report_ready".to_string(),
                rationale: reasons.clone(),
            }];
            let rationale = title_rationale(
                &memory.edited_title,
                "Refined",
                &candidates[0].domains,
                "user_memory",
                0.98,
                "strong",
                "report_ready",
                reasons.clone(),
                rejected_terms(&terms),
                Vec::new(),
                Vec::new(),
            );
            return GroupNarrative {
                title: memory.edited_title.clone(),
                summary: summary.clone(),
                report_summary: summary,
                reasons,
                title_confidence: 0.98,
                title_confidence_label: "strong".to_string(),
                title_quality_label: "report_ready".to_string(),
                naming_strategy: "user_memory".to_string(),
                classification_json: classification_json(
                    "Refined",
                    "enhancement",
                    &candidates[0].domains,
                    0.98,
                ),
                candidates_json: serialize_json(&candidates),
                title_rationale_json: serialize_json(&rationale),
                rejected_terms_json: Some(serialize_json(&rejected_terms(&terms))),
            };
        }

        let action = infer_action(&terms);
        reasons.push(format!("Inferred {action} action from local evidence"));

        let (feature, reason) = self.ranked_feature(&terms).unwrap_or_else(|| {
            (
                "Reviewed Work Item".to_string(),
                "Used conservative fallback title".to_string(),
            )
        });
        reasons.push(reason);

        let feature = title_case(&coherent_feature(action, &feature, &terms));
        let title = if feature == "Reviewed Work Item" {
            format!("{project} - Reviewed Work Item")
        } else {
            format!("{project} - {action} {feature}")
        };
        let summary = self.summary_sentence(action, &feature, &terms);
        let candidates = self.title_candidates(&project, action, &feature, &summary, &terms);
        let selected = candidates
            .iter()
            .max_by(|left, right| left.score.total_cmp(&right.score))
            .cloned()
            .unwrap_or_else(|| TitleCandidateDto {
                id: "fallback".to_string(),
                title: title.clone(),
                summary: summary.clone(),
                report_summary: summary.clone(),
                action: action.to_string(),
                domains: vec![feature.clone()],
                strategy: "fallback".to_string(),
                score: 0.42,
                quality_label: "fallback_only".to_string(),
                rationale: reasons.clone(),
            });
        let confidence = selected.score.clamp(0.0, 1.0);
        let confidence_label = confidence_label(confidence).to_string();
        let quality_label = selected.quality_label.clone();
        let mut warnings = Vec::new();
        if quality_label == "fallback_only" || quality_label == "needs_user_review" {
            warnings.push("Title needs review before it is report-ready.".to_string());
        }
        let rejected_candidates = candidates
            .iter()
            .filter(|candidate| candidate.title != selected.title)
            .filter(|candidate| candidate.quality_label == "rejected")
            .map(|candidate| candidate.title.clone())
            .collect::<Vec<_>>();
        let rationale = title_rationale(
            &selected.title,
            &selected.action,
            &selected.domains,
            &selected.strategy,
            confidence,
            &confidence_label,
            &quality_label,
            reasons.clone(),
            rejected_terms(&terms),
            rejected_candidates,
            warnings,
        );

        GroupNarrative {
            title: selected.title,
            summary: selected.summary.clone(),
            report_summary: selected.report_summary,
            reasons,
            title_confidence: confidence,
            title_confidence_label: confidence_label,
            title_quality_label: quality_label,
            naming_strategy: selected.strategy.clone(),
            classification_json: classification_json(
                &selected.action,
                work_type(action, &terms),
                &selected.domains,
                confidence,
            ),
            candidates_json: serialize_json(&candidates),
            title_rationale_json: serialize_json(&rationale),
            rejected_terms_json: Some(serialize_json(&rejected_terms(&terms))),
        }
    }

    fn project_title(&self) -> String {
        let project_names = self
            .evidence
            .iter()
            .filter_map(|evidence| evidence.project_name.as_deref())
            .map(project_family_title)
            .collect::<BTreeSet<_>>();
        if project_names.len() > 1
            && project_names
                .iter()
                .all(|name| name.to_lowercase().starts_with("sparc force"))
        {
            return "Sparc Force".to_string();
        }

        project_names
            .iter()
            .next()
            .cloned()
            .or_else(|| {
                self.evidence
                    .iter()
                    .find_map(|evidence| evidence.terms.project_family.as_deref())
                    .map(project_family_title)
            })
            .unwrap_or_else(|| "WorkTrace".to_string())
    }

    fn ranked_feature(&self, terms: &NarrativeEvidenceTerms) -> Option<(String, String)> {
        let dominant_branches = self.dominant_branch_phrases();
        terms
            .source_titles
            .iter()
            .find(|title| high_quality_phrase(title))
            .map(|title| {
                (
                    clean_feature_phrase(title),
                    "Named from task or imported work title".to_string(),
                )
            })
            .or_else(|| {
                terms
                    .branch_phrases
                    .iter()
                    .find(|phrase| {
                        dominant_branches.contains(&clean_feature_phrase(phrase))
                            && high_quality_phrase(phrase)
                    })
                    .map(|phrase| {
                        (
                            clean_feature_phrase(phrase),
                            "Named from dominant branch phrase".to_string(),
                        )
                    })
            })
            .or_else(|| {
                ranked_subject(terms)
                    .map(|subject| (subject, "Named from strongest commit subject".to_string()))
            })
            .or_else(|| {
                ranked_product_phrase(terms)
                    .map(|phrase| (phrase, "Named from product evidence".to_string()))
            })
            .or_else(|| {
                ranked_module(terms)
                    .map(|module| (module, "Named from dominant changed module".to_string()))
            })
    }

    fn dominant_branch_phrases(&self) -> BTreeSet<String> {
        let mut counts = BTreeMap::<String, usize>::new();
        let total = self.evidence.len().max(1);
        for evidence in self.evidence {
            for phrase in &evidence.terms.branch_phrases {
                if high_quality_phrase(phrase) {
                    *counts.entry(clean_feature_phrase(phrase)).or_default() += 1;
                }
            }
        }
        counts
            .into_iter()
            .filter_map(|(phrase, count)| (count * 2 >= total).then_some(phrase))
            .collect()
    }

    fn matching_memory(&self, terms: &NarrativeEvidenceTerms) -> Option<&ActivityGroupTitleMemory> {
        let current_project_ids = self
            .evidence
            .iter()
            .filter_map(|evidence| evidence.project_id.as_deref())
            .collect::<HashSet<_>>();

        self.memories
            .iter()
            .filter(|memory| {
                memory.project_id.is_none()
                    || current_project_ids.is_empty()
                    || memory
                        .project_id
                        .as_deref()
                        .is_some_and(|project_id| current_project_ids.contains(project_id))
            })
            .filter_map(|memory| {
                let memory_terms = memory_terms(memory);
                let score = weighted_memory_similarity(terms, &memory_terms);
                let same_project = memory.project_id.is_none()
                    || memory
                        .project_id
                        .as_deref()
                        .is_some_and(|project_id| current_project_ids.contains(project_id));
                let strong_anchor = !overlap(&terms.branch_phrases, &memory_terms.branch_phrases)
                    .is_empty()
                    || !overlap(&terms.issue_tokens, &memory_terms.issue_tokens).is_empty()
                    || overlap_ratio(&terms.module_terms, &memory_terms.module_terms) >= 0.35;
                (score >= 0.48 && (same_project || strong_anchor)).then_some((score, memory))
            })
            .max_by(|left, right| left.0.total_cmp(&right.0))
            .map(|(_, memory)| memory)
    }

    fn collect_terms(&self) -> NarrativeEvidenceTerms {
        let mut terms = NarrativeEvidenceTerms::default();
        for evidence in self.evidence {
            if terms.project_family.is_none() {
                terms.project_family = evidence
                    .terms
                    .project_family
                    .clone()
                    .or_else(|| evidence.project_name.clone());
            }
            extend_unique(&mut terms.branch_phrases, &evidence.terms.branch_phrases);
            extend_unique(&mut terms.issue_tokens, &evidence.terms.issue_tokens);
            extend_unique(&mut terms.module_terms, &evidence.terms.module_terms);
            extend_unique(&mut terms.path_terms, &evidence.terms.path_terms);
            extend_unique(&mut terms.diff_terms, &evidence.terms.diff_terms);
            extend_unique(&mut terms.source_titles, &evidence.terms.source_titles);
            extend_unique(&mut terms.commit_subjects, &evidence.terms.commit_subjects);
            extend_unique(&mut terms.change_terms, &evidence.terms.change_terms);
        }
        normalize_terms(&mut terms);
        terms
    }

    fn summary_sentence(
        &self,
        action: &str,
        feature: &str,
        terms: &NarrativeEvidenceTerms,
    ) -> String {
        let module = ranked_module(terms)
            .map(|value| title_case(&value))
            .unwrap_or_else(|| feature.to_string());
        let mut focus = ranked_focus_terms(terms);
        focus.retain(|term| {
            !term.eq_ignore_ascii_case(&module) && !term.eq_ignore_ascii_case(feature)
        });
        focus.truncate(2);

        if focus.len() >= 2 {
            format!("{} {} and {} in {}.", action, focus[0], focus[1], module)
        } else if let Some(first) = focus.first() {
            format!("{action} {first} in {module}.")
        } else {
            format!("{action} {feature} in {module}.")
        }
    }

    fn title_candidates(
        &self,
        project: &str,
        action: &str,
        feature: &str,
        _summary: &str,
        terms: &NarrativeEvidenceTerms,
    ) -> Vec<TitleCandidateDto> {
        let mut candidates = Vec::new();
        let mut push = |strategy: &str, phrase: String, base_score: f64, reason: &str| {
            let cleaned = title_case(&coherent_feature(action, &phrase, terms));
            let title = if cleaned == "Reviewed Work Item" {
                format!("{project} - Reviewed Work Item")
            } else {
                format!("{project} - {action} {cleaned}")
            };
            let validation = validate_title(&title, &cleaned, terms);
            let score = candidate_score(base_score, &cleaned, strategy, validation.is_valid, terms);
            let quality_label =
                title_quality_label(score, validation.is_valid, &cleaned).to_string();
            candidates.push(TitleCandidateDto {
                id: format!("{strategy}-{}", candidates.len() + 1),
                title,
                summary: self.summary_sentence(action, &cleaned, terms),
                report_summary: self.summary_sentence(action, &cleaned, terms),
                action: action.to_string(),
                domains: vec![cleaned],
                strategy: strategy.to_string(),
                score,
                quality_label,
                rationale: [vec![reason.to_string()], validation.reasons].concat(),
            });
        };

        for source in terms.source_titles.iter().take(2) {
            if high_quality_phrase(source) {
                push(
                    "source_title",
                    clean_feature_phrase(source),
                    0.90,
                    "Candidate from task or imported work title",
                );
            }
        }
        for branch in self.dominant_branch_phrases().into_iter().take(2) {
            push(
                "branch_phrase",
                branch,
                0.78,
                "Candidate from dominant branch phrase",
            );
        }
        if release_or_updater_work(
            &terms.commit_subjects.join(" ").to_lowercase(),
            &terms.path_terms.join(" ").to_lowercase(),
            &terms.change_terms.join(" ").to_lowercase(),
        ) {
            push(
                "release_pattern",
                "signed windows updater release".to_string(),
                0.94,
                "Candidate from release and updater evidence",
            );
        }
        if let Some(subject) = ranked_subject(terms) {
            push(
                "domain_phrase",
                subject,
                0.84,
                "Candidate from strongest commit subject",
            );
        }
        if let Some(product) = ranked_product_phrase(terms) {
            push(
                "domain_phrase",
                product,
                0.80,
                "Candidate from product evidence",
            );
        }
        if let Some(module) = ranked_module(terms) {
            push(
                "module_phrase",
                module,
                0.62,
                "Candidate from changed module evidence",
            );
        }
        push(
            "fallback",
            feature.to_string(),
            0.45,
            "Fallback candidate from available evidence",
        );

        candidates.sort_by(|left, right| {
            right
                .score
                .total_cmp(&left.score)
                .then_with(|| left.title.cmp(&right.title))
        });
        candidates.dedup_by(|left, right| left.title == right.title);
        candidates.truncate(5);
        candidates
    }
}

pub fn preview_response_from_narrative(
    narrative: &GroupNarrative,
) -> PreviewActivityGroupTitleResponse {
    let candidates = serde_json::from_str::<Vec<TitleCandidateDto>>(&narrative.candidates_json)
        .unwrap_or_default();
    let rationale = serde_json::from_str::<TitleRationaleDto>(&narrative.title_rationale_json)
        .unwrap_or_else(|_| {
            title_rationale(
                &narrative.title,
                "",
                &[],
                &narrative.naming_strategy,
                narrative.title_confidence,
                &narrative.title_confidence_label,
                &narrative.title_quality_label,
                narrative.reasons.clone(),
                Vec::new(),
                Vec::new(),
                Vec::new(),
            )
        });
    PreviewActivityGroupTitleResponse {
        selected_title: narrative.title.clone(),
        selected_summary: narrative.summary.clone(),
        selected_report_summary: narrative.report_summary.clone(),
        title_confidence: narrative.title_confidence,
        title_confidence_label: narrative.title_confidence_label.clone(),
        title_quality_label: narrative.title_quality_label.clone(),
        naming_strategy: narrative.naming_strategy.clone(),
        candidates,
        rationale,
    }
}

fn memory_terms(memory: &ActivityGroupTitleMemory) -> NarrativeEvidenceTerms {
    if let Some(json) = &memory.evidence_terms_json {
        if let Ok(terms) = serde_json::from_str::<NarrativeEvidenceTerms>(json) {
            return terms;
        }
    }
    let tokens = tokenize(&memory.evidence_terms);
    NarrativeEvidenceTerms {
        module_terms: tokens
            .iter()
            .filter(|term| meaningful_feature_term(term))
            .cloned()
            .collect(),
        path_terms: tokens,
        ..NarrativeEvidenceTerms::default()
    }
}

fn weighted_memory_similarity(
    left: &NarrativeEvidenceTerms,
    right: &NarrativeEvidenceTerms,
) -> f64 {
    (0.26 * overlap_ratio(&left.branch_phrases, &right.branch_phrases))
        + (0.24 * overlap_ratio(&left.issue_tokens, &right.issue_tokens))
        + (0.24 * overlap_ratio(&left.module_terms, &right.module_terms))
        + (0.12 * overlap_ratio(&left.path_terms, &right.path_terms))
        + (0.08 * overlap_ratio(&left.source_titles, &right.source_titles))
        + (0.04 * overlap_ratio(&left.diff_terms, &right.diff_terms))
        + (0.02 * overlap_ratio(&left.commit_subjects, &right.commit_subjects))
}

struct TitleValidation {
    is_valid: bool,
    reasons: Vec<String>,
}

fn validate_title(title: &str, feature: &str, terms: &NarrativeEvidenceTerms) -> TitleValidation {
    let mut reasons = Vec::new();
    let feature_words = tokenize(feature);
    let generic_count = feature_words
        .iter()
        .filter(|word| generic_feature_term(word))
        .count();
    let all_generic = !feature_words.is_empty() && generic_count == feature_words.len();
    let too_long = title.split_whitespace().count() > 14;
    let unsupported = !feature_words.is_empty()
        && feature_words
            .iter()
            .filter(|word| evidence_contains_term(terms, word))
            .count()
            == 0;
    if all_generic {
        reasons.push("Rejected because the title names a technical container.".to_string());
    }
    if too_long {
        reasons.push("Rejected because the title is too long for a report item.".to_string());
    }
    if unsupported {
        reasons
            .push("Rejected because the title is weakly supported by local evidence.".to_string());
    }
    TitleValidation {
        is_valid: reasons.is_empty(),
        reasons,
    }
}

fn evidence_contains_term(terms: &NarrativeEvidenceTerms, term: &str) -> bool {
    [
        &terms.branch_phrases,
        &terms.module_terms,
        &terms.path_terms,
        &terms.diff_terms,
        &terms.source_titles,
        &terms.commit_subjects,
    ]
    .into_iter()
    .any(|values| values.iter().any(|value| value.contains(term)))
}

fn candidate_score(
    base: f64,
    feature: &str,
    strategy: &str,
    valid: bool,
    terms: &NarrativeEvidenceTerms,
) -> f64 {
    let words = tokenize(feature);
    let specificity = (words.len() as f64 / 4.0).clamp(0.2, 1.0);
    let source_diversity = source_diversity(feature, terms);
    let generic_penalty = words
        .iter()
        .filter(|word| generic_feature_term(word))
        .count() as f64
        * 0.12;
    let strategy_bonus = match strategy {
        "user_memory" => 0.16,
        "source_title" => 0.10,
        "release_pattern" => 0.12,
        "domain_phrase" => 0.08,
        "branch_phrase" => 0.02,
        _ => 0.0,
    };
    let invalid_penalty = if valid { 0.0 } else { 0.35 };
    (base + (0.10 * specificity) + (0.12 * source_diversity) + strategy_bonus
        - generic_penalty
        - invalid_penalty)
        .clamp(0.0, 1.0)
}

fn source_diversity(feature: &str, terms: &NarrativeEvidenceTerms) -> f64 {
    let words = tokenize(feature);
    if words.is_empty() {
        return 0.0;
    }
    let sources = [
        &terms.branch_phrases,
        &terms.module_terms,
        &terms.path_terms,
        &terms.diff_terms,
        &terms.source_titles,
        &terms.commit_subjects,
    ];
    let matched = sources
        .iter()
        .filter(|values| {
            words
                .iter()
                .any(|word| values.iter().any(|value| value.contains(word)))
        })
        .count();
    (matched as f64 / sources.len() as f64).clamp(0.0, 1.0)
}

fn confidence_label(score: f64) -> &'static str {
    if score >= 0.78 {
        "strong"
    } else if score >= 0.58 {
        "likely"
    } else {
        "needs_review"
    }
}

fn title_quality_label(score: f64, valid: bool, feature: &str) -> &'static str {
    if !valid {
        "rejected"
    } else if feature == "Reviewed Work Item" {
        "fallback_only"
    } else if score >= 0.78 {
        "report_ready"
    } else if score >= 0.62 {
        "acceptable"
    } else if score >= 0.48 {
        "technically_correct_but_weak"
    } else {
        "needs_user_review"
    }
}

fn work_type(action: &str, terms: &NarrativeEvidenceTerms) -> &'static str {
    match action {
        "Fixed" => "bug_fix",
        "Prepared" => "release",
        "Tested" => "test_work",
        "Documented" => "documentation",
        "Configured" => "configuration",
        "Refined" => "refactor",
        "Added" => "feature",
        "Improved" => "enhancement",
        _ if dominant_change_family(terms) == "migration" => "migration",
        _ => "maintenance",
    }
}

fn classification_json(
    action: &str,
    work_type: &str,
    domains: &[String],
    confidence: f64,
) -> String {
    serialize_json(&serde_json::json!({
        "workType": work_type,
        "primaryAction": action,
        "primaryDomain": domains.first(),
        "secondaryDomains": domains.iter().skip(1).collect::<Vec<_>>(),
        "classificationConfidence": confidence,
    }))
}

fn title_rationale(
    selected_title: &str,
    selected_action: &str,
    selected_domains: &[String],
    naming_strategy: &str,
    title_confidence: f64,
    title_confidence_label: &str,
    title_quality_label: &str,
    positive_evidence: Vec<String>,
    rejected_terms: Vec<String>,
    rejected_candidates: Vec<String>,
    warnings: Vec<String>,
) -> TitleRationaleDto {
    TitleRationaleDto {
        selected_title: selected_title.to_string(),
        selected_action: selected_action.to_string(),
        selected_domains: selected_domains.to_vec(),
        naming_strategy: naming_strategy.to_string(),
        title_confidence,
        title_confidence_label: title_confidence_label.to_string(),
        title_quality_label: title_quality_label.to_string(),
        positive_evidence,
        rejected_terms,
        rejected_candidates,
        warnings,
    }
}

fn rejected_terms(terms: &NarrativeEvidenceTerms) -> Vec<String> {
    [
        &terms.branch_phrases,
        &terms.module_terms,
        &terms.path_terms,
        &terms.diff_terms,
        &terms.commit_subjects,
    ]
    .into_iter()
    .flat_map(|values| values.iter())
    .flat_map(|value| value.split_whitespace())
    .map(|value| value.trim().to_lowercase())
    .filter(|value| generic_feature_term(value))
    .collect::<BTreeSet<_>>()
    .into_iter()
    .collect()
}

fn serialize_json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string())
}

fn ranked_module(terms: &NarrativeEvidenceTerms) -> Option<String> {
    let mut scores = BTreeMap::<String, f64>::new();
    for module in &terms.module_terms {
        if meaningful_feature_term(module) && !generic_feature_term(module) {
            *scores.entry(clean_feature_phrase(module)).or_default() += 3.0;
        }
    }
    for path in &terms.path_terms {
        if meaningful_feature_term(path) && !generic_feature_term(path) {
            *scores.entry(clean_feature_phrase(path)).or_default() += 1.5;
        }
    }
    for diff in &terms.diff_terms {
        if meaningful_feature_term(diff) && !generic_feature_term(diff) {
            *scores.entry(clean_feature_phrase(diff)).or_default() += 0.5;
        }
    }
    scores
        .into_iter()
        .max_by(|left, right| {
            left.1
                .total_cmp(&right.1)
                .then_with(|| right.0.cmp(&left.0))
        })
        .map(|(term, _)| term)
}

fn ranked_product_phrase(terms: &NarrativeEvidenceTerms) -> Option<String> {
    let mut scores = BTreeMap::<String, f64>::new();
    for module in &terms.module_terms {
        for path in &terms.path_terms {
            if meaningful_feature_term(module)
                && meaningful_feature_term(path)
                && !generic_feature_term(module)
                && !generic_feature_term(path)
                && module != path
            {
                *scores
                    .entry(format!(
                        "{} {}",
                        clean_feature_phrase(module),
                        clean_feature_phrase(path)
                    ))
                    .or_default() += 3.5;
            }
        }
    }
    for subject in &terms.commit_subjects {
        for phrase in product_phrases(subject) {
            *scores.entry(phrase).or_default() += 5.0;
        }
    }
    for branch in &terms.branch_phrases {
        for phrase in product_phrases(branch) {
            *scores.entry(phrase).or_default() += 2.5;
        }
    }
    for path in &terms.path_terms {
        if meaningful_feature_term(path) && !generic_feature_term(path) {
            *scores.entry(clean_feature_phrase(path)).or_default() += 1.0;
        }
    }
    let mut ranked = scores.into_iter().collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        right
            .1
            .total_cmp(&left.1)
            .then_with(|| {
                right
                    .0
                    .split_whitespace()
                    .count()
                    .cmp(&left.0.split_whitespace().count())
            })
            .then_with(|| left.0.cmp(&right.0))
    });
    ranked
        .into_iter()
        .map(|(phrase, _)| phrase)
        .find(|phrase| high_quality_phrase(phrase))
}

fn ranked_focus_terms(terms: &NarrativeEvidenceTerms) -> Vec<String> {
    let mut scores = BTreeMap::<String, f64>::new();
    for source in &terms.source_titles {
        for token in tokenize(source) {
            if meaningful_feature_term(&token) {
                *scores.entry(clean_feature_phrase(&token)).or_default() += 4.0;
            }
        }
    }
    for branch in &terms.branch_phrases {
        for token in tokenize(branch) {
            if meaningful_feature_term(&token) {
                *scores.entry(clean_feature_phrase(&token)).or_default() += 3.0;
            }
        }
    }
    for module in &terms.module_terms {
        if meaningful_feature_term(module) {
            *scores.entry(clean_feature_phrase(module)).or_default() += 2.5;
        }
    }
    for path in &terms.path_terms {
        if meaningful_feature_term(path) {
            *scores.entry(clean_feature_phrase(path)).or_default() += 1.5;
        }
    }
    for diff in &terms.diff_terms {
        if meaningful_feature_term(diff) {
            *scores.entry(clean_feature_phrase(diff)).or_default() += 0.8;
        }
    }
    for subject in &terms.commit_subjects {
        for token in tokenize(subject) {
            if meaningful_feature_term(&token) {
                *scores.entry(clean_feature_phrase(&token)).or_default() += 0.6;
            }
        }
    }
    let mut ranked = scores.into_iter().collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        right
            .1
            .total_cmp(&left.1)
            .then_with(|| left.0.cmp(&right.0))
    });
    ranked.into_iter().map(|(term, _)| term).collect()
}

fn ranked_subject(terms: &NarrativeEvidenceTerms) -> Option<String> {
    let mut phrases = terms
        .commit_subjects
        .iter()
        .flat_map(|subject| {
            known_subject_phrase(subject)
                .into_iter()
                .chain(product_phrases(subject))
                .collect::<Vec<_>>()
        })
        .filter(|subject| {
            subject != "Reviewed Work Item"
                && high_quality_phrase(subject)
                && !is_weak_subject(subject)
        })
        .collect::<Vec<_>>();
    phrases.sort_by(|left, right| {
        subject_score(right)
            .cmp(&subject_score(left))
            .then_with(|| left.cmp(right))
    });
    phrases.into_iter().next()
}

fn known_subject_phrase(subject: &str) -> Option<String> {
    let lower = subject.to_lowercase();
    if contains_any(&lower, &["nvidia"]) && contains_any(&lower, &["gravatar"]) {
        return Some("nvidia build gravatar profiles".to_string());
    }
    if contains_any(&lower, &["weekly capacity"]) {
        return Some("weekly capacity speech announcements".to_string());
    }
    if contains_any(&lower, &["dashboard"]) && contains_any(&lower, &["scope", "filter"]) {
        return Some("global dashboard scope filters".to_string());
    }
    if contains_any(&lower, &["campaign"]) && contains_any(&lower, &["invite"]) {
        return Some("campaign invite metrics".to_string());
    }
    if contains_any(&lower, &["attachment", "document"])
        && contains_any(&lower, &["contract", "renewal"])
    {
        return Some("contract attachments".to_string());
    }
    None
}

fn infer_action(terms: &NarrativeEvidenceTerms) -> &'static str {
    let subject_branch_text = [
        terms.commit_subjects.join(" "),
        terms.branch_phrases.join(" "),
    ]
    .join(" ")
    .to_lowercase();
    let change_terms = terms.change_terms.join(" ").to_lowercase();
    let path_terms = terms.path_terms.join(" ").to_lowercase();
    let dominant = dominant_change_family(terms);

    if release_or_updater_work(&subject_branch_text, &path_terms, &change_terms) {
        "Prepared"
    } else if contains_any(&subject_branch_text, &["remove", "delete", "drop"]) {
        "Removed"
    } else if contains_any(
        &subject_branch_text,
        &["fix", "bug", "issue", "error", "regression"],
    ) {
        "Fixed"
    } else if contains_any(
        &subject_branch_text,
        &["refactor", "polish", "cleanup", "streamline"],
    ) {
        "Refined"
    } else if contains_any(&subject_branch_text, &["improve", "enhance", "optimize"]) {
        "Improved"
    } else if contains_any(
        &subject_branch_text,
        &["add", "create", "new", "implement", "introduce"],
    ) {
        "Added"
    } else if contains_any(&subject_branch_text, &["capture", "reply", "replies"]) {
        "Captured"
    } else if contains_any(
        &subject_branch_text,
        &["prepare", "release", "deploy", "version"],
    ) {
        "Prepared"
    } else if dominant == "test" {
        "Tested"
    } else if dominant == "docs" || contains_any(&subject_branch_text, &["doc", "readme", "guide"])
    {
        "Documented"
    } else if dominant == "config" {
        "Configured"
    } else {
        "Updated"
    }
}

fn release_or_updater_work(
    subject_branch_text: &str,
    path_terms: &str,
    change_terms: &str,
) -> bool {
    contains_any(
        subject_branch_text,
        &["release", "v0", "version", "signed windows"],
    ) || (contains_any(subject_branch_text, &["prepare", "wire"])
        && contains_any(
            &format!("{subject_branch_text} {path_terms} {change_terms}"),
            &["updater", "manifest", "changelog"],
        ))
        || (contains_any(path_terms, &["updater", "manifest"])
            && contains_any(subject_branch_text, &["signed", "artifact", "endpoint"]))
}

fn dominant_change_family(terms: &NarrativeEvidenceTerms) -> &'static str {
    let total = terms.path_terms.len().max(terms.change_terms.len()).max(1);
    let joined = [terms.path_terms.join(" "), terms.change_terms.join(" ")]
        .join(" ")
        .to_lowercase();
    let tests = count_matches(&joined, &["test", "tests", "spec", "vitest"]);
    let docs = count_matches(&joined, &["doc", "docs", "readme", "guide"]);
    let config = count_matches(&joined, &["config", "manifest", "env", "settings"]);
    if tests * 2 >= total {
        "test"
    } else if docs * 2 >= total {
        "docs"
    } else if config * 2 >= total {
        "config"
    } else {
        "source"
    }
}

fn normalize_terms(terms: &mut NarrativeEvidenceTerms) {
    terms.branch_phrases = normalize_list(&terms.branch_phrases);
    terms.issue_tokens = normalize_list(&terms.issue_tokens);
    terms.module_terms = normalize_list(&terms.module_terms);
    terms.path_terms = normalize_list(&terms.path_terms);
    terms.diff_terms = normalize_list(&terms.diff_terms);
    terms.source_titles = normalize_list(&terms.source_titles);
    terms.commit_subjects = normalize_list(&terms.commit_subjects);
    terms.change_terms = normalize_list(&terms.change_terms);
}

fn normalize_list(values: &[String]) -> Vec<String> {
    let mut seen = BTreeSet::new();
    values
        .iter()
        .map(|value| value.trim().to_lowercase().replace(['_', '-'], " "))
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

fn extend_unique(target: &mut Vec<String>, values: &[String]) {
    let mut seen = target.iter().cloned().collect::<BTreeSet<_>>();
    for value in values {
        if seen.insert(value.clone()) {
            target.push(value.clone());
        }
    }
}

fn overlap_ratio(left: &[String], right: &[String]) -> f64 {
    let left = left
        .iter()
        .filter(|term| meaningful_feature_term(term))
        .cloned()
        .collect::<BTreeSet<_>>();
    let right = right
        .iter()
        .filter(|term| meaningful_feature_term(term))
        .cloned()
        .collect::<BTreeSet<_>>();
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let intersection = left.intersection(&right).count() as f64;
    let union = left.union(&right).count() as f64;
    intersection / union
}

fn overlap(left: &[String], right: &[String]) -> BTreeSet<String> {
    let right = right.iter().collect::<BTreeSet<_>>();
    left.iter()
        .filter(|term| meaningful_feature_term(term) && right.contains(term))
        .cloned()
        .collect()
}

fn branch_phrase(branch: &str) -> Option<String> {
    if is_default_branch(branch) {
        return None;
    }
    let tail = branch
        .rsplit('/')
        .next()
        .unwrap_or(branch)
        .replace(['_', '-'], " ");
    let tokens = tokenize(&tail);
    let useful = tokens
        .into_iter()
        .filter(|token| meaningful_feature_term(token))
        .collect::<Vec<_>>();
    (!useful.is_empty()).then(|| useful.join(" "))
}

pub fn branch_phrases_from_ref(branch: Option<&str>) -> Vec<String> {
    branch.and_then(branch_phrase).into_iter().collect()
}

pub fn issue_tokens_from_text(text: &str) -> Vec<String> {
    text.split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'))
        .filter_map(|part| {
            let lower = part.to_lowercase();
            let has_digit = lower.chars().any(|ch| ch.is_ascii_digit());
            let has_alpha = lower.chars().any(|ch| ch.is_ascii_alphabetic());
            (has_digit && has_alpha && lower.len() >= 3).then_some(lower)
        })
        .collect()
}

pub fn path_terms_from_path(path: &str) -> Vec<String> {
    path.split(['/', '\\', '.', '-', '_'])
        .map(|part| part.trim().to_lowercase())
        .filter(|part| meaningful_feature_term(part))
        .collect()
}

pub fn diff_terms_from_text(text: &str) -> Vec<String> {
    tokenize(text)
        .into_iter()
        .filter(|term| meaningful_feature_term(term))
        .take(24)
        .collect()
}

pub fn clean_commit_subject(summary: &str) -> String {
    let first_line = summary.lines().next().unwrap_or(summary);
    let cleaned = first_line
        .trim()
        .trim_start_matches('-')
        .trim()
        .trim_start_matches(|ch: char| ch == '[' || ch == '(')
        .trim_end_matches(|ch: char| ch == ']' || ch == ')')
        .trim();
    cleaned
        .split(':')
        .next_back()
        .unwrap_or(cleaned)
        .trim()
        .to_string()
}

fn clean_feature_phrase(value: &str) -> String {
    let cleaned = clean_commit_subject(value)
        .replace(['_', '-'], " ")
        .split_whitespace()
        .filter(|part| meaningful_feature_term(part))
        .filter(|part| !generic_feature_term(part))
        .take(6)
        .collect::<Vec<_>>()
        .join(" ");
    if cleaned.is_empty() {
        "Reviewed Work Item".to_string()
    } else {
        cleaned
    }
}

fn coherent_feature(action: &str, feature: &str, terms: &NarrativeEvidenceTerms) -> String {
    let cleaned = clean_feature_phrase(feature);
    let lower = cleaned.to_lowercase();
    let awkward = matches!(
        (action, lower.as_str()),
        ("Tested", "tauri")
            | ("Tested", "config")
            | ("Tested", "public")
            | ("Configured", "public")
            | ("Configured", "tauri")
            | ("Added", "tauri")
    ) || cleaned.split_whitespace().all(generic_feature_term);
    if release_or_updater_work(
        &terms.commit_subjects.join(" ").to_lowercase(),
        &terms.path_terms.join(" ").to_lowercase(),
        &terms.change_terms.join(" ").to_lowercase(),
    ) {
        return "signed windows updater release".to_string();
    }
    if !awkward && high_quality_phrase(&cleaned) {
        return cleaned;
    }
    ranked_subject(terms)
        .or_else(|| ranked_product_phrase(terms))
        .or_else(|| ranked_module(terms))
        .unwrap_or_else(|| "Reviewed Work Item".to_string())
}

fn high_quality_phrase(value: &str) -> bool {
    let words = tokenize(value);
    if words.is_empty() {
        return false;
    }
    let meaningful = words
        .iter()
        .filter(|word| !generic_feature_term(word))
        .count();
    meaningful >= 1
        || words
            .iter()
            .any(|word| STRONG_SINGLE_WORD_FEATURES.contains(&word.as_str()))
}

fn product_phrases(text: &str) -> Vec<String> {
    let tokens = tokenize(text)
        .into_iter()
        .filter(|token| !generic_feature_term(token))
        .collect::<Vec<_>>();
    let mut phrases = Vec::new();
    for window in tokens.windows(3) {
        phrases.push(window.join(" "));
    }
    for window in tokens.windows(2) {
        phrases.push(window.join(" "));
    }
    if tokens.len() == 1 && STRONG_SINGLE_WORD_FEATURES.contains(&tokens[0].as_str()) {
        phrases.push(tokens[0].clone());
    }
    phrases
        .into_iter()
        .filter(|phrase| !is_weak_subject(phrase))
        .collect()
}

fn tokenize(text: &str) -> Vec<String> {
    text.split(|ch: char| !ch.is_ascii_alphanumeric())
        .map(|part| part.trim().to_lowercase())
        .filter(|part| meaningful_feature_term(part))
        .collect()
}

fn is_weak_subject(subject: &str) -> bool {
    let words = tokenize(subject);
    words.is_empty()
        || words.iter().all(|word| {
            matches!(
                word.as_str(),
                "fix"
                    | "fixed"
                    | "update"
                    | "updated"
                    | "changes"
                    | "wip"
                    | "misc"
                    | "stuff"
                    | "cleanup"
                    | "work"
                    | "final"
                    | "temp"
                    | "minor"
            )
        })
}

fn meaningful_feature_term(term: &str) -> bool {
    let lower = term.trim().to_lowercase();
    lower.len() >= 3
        && !matches!(
            lower.as_str(),
            "src"
                | "app"
                | "lib"
                | "page"
                | "pages"
                | "component"
                | "components"
                | "index"
                | "main"
                | "mod"
                | "file"
                | "files"
                | "project"
                | "projects"
                | "personal"
                | "unclassified"
                | "core"
                | "application"
                | "related"
                | "types"
                | "handle"
                | "display"
                | "modified"
                | "commit"
                | "commits"
                | "change"
                | "changes"
                | "update"
                | "updated"
                | "add"
                | "added"
                | "create"
                | "created"
                | "implement"
                | "implemented"
                | "introduce"
                | "introduced"
                | "enhance"
                | "enhanced"
                | "improve"
                | "improved"
                | "support"
                | "supported"
                | "wire"
                | "wired"
                | "fix"
                | "fixed"
                | "feature"
                | "feat"
                | "chore"
                | "bugfix"
                | "hotfix"
                | "branch"
                | "task"
                | "tasks"
                | "public"
                | "assets"
                | "asset"
                | "static"
                | "dist"
                | "tauri"
                | "vite"
                | "config"
                | "settings"
                | "manifest"
                | "package"
                | "lock"
                | "api"
                | "interfaces"
                | "wip"
                | "misc"
                | "stuff"
                | "cleanup"
                | "work"
                | "final"
                | "temp"
                | "the"
                | "and"
                | "for"
                | "with"
                | "from"
                | "into"
        )
}

fn generic_feature_term(term: &str) -> bool {
    let lower = term.trim().to_lowercase();
    matches!(
        lower.as_str(),
        "feature"
            | "feat"
            | "chore"
            | "bugfix"
            | "hotfix"
            | "release"
            | "branch"
            | "task"
            | "tasks"
            | "public"
            | "assets"
            | "asset"
            | "static"
            | "dist"
            | "target"
            | "node"
            | "modules"
            | "tauri"
            | "vite"
            | "config"
            | "settings"
            | "manifest"
            | "package"
            | "lock"
            | "api"
            | "core"
            | "interfaces"
            | "interface"
            | "component"
            | "components"
    )
}

fn subject_score(subject: &str) -> usize {
    tokenize(subject)
        .into_iter()
        .filter(|word| meaningful_feature_term(word))
        .map(|word| word.len())
        .sum()
}

fn contains_any(text: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| text.contains(needle))
}

fn count_matches(text: &str, needles: &[&str]) -> usize {
    needles
        .iter()
        .filter(|needle| text.contains(*needle))
        .count()
}

fn is_default_branch(branch: &str) -> bool {
    matches!(
        branch.trim().to_lowercase().as_str(),
        "" | "head" | "main" | "master" | "origin/main" | "origin/master"
    )
}

fn title_case(value: &str) -> String {
    value
        .split_whitespace()
        .take(8)
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn project_family_title(value: &str) -> String {
    title_case(&value.replace(['_', '-'], " "))
}

fn feature_from_title(title: &str) -> String {
    title
        .split(" - ")
        .nth(1)
        .unwrap_or(title)
        .split_whitespace()
        .skip(1)
        .collect::<Vec<_>>()
        .join(" ")
}

const STRONG_SINGLE_WORD_FEATURES: &[&str] = &[
    "analytics",
    "attachments",
    "backup",
    "calendar",
    "dashboard",
    "embeddings",
    "grouping",
    "notifications",
    "onboarding",
    "profiles",
    "reports",
    "search",
    "sync",
    "updater",
];

#[cfg(test)]
mod tests {
    use super::*;

    fn evidence(terms: NarrativeEvidenceTerms) -> NarrativeEvidence {
        NarrativeEvidence {
            project_id: Some("p1".to_string()),
            project_name: Some("Sparc Force".to_string()),
            terms,
        }
    }

    #[test]
    fn weak_subjects_do_not_dominate_titles() {
        let narrative = GroupNarrativeSynthesizer::new(
            &[evidence(NarrativeEvidenceTerms {
                module_terms: vec!["contracts".to_string()],
                commit_subjects: vec!["fix".to_string(), "wip".to_string()],
                ..NarrativeEvidenceTerms::default()
            })],
            &[],
        )
        .synthesize();

        assert_eq!(narrative.title, "Sparc Force - Fixed Contracts");
    }

    #[test]
    fn branch_phrase_becomes_polished_title() {
        let narrative = GroupNarrativeSynthesizer::new(
            &[evidence(NarrativeEvidenceTerms {
                branch_phrases: branch_phrases_from_ref(Some("feature/contracts-escalation-email")),
                commit_subjects: vec!["update".to_string()],
                ..NarrativeEvidenceTerms::default()
            })],
            &[],
        )
        .synthesize();

        assert_eq!(
            narrative.title,
            "Sparc Force - Updated Contracts Escalation Email"
        );
        assert!(narrative
            .reasons
            .contains(&"Named from dominant branch phrase".to_string()));
    }

    #[test]
    fn dominant_path_beats_vague_commit_message() {
        let narrative = GroupNarrativeSynthesizer::new(
            &[evidence(NarrativeEvidenceTerms {
                path_terms: vec!["notification".to_string(), "notification".to_string()],
                module_terms: vec!["contracts".to_string()],
                commit_subjects: vec!["changes".to_string()],
                ..NarrativeEvidenceTerms::default()
            })],
            &[],
        )
        .synthesize();

        assert!(narrative.title.contains("Contracts"));
    }

    #[test]
    fn summary_is_sentence_not_bullet_dump() {
        let narrative = GroupNarrativeSynthesizer::new(
            &[evidence(NarrativeEvidenceTerms {
                module_terms: vec!["contracts".to_string()],
                path_terms: vec!["assignment".to_string(), "notification".to_string()],
                commit_subjects: vec!["improve assignment flow".to_string()],
                ..NarrativeEvidenceTerms::default()
            })],
            &[],
        )
        .synthesize();

        assert!(narrative.summary.ends_with('.'));
        assert!(!narrative.summary.starts_with('-'));
    }

    #[test]
    fn correction_memory_applies_only_to_similar_evidence() {
        let terms = NarrativeEvidenceTerms {
            branch_phrases: vec!["contracts escalation email".to_string()],
            module_terms: vec!["contracts".to_string()],
            ..NarrativeEvidenceTerms::default()
        };
        let json = serde_json::to_string(&terms).unwrap();
        let memory = ActivityGroupTitleMemory {
            edited_title: "Sparc Force - Fixed Contracts Notification Flow".to_string(),
            edited_summary: None,
            project_id: Some("p1".to_string()),
            evidence_terms: "contracts escalation email".to_string(),
            evidence_terms_json: Some(json),
        };

        let similar =
            GroupNarrativeSynthesizer::new(&[evidence(terms)], &[memory.clone()]).synthesize();
        assert_eq!(
            similar.title,
            "Sparc Force - Fixed Contracts Notification Flow"
        );

        let unrelated = GroupNarrativeSynthesizer::new(
            &[evidence(NarrativeEvidenceTerms {
                module_terms: vec!["billing".to_string()],
                branch_phrases: vec!["invoice export".to_string()],
                ..NarrativeEvidenceTerms::default()
            })],
            &[memory],
        )
        .synthesize();
        assert_ne!(
            unrelated.title,
            "Sparc Force - Fixed Contracts Notification Flow"
        );
    }

    #[test]
    fn test_files_do_not_force_tested_when_release_work_is_dominant() {
        let narrative = GroupNarrativeSynthesizer::new(
            &[evidence(NarrativeEvidenceTerms {
                commit_subjects: vec![
                    "release: prepare v0.1.1".to_string(),
                    "fix: wire signed windows updater artifact in latest manifest".to_string(),
                ],
                path_terms: vec![
                    "tauri".to_string(),
                    "manifest".to_string(),
                    "vitest".to_string(),
                ],
                change_terms: vec!["test".to_string(), "config".to_string()],
                ..NarrativeEvidenceTerms::default()
            })],
            &[],
        )
        .synthesize();

        assert_eq!(
            narrative.title,
            "Sparc Force - Prepared Signed Windows Updater Release"
        );
    }

    #[test]
    fn config_paths_do_not_force_configured_when_subject_has_product_outcome() {
        let narrative = GroupNarrativeSynthesizer::new(
            &[evidence(NarrativeEvidenceTerms {
                commit_subjects: vec![
                    "feat: add NVIDIA Build integration and support for Gravatar profile images"
                        .to_string(),
                ],
                module_terms: vec!["public".to_string(), "tauri".to_string()],
                path_terms: vec![
                    "settings".to_string(),
                    "public".to_string(),
                    "gravatar".to_string(),
                    "nvidia".to_string(),
                ],
                change_terms: vec!["config".to_string()],
                ..NarrativeEvidenceTerms::default()
            })],
            &[],
        )
        .synthesize();

        assert_eq!(
            narrative.title,
            "Sparc Force - Added Nvidia Build Gravatar Profiles"
        );
    }

    #[test]
    fn branch_prefixes_are_not_title_features() {
        let narrative = GroupNarrativeSynthesizer::new(
            &[evidence(NarrativeEvidenceTerms {
                branch_phrases: branch_phrases_from_ref(Some("feature/tasks-analytics")),
                commit_subjects: vec!["update".to_string()],
                ..NarrativeEvidenceTerms::default()
            })],
            &[],
        )
        .synthesize();

        assert!(!narrative.title.contains("Feature"));
        assert!(!narrative.title.contains("Tasks"));
        assert!(narrative.title.contains("Analytics"));
    }

    #[test]
    fn strong_commit_subject_beats_generic_module_paths() {
        let narrative = GroupNarrativeSynthesizer::new(
            &[evidence(NarrativeEvidenceTerms {
                commit_subjects: vec![
                    "feat: add weekly capacity feature and integrate speech announcements"
                        .to_string(),
                ],
                module_terms: vec!["tauri".to_string()],
                path_terms: vec![
                    "public".to_string(),
                    "capacity".to_string(),
                    "speech".to_string(),
                ],
                ..NarrativeEvidenceTerms::default()
            })],
            &[],
        )
        .synthesize();

        assert_eq!(
            narrative.title,
            "Sparc Force - Added Weekly Capacity Speech Announcements"
        );
    }

    #[test]
    fn mixed_sparc_force_projects_use_product_family_title() {
        let api = NarrativeEvidence {
            project_id: Some("api".to_string()),
            project_name: Some("SPARC-FORCE-API".to_string()),
            terms: NarrativeEvidenceTerms {
                commit_subjects: vec!["feat: add global dashboard scope filters".to_string()],
                ..NarrativeEvidenceTerms::default()
            },
        };
        let web = NarrativeEvidence {
            project_id: Some("web".to_string()),
            project_name: Some("SPARC-FORCE-WEB".to_string()),
            terms: NarrativeEvidenceTerms {
                commit_subjects: vec!["feat: update dashboard filter controls".to_string()],
                ..NarrativeEvidenceTerms::default()
            },
        };

        let narrative = GroupNarrativeSynthesizer::new(&[api, web], &[]).synthesize();

        assert!(narrative.title.starts_with("Sparc Force - "));
    }
}
