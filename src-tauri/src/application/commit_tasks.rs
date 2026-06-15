use std::collections::BTreeSet;

use crate::domain::activity::ActivityItem;
use crate::domain::activity_group::ActivityGroup;
use crate::domain::commit_task::{
    CommitTaskDescriptionSection, CommitTaskDraftResponse, CommitTaskEvidenceSummary,
    CommitTaskGroupContext, CommitTaskTitleCandidate, CreateWeeklyTaskFromCommitInput,
    CreateWeeklyTaskFromCommitOutcome, PreviewCommitTaskDraftInput, WeeklyTaskSourceLink,
};
use crate::domain::git_metadata::{CommitDiffSnippet, CommitFileChange};
use crate::domain::weekly_task::{
    CreateWeeklyTaskInput, WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType,
};
use crate::infrastructure::database::repositories::{
    ActivityGroupRepository, ActivityRepository, GitMetadataRepository, WeeklyTaskRepository,
    WeeklyTaskSourceLinkRepository,
};

pub struct CommitTaskService;

impl CommitTaskService {
    pub async fn preview(
        activity_repository: &ActivityRepository<'_>,
        group_repository: &ActivityGroupRepository<'_>,
        git_repository: &GitMetadataRepository<'_>,
        link_repository: &WeeklyTaskSourceLinkRepository<'_>,
        weekly_task_repository: &WeeklyTaskRepository<'_>,
        input: PreviewCommitTaskDraftInput,
    ) -> Result<CommitTaskDraftResponse, CommitTaskServiceError> {
        validate_id(&input.activity_id, "Activity id")?;
        if input.week_start_date.trim().is_empty() {
            return Err(CommitTaskServiceError::Validation(
                "Week start date is required".to_string(),
            ));
        }

        let commit = activity_repository
            .find_commit_activity(&input.activity_id)
            .await
            .map_err(CommitTaskServiceError::Database)?
            .ok_or_else(|| CommitTaskServiceError::NotFound("Commit was not found".to_string()))?;
        let project_id = commit.project_id.clone().ok_or_else(|| {
            CommitTaskServiceError::Validation("Commit is missing project context".to_string())
        })?;
        let commit_hash = commit.commit_hash.clone().ok_or_else(|| {
            CommitTaskServiceError::Validation("Commit is missing its hash".to_string())
        })?;

        let existing_task = match link_repository
            .find_by_commit(&project_id, &commit_hash)
            .await
            .map_err(CommitTaskServiceError::Database)?
        {
            Some(link) => weekly_task_repository
                .find(&link.weekly_task_id)
                .await
                .map_err(CommitTaskServiceError::Database)?,
            None => None,
        };
        let group_context = group_repository
            .find_containing_activity("commit", &commit.id)
            .await
            .map_err(CommitTaskServiceError::Database)?;

        let hashes = vec![commit_hash.clone()];
        let changes = git_repository
            .list_file_changes_for_commits(&project_id, &hashes)
            .await
            .map_err(CommitTaskServiceError::Database)?;
        let snippets = git_repository
            .list_diff_snippets_for_commits(&project_id, &hashes)
            .await
            .map_err(CommitTaskServiceError::Database)?;
        let synthesized = CommitTaskSynthesizer::new(
            &commit,
            group_context.as_ref(),
            &changes,
            &snippets,
            &input.week_start_date,
        )
        .synthesize();

        Ok(CommitTaskDraftResponse {
            existing_task,
            draft: synthesized.draft,
            confidence: synthesized.confidence,
            confidence_label: synthesized.confidence_label,
            rationale: synthesized.rationale,
            evidence: synthesized.evidence,
            title_candidates: synthesized.title_candidates,
            selected_title_strategy: synthesized.selected_title_strategy,
            description_sections: synthesized.description_sections,
            quality_warnings: synthesized.quality_warnings,
            group_context: synthesized.group_context,
        })
    }

    pub async fn create(
        activity_repository: &ActivityRepository<'_>,
        link_repository: &WeeklyTaskSourceLinkRepository<'_>,
        weekly_task_repository: &WeeklyTaskRepository<'_>,
        input: CreateWeeklyTaskFromCommitInput,
    ) -> Result<CreateWeeklyTaskFromCommitOutcome, CommitTaskServiceError> {
        validate_id(&input.activity_id, "Activity id")?;
        let commit = activity_repository
            .find_commit_activity(&input.activity_id)
            .await
            .map_err(CommitTaskServiceError::Database)?
            .ok_or_else(|| CommitTaskServiceError::NotFound("Commit was not found".to_string()))?;
        let project_id = commit.project_id.clone().ok_or_else(|| {
            CommitTaskServiceError::Validation("Commit is missing project context".to_string())
        })?;
        let commit_hash = commit.commit_hash.clone().ok_or_else(|| {
            CommitTaskServiceError::Validation("Commit is missing its hash".to_string())
        })?;

        if let Some(link) = link_repository
            .find_by_commit(&project_id, &commit_hash)
            .await
            .map_err(CommitTaskServiceError::Database)?
        {
            if let Some(task) = weekly_task_repository
                .find(&link.weekly_task_id)
                .await
                .map_err(CommitTaskServiceError::Database)?
            {
                return Ok(CreateWeeklyTaskFromCommitOutcome {
                    task,
                    already_created: true,
                });
            }
        }

        let task = weekly_task_repository
            .create(input.task.clone())
            .await
            .map_err(CommitTaskServiceError::Database)?;
        let rationale_json = input
            .rationale
            .as_ref()
            .and_then(|rationale| serde_json::to_string(rationale).ok());
        link_repository
            .create(&WeeklyTaskSourceLink {
                id: String::new(),
                weekly_task_id: task.id.clone(),
                source_type: "commit".to_string(),
                project_id,
                commit_hash,
                activity_id: commit.id.clone(),
                summary_snapshot: commit.summary.clone(),
                confidence: input.confidence,
                confidence_label: input.confidence_label,
                rationale_json,
                created_at: String::new(),
                updated_at: String::new(),
            })
            .await
            .map_err(CommitTaskServiceError::Database)?;

        Ok(CreateWeeklyTaskFromCommitOutcome {
            task,
            already_created: false,
        })
    }
}

struct SynthesizedCommitTask {
    draft: CreateWeeklyTaskInput,
    confidence: f64,
    confidence_label: String,
    rationale: Vec<String>,
    evidence: CommitTaskEvidenceSummary,
    title_candidates: Vec<CommitTaskTitleCandidate>,
    selected_title_strategy: String,
    description_sections: Vec<CommitTaskDescriptionSection>,
    quality_warnings: Vec<String>,
    group_context: Option<CommitTaskGroupContext>,
}

struct CommitTaskSynthesizer<'a> {
    commit: &'a ActivityItem,
    group: Option<&'a ActivityGroup>,
    changes: &'a [CommitFileChange],
    snippets: &'a [CommitDiffSnippet],
    week_start_date: &'a str,
}

impl<'a> CommitTaskSynthesizer<'a> {
    fn new(
        commit: &'a ActivityItem,
        group: Option<&'a ActivityGroup>,
        changes: &'a [CommitFileChange],
        snippets: &'a [CommitDiffSnippet],
        week_start_date: &'a str,
    ) -> Self {
        Self {
            commit,
            group,
            changes,
            snippets,
            week_start_date,
        }
    }

    fn synthesize(&self) -> SynthesizedCommitTask {
        let subject = clean_commit_subject(&self.commit.summary);
        let modules = self.modules();
        let change_types = self.change_types();
        let evidence_text = self.evidence_text(&subject);
        let follow_up = is_follow_up_work(&evidence_text);
        let release_review = release_review_work(&evidence_text);
        let test_risk = test_risk_work(&evidence_text, &change_types);
        let generated_heavy = !self.changes.is_empty()
            && self
                .changes
                .iter()
                .filter(|change| change.is_generated)
                .count()
                * 2
                >= self.changes.len();

        let feature = task_feature(
            &subject,
            &modules,
            self.commit.branch.as_deref(),
            self.group,
        );
        let action = task_action(&evidence_text, &change_types, follow_up);
        let title_candidates = CommitTaskNarrativeSynthesizer::new(
            &subject,
            action,
            &feature,
            &modules,
            &change_types,
            &evidence_text,
            self.group,
            self.commit.branch.as_deref(),
        )
        .title_candidates();
        let selected_title = title_candidates
            .first()
            .map(|candidate| candidate.title.clone())
            .unwrap_or_else(|| title_case_first(&format!("{action} {feature}")));
        let selected_title_strategy = title_candidates
            .first()
            .map(|candidate| candidate.strategy.clone())
            .unwrap_or_else(|| "fallback".to_string());

        let mut confidence: f64 = 0.62;
        let mut rationale =
            vec!["Used local commit subject as the primary task signal".to_string()];
        if !modules.is_empty() {
            confidence += 0.10;
            rationale.push("Used changed module/path evidence".to_string());
        }
        if self
            .commit
            .branch
            .as_deref()
            .is_some_and(strong_branch_phrase)
        {
            confidence += 0.10;
            rationale.push("Used non-default branch context".to_string());
        }
        if !self.snippets.is_empty() {
            confidence += 0.08;
            rationale.push("Used bounded local diff snippets for task intent".to_string());
        }
        if follow_up || release_review || test_risk {
            confidence += 0.05;
            rationale.push("Detected review, release, or follow-up language in commit evidence".to_string());
        }
        if self.group.is_some() {
            confidence += 0.12;
            rationale.push("Used containing smart activity group as context".to_string());
        }
        if generated_heavy {
            confidence -= 0.18;
            rationale
                .push("Lowered confidence because evidence is generated-file heavy".to_string());
        }
        if subject.split_whitespace().count() <= 2 {
            confidence -= 0.12;
            rationale.push("Lowered confidence because the commit subject is terse".to_string());
        }
        confidence = confidence.clamp(0.20, 0.95);
        let confidence_label = if confidence >= 0.78 {
            "strong"
        } else if confidence >= 0.58 {
            "likely"
        } else {
            "needs_review"
        }
        .to_string();

        let commit_date = self.commit.occurred_at.chars().take(10).collect::<String>();
        let description_sections = self.description_sections(
            &subject,
            &selected_title,
            &modules,
            &change_types,
            follow_up || release_review || test_risk,
        );
        let details = description_sections
            .iter()
            .map(|section| format!("{}: {}", section.label, section.body))
            .collect::<Vec<_>>()
            .join("\n\n");
        let quality_warnings = quality_warnings(&selected_title, &subject, generated_heavy, &modules);
        let draft = CreateWeeklyTaskInput {
            project_id: self.commit.project_id.clone(),
            task_type: if follow_up || release_review || test_risk {
                WeeklyTaskType::FollowUp
            } else {
                WeeklyTaskType::CompletedChecklist
            },
            status: Some(if follow_up || release_review || test_risk {
                WeeklyTaskStatus::Todo
            } else {
                WeeklyTaskStatus::Completed
            }),
            title: selected_title,
            details: Some(details),
            week_start_date: self.week_start_date.to_string(),
            target_date: (follow_up || release_review || test_risk).then_some(commit_date.clone()),
            completed_at: (!(follow_up || release_review || test_risk)).then_some(commit_date),
            priority: Some(if release_review || test_risk {
                WeeklyTaskPriority::High
            } else {
                WeeklyTaskPriority::Normal
            }),
            included_in_report: Some(true),
            progress_percent: None,
            estimated_minutes: None,
        };

        SynthesizedCommitTask {
            draft,
            confidence,
            confidence_label,
            rationale,
            evidence: CommitTaskEvidenceSummary {
                activity_id: self.commit.id.clone(),
                project_id: self.commit.project_id.clone().unwrap_or_default(),
                project_name: self.commit.project_name.clone(),
                commit_hash: self.commit.commit_hash.clone().unwrap_or_default(),
                subject,
                branch: self.commit.branch.clone(),
                modules,
                change_types,
                occurred_at: self.commit.occurred_at.clone(),
            },
            title_candidates,
            selected_title_strategy,
            description_sections,
            quality_warnings,
            group_context: self.group.map(group_context_from_group),
        }
    }

    fn description_sections(
        &self,
        subject: &str,
        selected_title: &str,
        modules: &[String],
        change_types: &[String],
        needs_follow_up: bool,
    ) -> Vec<CommitTaskDescriptionSection> {
        let mut sections = Vec::new();
        let group_summary = self
            .group
            .and_then(|group| group.report_summary.as_deref().or(group.summary.as_deref()));
        sections.push(CommitTaskDescriptionSection {
            label: "What changed".to_string(),
            body: group_summary
                .map(|summary| summary.trim().trim_end_matches('.').to_string())
                .filter(|summary| !summary.is_empty())
                .unwrap_or_else(|| format!("{} based on commit evidence", selected_title.trim_end_matches('.'))),
        });
        if let Some(domain) = modules.first().or_else(|| change_types.first()) {
            sections.push(CommitTaskDescriptionSection {
                label: "Why it matters".to_string(),
                body: format!(
                    "Keeps the {} area aligned with the work captured in this commit.",
                    humanize_phrase(domain)
                ),
            });
        }
        let mut evidence = Vec::new();
        evidence.push(format!("commit {}", self.commit.commit_hash.as_deref().map(short_hash).unwrap_or("unknown")));
        if let Some(branch) = self.commit.branch.as_deref().filter(|value| !value.is_empty()) {
            evidence.push(format!("branch {branch}"));
        }
        if let Some(group) = self.group {
            evidence.push(format!("group \"{}\"", group.title));
        }
        if !modules.is_empty() {
            evidence.push(format!("modules {}", modules.join(", ")));
        }
        if !change_types.is_empty() {
            evidence.push(format!("change types {}", change_types.join(", ")));
        }
        sections.push(CommitTaskDescriptionSection {
            label: "Evidence".to_string(),
            body: evidence.join("; "),
        });
        if needs_follow_up {
            sections.push(CommitTaskDescriptionSection {
                label: "Suggested follow-up".to_string(),
                body: follow_up_sentence(subject, self.group),
            });
        }
        sections
    }

    fn modules(&self) -> Vec<String> {
        let mut modules = BTreeSet::new();
        for change in self.changes {
            if let Some(top_level) = change.top_level_dir.as_deref() {
                if meaningful_term(top_level) {
                    modules.insert(top_level.to_string());
                }
            }
            if modules.len() >= 4 {
                break;
            }
        }
        modules.into_iter().collect()
    }

    fn change_types(&self) -> Vec<String> {
        let mut types = BTreeSet::new();
        for change in self.changes {
            if change.is_test {
                types.insert("test".to_string());
            }
            if change.is_docs {
                types.insert("docs".to_string());
            }
            if change.is_config {
                types.insert("config".to_string());
            }
            if change.is_migration {
                types.insert("migration".to_string());
            }
            if change.is_generated {
                types.insert("generated".to_string());
            }
            types.insert(change.change_kind.clone());
        }
        types.into_iter().collect()
    }

    fn evidence_text(&self, subject: &str) -> String {
        let mut text = format!(
            "{} {} {}",
            subject,
            self.commit.summary,
            self.commit.branch.as_deref().unwrap_or("")
        )
        .to_lowercase();
        for snippet in self.snippets.iter().take(4) {
            text.push(' ');
            text.push_str(&snippet.snippet.to_lowercase());
        }
        text
    }
}

struct CommitTaskNarrativeSynthesizer<'a> {
    subject: &'a str,
    action: &'a str,
    feature: &'a str,
    modules: &'a [String],
    change_types: &'a [String],
    evidence_text: &'a str,
    group: Option<&'a ActivityGroup>,
    branch: Option<&'a str>,
}

impl<'a> CommitTaskNarrativeSynthesizer<'a> {
    fn new(
        subject: &'a str,
        action: &'a str,
        feature: &'a str,
        modules: &'a [String],
        change_types: &'a [String],
        evidence_text: &'a str,
        group: Option<&'a ActivityGroup>,
        branch: Option<&'a str>,
    ) -> Self {
        Self {
            subject,
            action,
            feature,
            modules,
            change_types,
            evidence_text,
            group,
            branch,
        }
    }

    fn title_candidates(&self) -> Vec<CommitTaskTitleCandidate> {
        let mut candidates = Vec::new();
        if let Some(group) = self.group {
            candidates.push(self.candidate(
                "group_context",
                task_title_from_group(group, self.action),
                0.86,
                "Candidate from containing smart activity group",
            ));
        }
        if strong_subject(self.subject) {
            candidates.push(self.candidate(
                "commit_subject",
                title_case_first(&format!("{} {}", self.action, self.subject)),
                0.80,
                "Candidate from commit subject",
            ));
        }
        if release_review_work(self.evidence_text) {
            candidates.push(self.candidate(
                "release_pattern",
                "Verify signed Windows updater release".to_string(),
                0.88,
                "Candidate from release/updater evidence",
            ));
        }
        if self.change_types.iter().any(|kind| kind == "test") {
            candidates.push(self.candidate(
                "test_pattern",
                title_case_first(&format!("Test {}", self.feature)),
                0.72,
                "Candidate from test evidence",
            ));
        }
        if self.change_types.iter().any(|kind| kind == "docs") {
            candidates.push(self.candidate(
                "docs_pattern",
                title_case_first(&format!("Document {}", self.feature)),
                0.72,
                "Candidate from documentation evidence",
            ));
        }
        if let Some(branch) = self.branch.filter(|branch| strong_branch_phrase(branch)) {
            candidates.push(self.candidate(
                "branch_phrase",
                title_case_first(&format!(
                    "{} {}",
                    self.action,
                    clean_branch_phrase(branch)
                )),
                0.68,
                "Candidate from branch phrase",
            ));
        }
        if let Some(module) = self.modules.first() {
            candidates.push(self.candidate(
                "module_phrase",
                title_case_first(&format!("{} {} work", self.action, humanize_phrase(module))),
                0.46,
                "Candidate from changed module",
            ));
        }
        candidates.push(self.candidate(
            "fallback",
            title_case_first(&format!("{} {}", self.action, self.feature)),
            0.40,
            "Fallback candidate from available commit evidence",
        ));

        candidates.sort_by(|left, right| {
            right
                .score
                .total_cmp(&left.score)
                .then_with(|| strategy_rank(&right.strategy).cmp(&strategy_rank(&left.strategy)))
                .then_with(|| left.title.cmp(&right.title))
        });
        candidates.dedup_by(|left, right| normalize_title(&left.title) == normalize_title(&right.title));
        candidates.truncate(5);
        candidates
    }

    fn candidate(
        &self,
        strategy: &str,
        title: String,
        base_score: f64,
        reason: &str,
    ) -> CommitTaskTitleCandidate {
        let normalized = normalize_title(&title);
        let words = normalized.split_whitespace().collect::<Vec<_>>();
        let generic_count = words.iter().filter(|word| generic_title_word(word)).count();
        let generic_penalty = if !words.is_empty() && generic_count == words.len() {
            0.34
        } else {
            generic_count as f64 * 0.06
        };
        let too_long_penalty = if words.len() > 12 { 0.12 } else { 0.0 };
        let support_bonus = title_support_score(&normalized, self);
        let strategy_bonus = match strategy {
            "group_context" => 0.12,
            "release_pattern" => 0.10,
            "commit_subject" => 0.08,
            "branch_phrase" => 0.04,
            _ => 0.0,
        };
        let score = (base_score + support_bonus + strategy_bonus - generic_penalty - too_long_penalty)
            .clamp(0.12, 0.98);
        let mut rationale = vec![reason.to_string()];
        if support_bonus > 0.0 {
            rationale.push("Supported by local evidence terms".to_string());
        }
        if generic_penalty > 0.0 {
            rationale.push("Penalized generic or container-heavy wording".to_string());
        }
        CommitTaskTitleCandidate {
            id: format!("{strategy}-{}", stable_title_suffix(&normalized)),
            title,
            strategy: strategy.to_string(),
            score,
            rationale,
        }
    }
}

fn clean_commit_subject(summary: &str) -> String {
    let subject = summary.lines().next().unwrap_or(summary).trim();
    let cleaned = subject
        .split_once(':')
        .and_then(|(prefix, rest)| {
            let normalized = prefix.trim().to_lowercase();
            let known = [
                "feat", "fix", "chore", "docs", "test", "tests", "refactor", "perf", "build", "ci",
                "style", "revert",
            ];
            known
                .iter()
                .any(|kind| normalized == *kind || normalized.starts_with(&format!("{kind}(")))
                .then_some(rest.trim())
        })
        .unwrap_or(subject);
    cleaned.trim_matches(['.', ' ']).to_string()
}

fn is_follow_up_work(text: &str) -> bool {
    [
        "todo",
        "follow up",
        "follow-up",
        "workaround",
        "temporary",
        "verify",
        "review",
        "qa",
        "validate",
        "missing test",
        "needs test",
        "release verification",
        "post-release",
    ]
    .iter()
    .any(|needle| text.contains(needle))
}

fn release_review_work(text: &str) -> bool {
    text.contains("release")
        && (text.contains("verify") || text.contains("manifest") || text.contains("updater"))
}

fn task_action(text: &str, change_types: &[String], follow_up: bool) -> &'static str {
    if follow_up {
        return "Review";
    }
    if text.contains("fix") || text.contains("bug") || text.contains("error") {
        "Fix"
    } else if change_types.iter().any(|kind| kind == "docs") {
        "Document"
    } else if change_types.iter().any(|kind| kind == "test") {
        "Test"
    } else if change_types
        .iter()
        .any(|kind| kind == "config" || kind == "migration")
    {
        "Configure"
    } else if text.contains("refactor") || text.contains("cleanup") {
        "Refine"
    } else {
        "Complete"
    }
}

fn task_feature(
    subject: &str,
    modules: &[String],
    branch: Option<&str>,
    group: Option<&ActivityGroup>,
) -> String {
    if let Some(group) = group {
        if strong_subject(&group.title) {
            return group.title.clone();
        }
    }
    if strong_subject(subject) {
        return subject.to_string();
    }
    if let Some(branch) = branch.filter(|value| strong_branch_phrase(value)) {
        return clean_branch_phrase(branch);
    }
    modules
        .first()
        .map(|module| format!("{} work", humanize_phrase(module)))
        .unwrap_or_else(|| subject.to_string())
}

fn test_risk_work(text: &str, change_types: &[String]) -> bool {
    (text.contains("missing test")
        || text.contains("needs test")
        || text.contains("untested")
        || text.contains("manual qa")
        || text.contains("verify"))
        && !change_types.iter().any(|kind| kind == "test")
}

fn task_title_from_group(group: &ActivityGroup, action: &str) -> String {
    let title = group.title.trim();
    if title.is_empty() {
        return title_case_first(action);
    }
    if title
        .split_whitespace()
        .next()
        .is_some_and(|word| matches_action_word(word))
    {
        title_case_first(title)
    } else {
        title_case_first(&format!("{action} {title}"))
    }
}

fn group_context_from_group(group: &ActivityGroup) -> CommitTaskGroupContext {
    CommitTaskGroupContext {
        group_id: group.id.clone(),
        title: group.title.clone(),
        summary: group.summary.clone(),
        report_summary: group.report_summary.clone(),
        confidence_label: Some(group.confidence_label.clone()),
    }
}

fn strong_subject(value: &str) -> bool {
    let normalized = normalize_title(value);
    let words = normalized.split_whitespace().collect::<Vec<_>>();
    if words.len() < 3 || words.len() > 14 {
        return false;
    }
    let generic_count = words.iter().filter(|word| generic_title_word(word)).count();
    generic_count * 2 < words.len()
}

fn clean_branch_phrase(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("refs/heads/")
        .trim_start_matches("refs/remotes/")
        .trim_start_matches("origin/")
        .replace(['-', '_', '/'], " ")
        .split_whitespace()
        .filter(|part| {
            !matches!(
                part.to_ascii_lowercase().as_str(),
                "feature" | "fix" | "bugfix" | "chore" | "hotfix" | "wip"
            )
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn humanize_phrase(value: &str) -> String {
    value
        .replace(['-', '_', '/', '.'], " ")
        .split_whitespace()
        .filter(|part| meaningful_term(part))
        .collect::<Vec<_>>()
        .join(" ")
}

fn follow_up_sentence(subject: &str, group: Option<&ActivityGroup>) -> String {
    if let Some(group) = group {
        return format!(
            "Review and validate the remaining work around {} before treating the task as complete.",
            group.title
        );
    }
    format!(
        "Review and validate {} before treating the task as complete.",
        subject
    )
}

fn quality_warnings(
    selected_title: &str,
    subject: &str,
    generated_heavy: bool,
    modules: &[String],
) -> Vec<String> {
    let mut warnings = Vec::new();
    if !strong_subject(selected_title) {
        warnings.push("Selected title is weak; review before creating the task".to_string());
    }
    if subject.split_whitespace().count() <= 2 {
        warnings.push("Commit subject is terse, so the draft leans on secondary evidence".to_string());
    }
    if generated_heavy {
        warnings.push("Commit evidence is generated-file heavy".to_string());
    }
    if modules
        .first()
        .is_some_and(|module| normalize_title(selected_title).contains(&normalize_title(module)))
        && selected_title.to_lowercase().ends_with(" work")
    {
        warnings.push("Title is module-heavy and may need a more outcome-focused wording".to_string());
    }
    warnings
}

fn strategy_rank(strategy: &str) -> u8 {
    match strategy {
        "release_pattern" => 7,
        "group_context" => 6,
        "commit_subject" => 5,
        "branch_phrase" => 4,
        "test_pattern" | "docs_pattern" => 3,
        "module_phrase" => 2,
        _ => 1,
    }
}

fn normalize_title(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn generic_title_word(value: &&str) -> bool {
    matches!(
        *value,
        "complete"
            | "fix"
            | "update"
            | "work"
            | "src"
            | "app"
            | "page"
            | "component"
            | "components"
            | "module"
            | "modules"
            | "files"
            | "changes"
            | "misc"
            | "stuff"
    )
}

fn title_support_score(normalized_title: &str, synthesizer: &CommitTaskNarrativeSynthesizer<'_>) -> f64 {
    let evidence = normalize_title(&format!(
        "{} {} {} {} {}",
        synthesizer.subject,
        synthesizer.evidence_text,
        synthesizer.branch.unwrap_or(""),
        synthesizer.modules.join(" "),
        synthesizer
            .group
            .map(|group| group.title.as_str())
            .unwrap_or("")
    ));
    let supported = normalized_title
        .split_whitespace()
        .filter(|word| word.len() > 3 && !generic_title_word(word) && evidence.contains(word))
        .count();
    (supported.min(4) as f64) * 0.035
}

fn stable_title_suffix(normalized_title: &str) -> String {
    let mut hash = 0u32;
    for byte in normalized_title.bytes() {
        hash = hash.wrapping_mul(31).wrapping_add(byte as u32);
    }
    format!("{hash:08x}")
}

fn matches_action_word(value: &str) -> bool {
    matches!(
        value.to_ascii_lowercase().as_str(),
        "add"
            | "build"
            | "complete"
            | "configure"
            | "document"
            | "fix"
            | "implement"
            | "improve"
            | "refine"
            | "review"
            | "test"
            | "verify"
    )
}

fn strong_branch_phrase(value: &str) -> bool {
    let branch = value
        .trim()
        .trim_start_matches("refs/heads/")
        .trim_start_matches("refs/remotes/")
        .trim_start_matches("origin/")
        .to_lowercase();
    !matches!(branch.as_str(), "" | "head" | "main" | "master")
}

fn meaningful_term(value: &str) -> bool {
    let value = value.trim();
    value.len() > 1 && !matches!(value, "." | "src")
}

fn title_case_first(value: &str) -> String {
    let trimmed = value.trim();
    let mut chars = trimmed.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn short_hash(value: &str) -> &str {
    value.get(0..8).unwrap_or(value)
}

fn validate_id(value: &str, label: &str) -> Result<(), CommitTaskServiceError> {
    if value.trim().is_empty() {
        Err(CommitTaskServiceError::Validation(format!(
            "{label} is required"
        )))
    } else {
        Ok(())
    }
}

#[derive(Debug)]
pub enum CommitTaskServiceError {
    Validation(String),
    NotFound(String),
    Database(sqlx::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commit(summary: &str) -> ActivityItem {
        ActivityItem {
            id: "activity_1".to_string(),
            project_id: Some("project_1".to_string()),
            project_name: Some("WorkTrace".to_string()),
            workspace_id: None,
            workspace_name: None,
            workspace_relative_path: None,
            activity_type: "commit".to_string(),
            summary: summary.to_string(),
            occurred_at: "2026-06-10T12:00:00Z".to_string(),
            included_in_report: true,
            commit_hash: Some("1234567890abcdef1234567890abcdef12345678".to_string()),
            author_name: None,
            author_email: None,
            branch: Some("feature/commit-task-drafts".to_string()),
            files_changed: Some(1),
            insertions: Some(10),
            deletions: Some(2),
            refs: Vec::new(),
            worktree: None,
        }
    }

    fn change(path: &str) -> CommitFileChange {
        CommitFileChange {
            project_id: "project_1".to_string(),
            commit_hash: "1234567890abcdef1234567890abcdef12345678".to_string(),
            path: path.to_string(),
            old_path: None,
            change_kind: "modified".to_string(),
            additions: 10,
            deletions: 2,
            is_binary: false,
            language: Some("TypeScript".to_string()),
            top_level_dir: path.split('/').next().map(str::to_string),
            is_test: path.contains("test"),
            is_docs: path.ends_with(".md"),
            is_config: false,
            is_migration: false,
            is_generated: false,
            collected_at: "2026-06-10T12:00:00Z".to_string(),
        }
    }

    fn generated_change(path: &str) -> CommitFileChange {
        CommitFileChange {
            is_generated: true,
            ..change(path)
        }
    }

    fn group(title: &str, report_summary: Option<&str>) -> ActivityGroup {
        ActivityGroup {
            id: "group_1".to_string(),
            project_id: Some("project_1".to_string()),
            project_name: Some("WorkTrace".to_string()),
            workspace_id: None,
            workspace_name: None,
            project_count: 1,
            projects: Vec::new(),
            title: title.to_string(),
            summary: Some("Grouped commit evidence".to_string()),
            start_date: "2026-06-10".to_string(),
            end_date: "2026-06-10".to_string(),
            source: "smart".to_string(),
            confidence: 0.84,
            included_in_report: true,
            fingerprint: None,
            algorithm_version: Some("test".to_string()),
            confidence_label: "strong".to_string(),
            rationale_json: None,
            report_summary: report_summary.map(str::to_string),
            locked: false,
            user_edited_at: None,
            review_status: "accepted".to_string(),
            title_confidence: Some(0.84),
            title_confidence_label: Some("strong".to_string()),
            title_quality_label: Some("specific".to_string()),
            title_strategy: Some("test".to_string()),
            title_rationale_json: None,
            title_candidates_json: None,
            created_at: "2026-06-10T12:00:00Z".to_string(),
            updated_at: "2026-06-10T12:00:00Z".to_string(),
            items: Vec::new(),
        }
    }

    #[test]
    fn feature_commit_creates_completed_checklist_draft() {
        let commit = commit("feat(activity): add commit task drafting");
        let synthesized = CommitTaskSynthesizer::new(
            &commit,
            None,
            &[change("src/pages/ActivityTimelinePage.tsx")],
            &[],
            "2026-06-08",
        )
        .synthesize();

        assert_eq!(
            synthesized.draft.task_type,
            WeeklyTaskType::CompletedChecklist
        );
        assert_eq!(synthesized.draft.status, Some(WeeklyTaskStatus::Completed));
        assert_eq!(
            synthesized.draft.completed_at.as_deref(),
            Some("2026-06-10")
        );
        assert!(synthesized.draft.title.contains("commit task drafting"));
    }

    #[test]
    fn fix_commit_produces_clear_task_wording() {
        let commit = commit("fix(updater): handle missing latest manifest");
        let synthesized = CommitTaskSynthesizer::new(
            &commit,
            None,
            &[change("src-tauri/src/application/app_updates.rs")],
            &[],
            "2026-06-08",
        )
        .synthesize();

        assert!(synthesized.draft.title.starts_with("Fix "));
        assert!(synthesized.draft.title.contains("missing latest manifest"));
    }

    #[test]
    fn follow_up_language_recommends_open_follow_up_task() {
        let commit = commit("chore(release): add release manifest TODO verify updater");
        let synthesized =
            CommitTaskSynthesizer::new(&commit, None, &[change("latest.json")], &[], "2026-06-08")
                .synthesize();

        assert_eq!(synthesized.draft.task_type, WeeklyTaskType::FollowUp);
        assert_eq!(synthesized.draft.status, Some(WeeklyTaskStatus::Todo));
        assert!(synthesized.draft.target_date.is_some());
        assert!(synthesized
            .description_sections
            .iter()
            .any(|section| section.label == "Suggested follow-up"));
    }

    #[test]
    fn group_title_beats_vague_commit_subject() {
        let mut commit = commit("update src");
        commit.branch = Some("main".to_string());
        let group = group(
            "Add commit-to-task smart drafting",
            Some("Created a local-first task drafting flow from selected commits."),
        );
        let synthesized = CommitTaskSynthesizer::new(
            &commit,
            Some(&group),
            &[change("src-tauri/src/application/commit_tasks.rs")],
            &[],
            "2026-06-08",
        )
        .synthesize();

        assert_eq!(synthesized.selected_title_strategy, "group_context");
        assert!(synthesized
            .draft
            .title
            .contains("commit-to-task smart drafting"));
        assert!(synthesized.group_context.is_some());
        assert!(synthesized
            .description_sections
            .iter()
            .any(|section| section.body.contains("local-first task drafting")));
    }

    #[test]
    fn branch_phrase_helps_terse_commit_messages() {
        let commit = commit("wip");
        let synthesized = CommitTaskSynthesizer::new(
            &commit,
            None,
            &[change("src/lib/api/commitTasks.ts")],
            &[],
            "2026-06-08",
        )
        .synthesize();

        assert!(synthesized
            .title_candidates
            .iter()
            .any(|candidate| candidate.strategy == "branch_phrase"));
        assert!(synthesized.draft.title.contains("commit task drafts"));
    }

    #[test]
    fn generated_heavy_evidence_needs_review() {
        let mut commit = commit("update src");
        commit.branch = Some("main".to_string());
        let synthesized = CommitTaskSynthesizer::new(
            &commit,
            None,
            &[
                generated_change("src/generated/api.ts"),
                generated_change("src/generated/types.ts"),
            ],
            &[],
            "2026-06-08",
        )
        .synthesize();

        assert_eq!(synthesized.confidence_label, "needs_review");
        assert!(!synthesized.quality_warnings.is_empty());
    }

    #[test]
    fn clean_subject_beats_generic_module_title() {
        let commit = commit("fix(activity): prevent duplicate linked commit tasks");
        let synthesized = CommitTaskSynthesizer::new(
            &commit,
            None,
            &[change("src/components/ui/CommitTaskReviewModal.tsx")],
            &[],
            "2026-06-08",
        )
        .synthesize();

        assert_eq!(synthesized.selected_title_strategy, "commit_subject");
        assert!(synthesized.draft.title.contains("duplicate linked commit tasks"));
    }
}
