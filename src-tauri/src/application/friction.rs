use std::collections::{BTreeMap, HashMap, HashSet};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use chrono::{Datelike, NaiveDate, NaiveDateTime};

use crate::domain::activity::{ActivityItem, ListActivityInput};
use crate::domain::calendar::ListCalendarEventsInput;
use crate::domain::focus_session::ListFocusSessionsInput;
use serde_json::json;

use crate::domain::friction::{
    FrictionEvidenceItem, FrictionEvidenceSourceType, FrictionInsight, FrictionInsightAction,
    FrictionInsightClaim, FrictionInsightDataHealth, FrictionInsightKind, FrictionInsightMetric,
    FrictionInsightReason, FrictionInsightScope, FrictionInsightSeverity, GetFrictionInsightsInput,
};
use crate::domain::manual_log::{ActivityType, ManualLog};
use crate::domain::weekly_task::{ListWeeklyTasksInput, WeeklyTask, WeeklyTaskStatus};
use crate::infrastructure::database::repositories::{
    ActivityRepository, CalendarEventRepository, FocusSessionRepository, ManualLogRepository,
    ReportRepository, WeeklyTaskRepository,
};

const PROJECT_SWITCH_THRESHOLD: usize = 7;
const CONTEXT_BLOCK_THRESHOLD: usize = 10;
const CONTEXT_PROJECT_THRESHOLD: usize = 3;
const SUPPORT_RATIO_THRESHOLD: f64 = 0.4;
const SUPPORT_DAY_THRESHOLD: usize = 2;
const MEETING_GAP_MINUTES: i64 = 90;
const STALE_OPEN_DAYS: i64 = 14;
const STALE_IN_PROGRESS_DAYS: i64 = 5;
const REPEATED_ISSUE_DAYS: usize = 3;
const REPEATED_ISSUE_OCCURRENCES: usize = 3;
const LONG_FOCUS_MINUTES: i64 = 150;
const FRAGMENTED_FOCUS_SESSIONS: usize = 4;
const FRICTION_RULE_VERSION: &str = "friction-graph-v2";

pub struct FrictionService;

impl FrictionService {
    pub async fn get_insights(
        activity_repository: &ActivityRepository<'_>,
        manual_log_repository: &ManualLogRepository<'_>,
        weekly_task_repository: &WeeklyTaskRepository<'_>,
        calendar_event_repository: &CalendarEventRepository<'_>,
        focus_session_repository: &FocusSessionRepository<'_>,
        report_repository: &ReportRepository<'_>,
        input: GetFrictionInsightsInput,
    ) -> Result<Vec<FrictionInsight>, FrictionServiceError> {
        validate_range(&input.from, &input.to)?;
        let surface = input.surface.as_deref().unwrap_or("friction");
        let activity_days = activity_repository
            .list(ListActivityInput {
                from: input.from.clone(),
                to: input.to.clone(),
                activity_type: None,
                project_ids: input.project_ids.clone(),
                workspace_ids: None,
                classification: input.classification.clone(),
                git_refs: None,
                worktree_paths: None,
            })
            .await
            .map_err(FrictionServiceError::Database)?;
        let manual_logs = manual_log_repository
            .list_by_date_range(&input.from, &input.to)
            .await
            .map_err(FrictionServiceError::Database)?;
        let tasks = weekly_task_repository
            .list(ListWeeklyTasksInput {
                week_start_date: input.from.clone(),
                week_end_date: input.to.clone(),
                project_ids: input.project_ids.clone(),
                classification: input.classification.clone(),
                task_type: None,
                status: None,
                included_in_report: None,
            })
            .await
            .map_err(FrictionServiceError::Database)?;
        let events = calendar_event_repository
            .list(ListCalendarEventsInput {
                from: format!("{}T00:00:00Z", input.from),
                to: format!("{}T23:59:59Z", input.to),
                source_id: None,
            })
            .await
            .map_err(FrictionServiceError::Database)?;
        let focus_sessions = focus_session_repository
            .list(ListFocusSessionsInput {
                from: Some(input.from.clone()),
                to: Some(input.to.clone()),
                status: None,
                project_ids: input.project_ids.clone(),
            })
            .await
            .map_err(FrictionServiceError::Database)?;
        let reports = report_repository
            .list()
            .await
            .map_err(FrictionServiceError::Database)?;

        let mut items = activity_days
            .iter()
            .flat_map(|day| day.items.iter().cloned())
            .collect::<Vec<_>>();
        items.sort_by(|a, b| a.occurred_at.cmp(&b.occurred_at));

        let graph = FrictionGraph::new(
            items,
            tasks,
            manual_logs,
            events,
            focus_sessions,
            reports,
        );
        let mut insights = graph.generate_insights(surface, &input.to);

        finalize_insights(
            &mut insights,
            &input.from,
            &input.to,
            surface,
            input.project_ids.clone(),
            input.classification.clone(),
        );

        insights.sort_by(|left, right| {
            severity_rank(&left.severity)
                .cmp(&severity_rank(&right.severity))
                .then_with(|| right.confidence.total_cmp(&left.confidence))
                .then_with(|| left.date.cmp(&right.date))
                .then_with(|| left.kind_label().cmp(right.kind_label()))
        });
        Ok(insights)
    }
}

#[derive(Clone)]
struct FrictionNode {
    key: String,
    source_type: FrictionEvidenceSourceType,
    source_id: String,
    date: String,
    occurred_at: Option<String>,
    project_id: Option<String>,
    project_name: Option<String>,
    title: String,
    route: String,
    tokens: HashSet<String>,
    anchors: HashSet<String>,
    metrics: BTreeMap<String, f64>,
}

#[derive(Clone)]
struct FrictionGraph {
    activity: Vec<ActivityItem>,
    tasks: Vec<WeeklyTask>,
    manual_logs: Vec<ManualLog>,
    calendar_events: Vec<crate::domain::calendar::CalendarEvent>,
    focus_sessions: Vec<crate::domain::focus_session::FocusSession>,
    reports: Vec<crate::domain::report::ReportSummary>,
    nodes: Vec<FrictionNode>,
}

impl FrictionGraph {
    fn new(
        activity: Vec<ActivityItem>,
        tasks: Vec<WeeklyTask>,
        manual_logs: Vec<ManualLog>,
        calendar_events: Vec<crate::domain::calendar::CalendarEvent>,
        focus_sessions: Vec<crate::domain::focus_session::FocusSession>,
        reports: Vec<crate::domain::report::ReportSummary>,
    ) -> Self {
        let mut nodes = Vec::new();
        nodes.extend(activity.iter().map(activity_node));
        nodes.extend(tasks.iter().map(task_node));
        nodes.extend(manual_logs.iter().map(manual_log_node));
        nodes.extend(calendar_events.iter().map(calendar_node));
        nodes.extend(focus_sessions.iter().map(focus_node));
        nodes.extend(reports.iter().map(report_node));
        Self {
            activity,
            tasks,
            manual_logs,
            calendar_events,
            focus_sessions,
            reports,
            nodes,
        }
    }

    fn generate_insights(&self, surface: &str, to: &str) -> Vec<FrictionInsight> {
        let _node_count = self.nodes.len();
        let mut insights = Vec::new();
        insights.extend(project_switching_insights(&self.activity, surface));
        insights.extend(context_switching_insights(&self.activity, surface));
        insights.extend(support_mode_insights(&self.manual_logs, surface));
        insights.extend(meeting_gap_insights(&self.activity, &self.calendar_events, surface));
        insights.extend(stale_task_insights(&self.tasks, to, surface));
        insights.extend(repeated_issue_insights(
            &self.activity,
            &self.tasks,
            &self.manual_logs,
            surface,
        ));
        insights.extend(focus_insights(&self.focus_sessions, surface));
        insights.extend(late_report_insights(&self.reports, surface));
        suppress_duplicate_candidates(insights)
    }
}

#[derive(Debug)]
pub enum FrictionServiceError {
    Validation(String),
    Database(sqlx::Error),
}

trait FrictionKindLabel {
    fn kind_label(&self) -> &'static str;
}

impl FrictionKindLabel for FrictionInsight {
    fn kind_label(&self) -> &'static str {
        match self.kind {
            FrictionInsightKind::ProjectSwitching => "project_switching",
            FrictionInsightKind::ContextSwitching => "context_switching",
            FrictionInsightKind::SupportMode => "support_mode",
            FrictionInsightKind::MeetingRecoveryGap => "meeting_recovery_gap",
            FrictionInsightKind::StaleTask => "stale_task",
            FrictionInsightKind::RepeatedIssue => "repeated_issue",
            FrictionInsightKind::LateReport => "late_report",
            FrictionInsightKind::FocusFragmentation => "focus_fragmentation",
        }
    }
}

fn validate_range(from: &str, to: &str) -> Result<(), FrictionServiceError> {
    if from.trim().is_empty() || to.trim().is_empty() {
        return Err(FrictionServiceError::Validation(
            "Friction date range is required".to_string(),
        ));
    }
    Ok(())
}

fn activity_node(item: &ActivityItem) -> FrictionNode {
    let text = format!(
        "{} {} {}",
        item.summary,
        item.branch.as_deref().unwrap_or_default(),
        item.project_name.as_deref().unwrap_or_default()
    );
    FrictionNode {
        key: format!("activity:{}", item.id),
        source_type: FrictionEvidenceSourceType::Activity,
        source_id: item.id.clone(),
        date: date_part(&item.occurred_at),
        occurred_at: Some(item.occurred_at.clone()),
        project_id: item.project_id.clone(),
        project_name: item.project_name.clone(),
        title: item.summary.clone(),
        route: "/activity".to_string(),
        tokens: meaningful_words(&text).into_iter().collect(),
        anchors: item
            .branch
            .as_deref()
            .map(candidate_phrases)
            .unwrap_or_default()
            .into_iter()
            .collect(),
        metrics: BTreeMap::new(),
    }
}

fn task_node(task: &WeeklyTask) -> FrictionNode {
    let mut metrics = BTreeMap::new();
    metrics.insert("estimated_minutes".to_string(), task.estimated_minutes.unwrap_or(0) as f64);
    FrictionNode {
        key: format!("weekly_task:{}", task.id),
        source_type: FrictionEvidenceSourceType::WeeklyTask,
        source_id: task.id.clone(),
        date: task.week_start_date.clone(),
        occurred_at: Some(task.updated_at.clone()),
        project_id: task.project_id.clone(),
        project_name: task.project_name.clone(),
        title: task.title.clone(),
        route: "/weekly-plan".to_string(),
        tokens: meaningful_words(&format!("{} {}", task.title, task.details.clone().unwrap_or_default()))
            .into_iter()
            .collect(),
        anchors: candidate_phrases(&task.title).into_iter().collect(),
        metrics,
    }
}

fn manual_log_node(log: &ManualLog) -> FrictionNode {
    let mut metrics = BTreeMap::new();
    metrics.insert("duration_minutes".to_string(), log.duration_minutes.unwrap_or(0) as f64);
    FrictionNode {
        key: format!("manual_log:{}", log.id),
        source_type: FrictionEvidenceSourceType::ManualLog,
        source_id: log.id.clone(),
        date: log.date.clone(),
        occurred_at: Some(log.date.clone()),
        project_id: log.project_id.clone(),
        project_name: None,
        title: log.summary.clone(),
        route: "/manual-log".to_string(),
        tokens: meaningful_words(&log.summary).into_iter().collect(),
        anchors: candidate_phrases(&log.summary).into_iter().collect(),
        metrics,
    }
}

fn calendar_node(event: &crate::domain::calendar::CalendarEvent) -> FrictionNode {
    FrictionNode {
        key: format!("calendar_event:{}", event.id),
        source_type: FrictionEvidenceSourceType::CalendarEvent,
        source_id: event.id.clone(),
        date: date_part(&event.starts_at),
        occurred_at: Some(event.starts_at.clone()),
        project_id: event.project_id.clone(),
        project_name: None,
        title: event.title.clone(),
        route: "/".to_string(),
        tokens: meaningful_words(&event.title).into_iter().collect(),
        anchors: candidate_phrases(&event.title).into_iter().collect(),
        metrics: BTreeMap::new(),
    }
}

fn focus_node(session: &crate::domain::focus_session::FocusSession) -> FrictionNode {
    let mut metrics = BTreeMap::new();
    metrics.insert(
        "duration_minutes".to_string(),
        session.duration_minutes.unwrap_or(0) as f64,
    );
    FrictionNode {
        key: format!("focus_session:{}", session.id),
        source_type: FrictionEvidenceSourceType::FocusSession,
        source_id: session.id.clone(),
        date: date_part(&session.started_at),
        occurred_at: Some(session.started_at.clone()),
        project_id: session.project_id.clone(),
        project_name: session.project_name.clone(),
        title: session.title.clone(),
        route: "/".to_string(),
        tokens: meaningful_words(&format!("{} {}", session.title, session.notes.clone().unwrap_or_default()))
            .into_iter()
            .collect(),
        anchors: session.task_title.as_deref().map(candidate_phrases).unwrap_or_default().into_iter().collect(),
        metrics,
    }
}

fn report_node(report: &crate::domain::report::ReportSummary) -> FrictionNode {
    FrictionNode {
        key: format!("report:{}", report.id),
        source_type: FrictionEvidenceSourceType::Report,
        source_id: report.id.clone(),
        date: date_part(&report.created_at),
        occurred_at: Some(report.created_at.clone()),
        project_id: None,
        project_name: None,
        title: report.title.clone(),
        route: "/reports".to_string(),
        tokens: meaningful_words(&report.title).into_iter().collect(),
        anchors: candidate_phrases(&report.title).into_iter().collect(),
        metrics: BTreeMap::new(),
    }
}

fn suppress_duplicate_candidates(mut insights: Vec<FrictionInsight>) -> Vec<FrictionInsight> {
    insights.sort_by(|left, right| {
        severity_rank(&left.severity)
            .cmp(&severity_rank(&right.severity))
            .then_with(|| right.confidence.total_cmp(&left.confidence))
            .then_with(|| left.kind_label().cmp(right.kind_label()))
    });
    let mut seen = HashSet::new();
    insights
        .into_iter()
        .filter(|insight| {
            let evidence_seed = if insight.evidence_items.is_empty() {
                insight.evidence.join("|")
            } else {
                insight
                    .evidence_items
                    .iter()
                    .map(|item| item.source_id.clone())
                    .collect::<Vec<_>>()
                    .join("|")
            };
            let key = format!("{}:{}:{evidence_seed}", insight.kind_label(), insight.date.as_deref().unwrap_or("range"));
            seen.insert(key)
        })
        .collect()
}

fn project_switching_insights(items: &[ActivityItem], surface: &str) -> Vec<FrictionInsight> {
    let mut by_date: BTreeMap<String, Vec<&ActivityItem>> = BTreeMap::new();
    for item in items {
        by_date
            .entry(date_part(&item.occurred_at))
            .or_default()
            .push(item);
    }

    by_date
        .into_iter()
        .filter_map(|(date, mut day_items)| {
            day_items.sort_by(|a, b| a.occurred_at.cmp(&b.occurred_at));
            if day_items.len() < 4 {
                return None;
            }
            let mut switches = 0;
            let mut previous = None::<String>;
            for item in &day_items {
                let current = item.project_name.clone().unwrap_or_else(|| "General".to_string());
                if let Some(previous_project) = previous.as_ref() {
                    if previous_project != &current {
                        switches += 1;
                    }
                }
                previous = Some(current);
            }
            if switches < PROJECT_SWITCH_THRESHOLD {
                return None;
            }
            let projects = day_items
                .iter()
                .filter_map(|item| item.project_name.clone())
                .collect::<HashSet<_>>();
            Some(insight(
                surface,
                "project_switching",
                &date,
                FrictionInsightKind::ProjectSwitching,
                FrictionInsightSeverity::High,
                "Project switching ran high",
                format!(
                    "You switched projects {switches} times on {date}. Consider setting one primary focus for the next work block."
                ),
                "Pick one primary project before the next planning pass.",
                vec![
                    format!("{switches} project switches"),
                    format!("{} projects touched", projects.len()),
                ],
                vec![
                    threshold_metric("switches", "Switches", switches.to_string(), PROJECT_SWITCH_THRESHOLD.to_string(), "above"),
                    metric("projects", "Projects", projects.len().to_string()),
                    metric("blocks", "Blocks", day_items.len().to_string()),
                ],
                "Open Today",
                "/",
                Some(date.clone()),
            ))
        })
        .collect()
}

fn context_switching_insights(items: &[ActivityItem], surface: &str) -> Vec<FrictionInsight> {
    let mut by_date: BTreeMap<String, Vec<&ActivityItem>> = BTreeMap::new();
    for item in items {
        by_date
            .entry(date_part(&item.occurred_at))
            .or_default()
            .push(item);
    }

    by_date
        .into_iter()
        .filter_map(|(date, day_items)| {
            let projects = day_items
                .iter()
                .map(|item| item.project_name.clone().unwrap_or_else(|| "General".to_string()))
                .collect::<HashSet<_>>();
            if day_items.len() < CONTEXT_BLOCK_THRESHOLD || projects.len() < CONTEXT_PROJECT_THRESHOLD
            {
                return None;
            }
            Some(insight(
                surface,
                "context_switching",
                &date,
                FrictionInsightKind::ContextSwitching,
                FrictionInsightSeverity::High,
                "The day looks fragmented",
                format!(
                    "{date} has {} captured activity blocks across {} projects or sources.",
                    day_items.len(),
                    projects.len()
                ),
                "Batch similar work or reserve a no-switch block tomorrow.",
                vec![
                    format!("{} activity blocks", day_items.len()),
                    format!("{} projects or sources", projects.len()),
                ],
                vec![
                    threshold_metric("blocks", "Blocks", day_items.len().to_string(), CONTEXT_BLOCK_THRESHOLD.to_string(), "above"),
                    threshold_metric("sources", "Sources", projects.len().to_string(), CONTEXT_PROJECT_THRESHOLD.to_string(), "above"),
                ],
                "View Activity",
                "/activity",
                Some(date.clone()),
            ))
        })
        .collect()
}

fn support_mode_insights(logs: &[ManualLog], surface: &str) -> Vec<FrictionInsight> {
    let mut by_date: BTreeMap<String, (i64, i64)> = BTreeMap::new();
    for log in logs {
        let minutes = log.duration_minutes.unwrap_or(0).max(0);
        if minutes == 0 {
            continue;
        }
        let entry = by_date.entry(log.date.clone()).or_default();
        entry.0 += minutes;
        if matches!(
            log.activity_type,
            ActivityType::Support
                | ActivityType::ClientCall
                | ActivityType::ClientFeedback
                | ActivityType::AdminTask
                | ActivityType::Debugging
        ) {
            entry.1 += minutes;
        }
    }
    let heavy_days = by_date
        .iter()
        .filter(|(_, (total, support))| {
            *total > 0 && (*support as f64 / *total as f64) >= SUPPORT_RATIO_THRESHOLD
        })
        .collect::<Vec<_>>();
    if heavy_days.len() < SUPPORT_DAY_THRESHOLD {
        return Vec::new();
    }
    let support_minutes = heavy_days.iter().map(|(_, (_, support))| *support).sum::<i64>();
    vec![insight(
        surface,
        "support_mode",
        "weekly",
        FrictionInsightKind::SupportMode,
        FrictionInsightSeverity::Medium,
        "Support mode is taking a large share",
        format!(
            "Support-like work took more than 40% of logged time on {} days this range.",
            heavy_days.len()
        ),
        "Consider reserving a support window so project work gets protected time.",
        heavy_days
            .iter()
            .map(|(date, (total, support))| format!("{date}: {support} of {total} minutes"))
            .collect(),
        vec![
            threshold_metric("qualifying_days", "Days", heavy_days.len().to_string(), SUPPORT_DAY_THRESHOLD.to_string(), "above"),
            threshold_metric("support_ratio", "Support share", ">=40%".to_string(), "40%".to_string(), "above"),
            metric("support_time", "Support time", format_minutes(support_minutes)),
        ],
        "Open Manual Log",
        "/manual-log",
        None,
    )]
}

fn meeting_gap_insights(
    items: &[ActivityItem],
    events: &[crate::domain::calendar::CalendarEvent],
    surface: &str,
) -> Vec<FrictionInsight> {
    if events.is_empty() || items.is_empty() {
        return Vec::new();
    }
    let item_times = items
        .iter()
        .filter_map(|item| parse_datetime(&item.occurred_at).map(|time| (time, item)))
        .collect::<Vec<_>>();
    let mut insights = Vec::new();
    for event in events.iter().filter(|event| !event.is_cancelled && !event.all_day) {
        let Some(end) = parse_datetime(&event.ends_at) else {
            continue;
        };
        let next = item_times
            .iter()
            .filter(|(time, _)| *time > end)
            .min_by_key(|(time, _)| *time);
        let Some((next_time, next_item)) = next else {
            continue;
        };
        if date_part(&next_item.occurred_at) != date_part(&event.ends_at) {
            continue;
        }
        let gap = (*next_time - end).num_minutes();
        if gap < MEETING_GAP_MINUTES {
            continue;
        }
        let date = date_part(&event.ends_at);
        insights.push(insight(
            surface,
            "meeting_recovery_gap",
            &date,
            FrictionInsightKind::MeetingRecoveryGap,
            FrictionInsightSeverity::Medium,
            "Meeting recovery gap was long",
            format!(
                "After \"{}\", the next captured activity started about {} later.",
                event.title,
                format_minutes(gap)
            ),
            "Block a short reset task after heavier meetings when possible.",
            vec![
                format!("Meeting: {}", event.title),
                format!("Gap: {}", format_minutes(gap)),
            ],
            vec![threshold_metric("gap_minutes", "Gap", format_minutes(gap), format_minutes(MEETING_GAP_MINUTES), "above")],
            "Open Today",
            "/",
            Some(date.clone()),
        ));
    }
    insights.into_iter().take(2).collect()
}

fn stale_task_insights(tasks: &[WeeklyTask], to: &str, surface: &str) -> Vec<FrictionInsight> {
    let Some(anchor) = parse_date(to) else {
        return Vec::new();
    };
    let stale = tasks
        .iter()
        .filter(|task| {
            matches!(
                task.status,
                WeeklyTaskStatus::Todo | WeeklyTaskStatus::Blocked | WeeklyTaskStatus::InProgress
            )
        })
        .filter_map(|task| {
            parse_date(&task.week_start_date).map(|start| {
                let days = (anchor - start).num_days();
                (task, days)
            })
        })
        .filter(|(task, days)| {
            (task.status == WeeklyTaskStatus::InProgress && *days >= STALE_IN_PROGRESS_DAYS)
                || (*days >= STALE_OPEN_DAYS)
        })
        .collect::<Vec<_>>();
    if stale.is_empty() {
        return Vec::new();
    }
    let title = if stale.len() == 1 {
        "A task has stayed open too long".to_string()
    } else {
        format!("{} tasks have stayed open too long", stale.len())
    };
    let evidence_items = stale
        .iter()
        .take(8)
        .map(|(task, days)| FrictionEvidenceItem {
            evidence_id: format!("weekly_task:{}", task.id),
            source_type: FrictionEvidenceSourceType::WeeklyTask,
            source_id: task.id.clone(),
            title: task.title.clone(),
            date: task.week_start_date.clone(),
            occurred_at: Some(task.updated_at.clone()),
            project_name: task.project_name.clone(),
            detail: Some(format!("{} days open / {}", days, task.status.as_storage_value())),
            route: Some("/weekly-plan".to_string()),
            role: "primary".to_string(),
            observed_value: Some(days.to_string()),
            route_state: None,
        })
        .collect::<Vec<_>>();
    let mut insight = insight(
        surface,
        "stale_task",
        "weekly",
        FrictionInsightKind::StaleTask,
        FrictionInsightSeverity::High,
        title,
        "Some open work is old enough to deserve a decision: finish, carry, drop, or mark blocked.",
        "Review stale tasks before planning more work.",
        evidence_strings(&evidence_items),
        vec![metric("stale_tasks", "Stale tasks", stale.len().to_string())],
        "Review tasks",
        "/weekly-plan",
        None,
    );
    insight.evidence_items = evidence_items;
    insight.primary_action = task_primary_action(&insight.id, &insight.evidence_items, None);
    vec![insight]
}

fn repeated_issue_insights(
    items: &[ActivityItem],
    tasks: &[WeeklyTask],
    logs: &[ManualLog],
    surface: &str,
) -> Vec<FrictionInsight> {
    let completed_phrases = tasks
        .iter()
        .filter(|task| {
            matches!(
                task.status,
                WeeklyTaskStatus::Completed | WeeklyTaskStatus::Dropped
            )
        })
        .flat_map(|task| candidate_phrases(&task.title))
        .collect::<HashSet<_>>();
    let mut candidates: HashMap<String, Vec<RepeatedOccurrence>> = HashMap::new();
    for item in items {
        collect_occurrences(
            &item.summary,
            RepeatedOccurrence {
                source_type: FrictionEvidenceSourceType::Activity,
                source_id: item.id.clone(),
                title: item.summary.clone(),
                date: date_part(&item.occurred_at),
                project_name: item.project_name.clone(),
                detail: Some(item.activity_type.clone()),
                route: Some("/activity".to_string()),
            },
            &mut candidates,
        );
        if let Some(branch) = item.branch.as_deref() {
            collect_occurrences(
                branch,
                RepeatedOccurrence {
                    source_type: FrictionEvidenceSourceType::Activity,
                    source_id: item.id.clone(),
                    title: item.summary.clone(),
                    date: date_part(&item.occurred_at),
                    project_name: item.project_name.clone(),
                    detail: Some(format!("branch {branch}")),
                    route: Some("/activity".to_string()),
                },
                &mut candidates,
            );
        }
    }
    for task in tasks.iter().filter(|task| {
        matches!(
            task.status,
            WeeklyTaskStatus::Todo | WeeklyTaskStatus::Blocked | WeeklyTaskStatus::InProgress
        )
    }) {
        collect_occurrences(
            &task.title,
            RepeatedOccurrence {
                source_type: FrictionEvidenceSourceType::WeeklyTask,
                source_id: task.id.clone(),
                title: task.title.clone(),
                date: task.week_start_date.clone(),
                project_name: task.project_name.clone(),
                detail: Some(task.status.as_storage_value().to_string()),
                route: Some("/weekly-plan".to_string()),
            },
            &mut candidates,
        );
        if let Some(details) = task.details.as_deref() {
            collect_occurrences(
                details,
                RepeatedOccurrence {
                    source_type: FrictionEvidenceSourceType::WeeklyTask,
                    source_id: task.id.clone(),
                    title: task.title.clone(),
                    date: task.week_start_date.clone(),
                    project_name: task.project_name.clone(),
                    detail: Some("task details".to_string()),
                    route: Some("/weekly-plan".to_string()),
                },
                &mut candidates,
            );
        }
    }
    for log in logs {
        collect_occurrences(
            &log.summary,
            RepeatedOccurrence {
                source_type: FrictionEvidenceSourceType::ManualLog,
                source_id: log.id.clone(),
                title: log.summary.clone(),
                date: log.date.clone(),
                project_name: None,
                detail: Some(log.activity_type.as_storage_value().to_string()),
                route: Some("/manual-log".to_string()),
            },
            &mut candidates,
        );
    }
    let mut repeated = candidates
        .into_iter()
        .filter(|(phrase, occurrences)| {
            !completed_phrases.contains(phrase)
                && strong_repeated_candidate(phrase, occurrences)
        })
        .collect::<Vec<_>>();
    repeated.sort_by(|a, b| {
        repeated_score(&b.1)
            .cmp(&repeated_score(&a.1))
            .then_with(|| a.0.cmp(&b.0))
    });
    let Some((phrase, occurrences)) = repeated.first() else {
        return Vec::new();
    };
    let evidence_items = occurrences
        .iter()
        .take(8)
        .map(RepeatedOccurrence::to_evidence_item)
        .collect::<Vec<_>>();
    let evidence_dates = evidence_items
        .iter()
        .map(|item| item.date.clone())
        .collect::<HashSet<_>>();
    let mut insight = insight(
        surface,
        "repeated_issue",
        phrase,
        FrictionInsightKind::RepeatedIssue,
        FrictionInsightSeverity::Medium,
        "The same work keeps resurfacing",
        format!(
            "\"{phrase}\" appears in {} records across {} separate days.",
            occurrences.len(),
            evidence_dates.len()
        ),
        "Turn the repeated thread into one explicit task or blocker.",
        evidence_strings(&evidence_items),
        vec![
            threshold_metric("records", "Records", occurrences.len().to_string(), REPEATED_ISSUE_OCCURRENCES.to_string(), "above"),
            threshold_metric("days", "Days", evidence_dates.len().to_string(), REPEATED_ISSUE_DAYS.to_string(), "above"),
        ],
        "Review tasks",
        "/weekly-plan",
        None,
    );
    insight.evidence_items = evidence_items;
    insight.primary_action = task_primary_action(&insight.id, &insight.evidence_items, Some(phrase));
    vec![insight]
}

fn focus_insights(
    sessions: &[crate::domain::focus_session::FocusSession],
    surface: &str,
) -> Vec<FrictionInsight> {
    let long = sessions
        .iter()
        .filter(|session| session.duration_minutes.unwrap_or(0) >= LONG_FOCUS_MINUTES)
        .collect::<Vec<_>>();
    if let Some(session) = long.first() {
        let date = date_part(&session.started_at);
        return vec![insight(
            surface,
            "focus_fragmentation",
            &date,
            FrictionInsightKind::FocusFragmentation,
            FrictionInsightSeverity::Medium,
            "A focus session ran unusually long",
            format!(
                "\"{}\" ran for {}. Confirm the log still matches the work.",
                session.title,
                format_minutes(session.duration_minutes.unwrap_or(0))
            ),
            "Stop or split long focus blocks when the work changes.",
            vec![format!("Session: {}", session.title)],
            vec![threshold_metric(
                "duration_minutes",
                "Duration",
                format_minutes(session.duration_minutes.unwrap_or(0)),
                format_minutes(LONG_FOCUS_MINUTES),
                "above",
            )],
            "Open Today",
            "/",
            Some(date.clone()),
        )];
    }
    let mut by_date: BTreeMap<String, usize> = BTreeMap::new();
    for session in sessions {
        *by_date.entry(date_part(&session.started_at)).or_default() += 1;
    }
    by_date
        .into_iter()
        .find(|(_, count)| *count >= FRAGMENTED_FOCUS_SESSIONS)
        .map(|(date, count)| {
            vec![insight(
                surface,
                "focus_fragmentation",
                &date,
                FrictionInsightKind::FocusFragmentation,
                FrictionInsightSeverity::Medium,
                "Focus blocks look fragmented",
                format!("{date} has {count} focus sessions. That can be useful, but it may also signal interruption."),
                "Use one longer focus block for the next deep-work task if the day allows.",
                vec![format!("{count} focus sessions")],
                vec![threshold_metric("sessions", "Sessions", count.to_string(), FRAGMENTED_FOCUS_SESSIONS.to_string(), "above")],
                "Open Today",
                "/",
                Some(date.clone()),
            )]
        })
        .unwrap_or_default()
}

fn late_report_insights(
    reports: &[crate::domain::report::ReportSummary],
    surface: &str,
) -> Vec<FrictionInsight> {
    let late = reports
        .iter()
        .filter(|report| {
            parse_datetime(&report.created_at)
                .map(|created| created.weekday().number_from_monday() > 5)
                .unwrap_or(false)
        })
        .take(2)
        .collect::<Vec<_>>();
    if late.len() < 2 {
        return Vec::new();
    }
    vec![insight(
        surface,
        "late_report",
        "recent",
        FrictionInsightKind::LateReport,
        FrictionInsightSeverity::Medium,
        "Reports are landing late",
        "The last two saved reports were created after the Friday cutoff.",
        "Prepare report-ready items earlier in the week to reduce end-of-week cleanup.",
        late.iter()
            .map(|report| format!("{} saved {}", report.title, date_part(&report.created_at)))
            .collect(),
        vec![threshold_metric("late_reports", "Late reports", late.len().to_string(), "2".to_string(), "above")],
        "Prepare report",
        "/reports",
        None,
    )]
}

#[derive(Debug, Clone)]
struct RepeatedOccurrence {
    source_type: FrictionEvidenceSourceType,
    source_id: String,
    title: String,
    date: String,
    project_name: Option<String>,
    detail: Option<String>,
    route: Option<String>,
}

impl RepeatedOccurrence {
    fn to_evidence_item(&self) -> FrictionEvidenceItem {
        FrictionEvidenceItem {
            evidence_id: format!("{}:{}", source_label(&self.source_type).to_ascii_lowercase().replace(' ', "_"), self.source_id),
            source_type: self.source_type.clone(),
            source_id: self.source_id.clone(),
            title: self.title.clone(),
            date: self.date.clone(),
            occurred_at: Some(self.date.clone()),
            project_name: self.project_name.clone(),
            detail: self.detail.clone(),
            route: self.route.clone(),
            role: "primary".to_string(),
            observed_value: None,
            route_state: None,
        }
    }
}

fn collect_occurrences(
    text: &str,
    occurrence: RepeatedOccurrence,
    candidates: &mut HashMap<String, Vec<RepeatedOccurrence>>,
) {
    for phrase in candidate_phrases(text) {
        candidates
            .entry(phrase)
            .or_default()
            .push(occurrence.clone());
    }
}

fn candidate_phrases(text: &str) -> Vec<String> {
    let words = meaningful_words(text);
    let mut phrases = HashSet::new();

    for window_size in [3_usize, 2_usize] {
        for window in words.windows(window_size) {
            if window.iter().any(|word| word.len() < 4) {
                continue;
            }
            phrases.insert(window.join(" "));
        }
    }

    if words.len() <= 5 && words.len() >= 2 {
        phrases.insert(words.join(" "));
    }

    phrases.into_iter().collect()
}

fn meaningful_words(text: &str) -> Vec<String> {
    text.split(|character: char| !character.is_ascii_alphanumeric())
        .map(|word| word.trim().to_ascii_lowercase())
        .filter(|word| word.len() >= 3 && !is_noise_word(word))
        .take(12)
        .collect()
}

fn is_noise_word(word: &str) -> bool {
    matches!(
        word,
        "the"
            | "and"
            | "for"
            | "with"
            | "from"
            | "this"
            | "that"
            | "into"
            | "work"
            | "task"
            | "tasks"
            | "update"
            | "updates"
            | "fix"
            | "fixed"
            | "add"
            | "added"
            | "build"
            | "page"
            | "user"
            | "global"
            | "local"
            | "common"
            | "shared"
            | "change"
            | "changes"
            | "project"
            | "projects"
            | "service"
            | "component"
            | "system"
            | "admin"
            | "client"
            | "issue"
            | "issues"
            | "error"
            | "errors"
            | "module"
            | "screen"
            | "view"
            | "logic"
            | "data"
            | "handle"
            | "handled"
            | "support"
            | "report"
            | "reports"
    )
}

fn strong_repeated_candidate(phrase: &str, occurrences: &[RepeatedOccurrence]) -> bool {
    let unique_dates = occurrences
        .iter()
        .map(|occurrence| occurrence.date.clone())
        .collect::<HashSet<_>>();
    let has_task_or_log = occurrences.iter().any(|occurrence| {
        matches!(
            occurrence.source_type,
            FrictionEvidenceSourceType::WeeklyTask | FrictionEvidenceSourceType::ManualLog
        )
    });
    let all_activity = occurrences
        .iter()
        .all(|occurrence| matches!(occurrence.source_type, FrictionEvidenceSourceType::Activity));

    phrase.split_whitespace().count() >= 2
        && occurrences.len() >= REPEATED_ISSUE_OCCURRENCES
        && unique_dates.len() >= REPEATED_ISSUE_DAYS
        && has_task_or_log
        && !all_activity
}

fn repeated_score(occurrences: &[RepeatedOccurrence]) -> usize {
    let unique_dates = occurrences
        .iter()
        .map(|occurrence| occurrence.date.clone())
        .collect::<HashSet<_>>()
        .len();
    let task_or_log = occurrences
        .iter()
        .filter(|occurrence| {
            matches!(
                occurrence.source_type,
                FrictionEvidenceSourceType::WeeklyTask | FrictionEvidenceSourceType::ManualLog
            )
        })
        .count();
    unique_dates * 10 + task_or_log * 4 + occurrences.len()
}

fn evidence_strings(items: &[FrictionEvidenceItem]) -> Vec<String> {
    items
        .iter()
        .take(4)
        .map(|item| {
            let project = item
                .project_name
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or("General");
            format!("{} / {} / {}", item.date, source_label(&item.source_type), project)
        })
        .collect()
}

fn finalize_insights(
    insights: &mut [FrictionInsight],
    from: &str,
    to: &str,
    surface: &str,
    project_ids: Option<Vec<String>>,
    classification: Option<String>,
) {
    for insight in insights {
        insight.scope = FrictionInsightScope {
            from: from.to_string(),
            to: to.to_string(),
            surface: surface.to_string(),
            project_ids: project_ids.clone(),
            classification: classification.clone(),
        };
        if insight.reasons.is_empty() {
            let evidence_ids = insight
                .evidence_items
                .iter()
                .map(|item| item.evidence_id.clone())
                .collect::<Vec<_>>();
            insight.reasons.push(FrictionInsightReason {
                id: format!("{}_threshold", insight.kind_label()),
                label: "Threshold crossed".to_string(),
                detail: threshold_reason(insight),
                strength: "primary".to_string(),
                evidence_ids,
            });
        }
        if insight.evidence_items.is_empty() && !insight.evidence.is_empty() {
            insight.data_health.notes.push(
                "This rule has compact evidence only; detailed source rows will be added as graph coverage expands.".to_string(),
            );
            if insight.data_health.status == "complete" {
                insight.data_health.status = "partial".to_string();
            }
        }
        if project_ids.as_ref().is_some_and(|ids| !ids.is_empty())
            && matches!(
                insight.kind,
                FrictionInsightKind::SupportMode
                    | FrictionInsightKind::MeetingRecoveryGap
                    | FrictionInsightKind::LateReport
            )
        {
            insight.data_health.status = "limited".to_string();
            insight.data_health.notes.push(
                "Some supporting sources are app-level today and may include evidence outside the selected project filter.".to_string(),
            );
        }
        let evidence_fingerprint = if insight.evidence_items.is_empty() {
            stable_hash(&insight.evidence.join("|"))
        } else {
            let mut ids = insight
                .evidence_items
                .iter()
                .map(|item| format!("{}:{}", source_label(&item.source_type), item.source_id))
                .collect::<Vec<_>>();
            ids.sort();
            stable_hash(&ids.join("|"))
        };
        let pattern_seed = format!(
            "{}:{}:{}",
            insight.kind_label(),
            insight.date.as_deref().unwrap_or(from),
            insight.claim.statement
        );
        let scope_key = insight
            .date
            .as_ref()
            .map(|date| format!("day:{date}"))
            .unwrap_or_else(|| format!("range:{from}:{to}"));
        insight.id = format!("friction:v2:{}:{scope_key}:{evidence_fingerprint}", insight.kind_label());
        insight.nudge_key = format!(
            "friction:v2:{}:{scope_key}:{}",
            insight.kind_label(),
            stable_hash(&pattern_seed)
        );
        if let Some(action) = insight.primary_action.as_mut() {
            if let Some(state) = action.state_json.as_mut().and_then(|value| value.as_object_mut()) {
                state.insert("frictionInsightId".to_string(), json!(insight.id.clone()));
            }
        }
    }
}

fn threshold_reason(insight: &FrictionInsight) -> String {
    let threshold_metrics = insight
        .metrics
        .iter()
        .filter_map(|metric| {
            metric.threshold.as_ref().map(|threshold| {
                format!("{} {} {}", metric.label, metric.direction.as_deref().unwrap_or("met"), threshold)
            })
        })
        .collect::<Vec<_>>();
    if threshold_metrics.is_empty() {
        return insight.detail.clone();
    }
    format!("{}.", threshold_metrics.join("; "))
}

fn source_label(source_type: &FrictionEvidenceSourceType) -> &'static str {
    match source_type {
        FrictionEvidenceSourceType::WeeklyTask => "Task",
        FrictionEvidenceSourceType::Activity => "Activity",
        FrictionEvidenceSourceType::ManualLog => "Manual log",
        FrictionEvidenceSourceType::CalendarEvent => "Calendar",
        FrictionEvidenceSourceType::FocusSession => "Focus",
        FrictionEvidenceSourceType::Report => "Report",
    }
}

fn task_primary_action(
    insight_id: &str,
    evidence_items: &[FrictionEvidenceItem],
    search_phrase: Option<&str>,
) -> Option<FrictionInsightAction> {
    let task_ids = evidence_items
        .iter()
        .filter(|item| matches!(item.source_type, FrictionEvidenceSourceType::WeeklyTask))
        .map(|item| item.source_id.clone())
        .collect::<Vec<_>>();
    if task_ids.len() == 1 {
        return Some(FrictionInsightAction {
            route: "/weekly-plan".to_string(),
            state_json: Some(json!({
                "openTaskId": task_ids[0],
                "frictionInsightId": insight_id,
                "frictionSearch": search_phrase,
            })),
            source_id: Some(task_ids[0].clone()),
        });
    }
    if task_ids.len() > 1 {
        return Some(FrictionInsightAction {
            route: "/weekly-plan".to_string(),
            state_json: Some(json!({
                "highlightTaskIds": task_ids,
                "frictionInsightId": insight_id,
                "frictionSearch": search_phrase,
            })),
            source_id: None,
        });
    }
    search_phrase.map(|phrase| FrictionInsightAction {
        route: "/activity".to_string(),
        state_json: Some(json!({
            "searchQuery": phrase,
            "frictionInsightId": insight_id,
        })),
        source_id: None,
    })
}

#[allow(clippy::too_many_arguments)]
fn insight(
    surface: &str,
    key: &str,
    key_scope: &str,
    kind: FrictionInsightKind,
    severity: FrictionInsightSeverity,
    title: impl Into<String>,
    detail: impl Into<String>,
    recommendation: impl Into<String>,
    evidence: Vec<String>,
    metrics: Vec<FrictionInsightMetric>,
    action_label: impl Into<String>,
    action_target: impl Into<String>,
    date: Option<String>,
) -> FrictionInsight {
    let confidence = confidence_for(&severity, &kind);
    let confidence_label = confidence_label_for(confidence);
    let impact_label = impact_label_for(&severity).to_string();
    let detail = detail.into();
    let key_scope = key_scope.replace(' ', "_");
    let nudge_key = format!("friction:v2:{key}:{key_scope}:{}", stable_hash(&format!("{key}:{key_scope}")));
    FrictionInsight {
        id: format!("friction:v2:{key}:{key_scope}:pending"),
        nudge_key,
        rule_version: FRICTION_RULE_VERSION.to_string(),
        scope: FrictionInsightScope {
            from: date.clone().unwrap_or_default(),
            to: date.clone().unwrap_or_default(),
            surface: surface.to_string(),
            project_ids: None,
            classification: None,
        },
        claim: FrictionInsightClaim {
            statement: detail.clone(),
            impact_label,
        },
        kind,
        severity,
        confidence,
        confidence_label,
        verified: confidence >= 0.55,
        data_health: FrictionInsightDataHealth {
            status: "complete".to_string(),
            notes: Vec::new(),
        },
        title: title.into(),
        detail,
        recommendation: recommendation.into(),
        evidence,
        metrics,
        evidence_items: Vec::new(),
        reasons: Vec::new(),
        action_label: action_label.into(),
        action_target: action_target.into(),
        primary_action: None,
        date,
    }
}

fn metric(key: impl Into<String>, label: impl Into<String>, value: impl Into<String>) -> FrictionInsightMetric {
    FrictionInsightMetric {
        key: key.into(),
        label: label.into(),
        value: value.into(),
        unit: None,
        threshold: None,
        direction: None,
    }
}

fn threshold_metric(
    key: impl Into<String>,
    label: impl Into<String>,
    value: impl Into<String>,
    threshold: impl Into<String>,
    direction: impl Into<String>,
) -> FrictionInsightMetric {
    FrictionInsightMetric {
        key: key.into(),
        label: label.into(),
        value: value.into(),
        unit: None,
        threshold: Some(threshold.into()),
        direction: Some(direction.into()),
    }
}

fn confidence_for(severity: &FrictionInsightSeverity, kind: &FrictionInsightKind) -> f64 {
    match (severity, kind) {
        (FrictionInsightSeverity::High, _) => 0.82,
        (FrictionInsightSeverity::Medium, FrictionInsightKind::RepeatedIssue) => 0.74,
        (FrictionInsightSeverity::Medium, _) => 0.66,
        (FrictionInsightSeverity::Low, _) => 0.46,
    }
}

fn confidence_label_for(confidence: f64) -> String {
    if confidence >= 0.78 {
        "strong"
    } else if confidence >= 0.55 {
        "likely"
    } else if confidence >= 0.40 {
        "watch"
    } else {
        "needs_review"
    }
    .to_string()
}

fn impact_label_for(severity: &FrictionInsightSeverity) -> &'static str {
    match severity {
        FrictionInsightSeverity::High => "high",
        FrictionInsightSeverity::Medium => "medium",
        FrictionInsightSeverity::Low => "low",
    }
}

fn stable_hash(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn severity_rank(severity: &FrictionInsightSeverity) -> i32 {
    match severity {
        FrictionInsightSeverity::High => 0,
        FrictionInsightSeverity::Medium => 1,
        FrictionInsightSeverity::Low => 2,
    }
}

fn date_part(value: &str) -> String {
    value.get(0..10).unwrap_or(value).to_string()
}

fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value.get(0..10).unwrap_or(value), "%Y-%m-%d").ok()
}

fn parse_datetime(value: &str) -> Option<NaiveDateTime> {
    let normalized = value.trim_end_matches('Z');
    NaiveDateTime::parse_from_str(normalized, "%Y-%m-%dT%H:%M:%S%.f")
        .ok()
        .or_else(|| {
            NaiveDate::parse_from_str(value.get(0..10).unwrap_or(value), "%Y-%m-%d")
                .ok()
                .and_then(|date| date.and_hms_opt(0, 0, 0))
        })
}

fn format_minutes(minutes: i64) -> String {
    let hours = minutes / 60;
    let remaining = minutes % 60;
    if hours == 0 {
        return format!("{remaining}m");
    }
    if remaining == 0 {
        return format!("{hours}h");
    }
    format!("{hours}h {remaining}m")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::weekly_task::{WeeklyTaskPriority, WeeklyTaskType};

    fn activity(id: &str, project: &str, at: &str) -> ActivityItem {
        activity_with_summary(id, project, at, &format!("work on {project}"))
    }

    fn activity_with_summary(id: &str, project: &str, at: &str, summary: &str) -> ActivityItem {
        ActivityItem {
            id: id.to_string(),
            project_id: Some(project.to_string()),
            project_name: Some(project.to_string()),
            workspace_id: None,
            workspace_name: None,
            workspace_relative_path: None,
            activity_type: "commit".to_string(),
            summary: summary.to_string(),
            occurred_at: at.to_string(),
            included_in_report: true,
            commit_hash: None,
            author_name: None,
            author_email: None,
            branch: None,
            files_changed: None,
            insertions: None,
            deletions: None,
            refs: Vec::new(),
            worktree: None,
        }
    }

    fn task(id: &str, title: &str, status: WeeklyTaskStatus, week_start_date: &str) -> WeeklyTask {
        WeeklyTask {
            id: id.to_string(),
            project_id: None,
            project_name: Some("Product".to_string()),
            task_type: WeeklyTaskType::PlannedWork,
            status,
            title: title.to_string(),
            details: None,
            week_start_date: week_start_date.to_string(),
            target_date: None,
            completed_at: None,
            priority: WeeklyTaskPriority::Normal,
            included_in_report: false,
            progress_percent: None,
            estimated_minutes: None,
            created_at: format!("{week_start_date}T00:00:00Z"),
            updated_at: format!("{week_start_date}T00:00:00Z"),
        }
    }

    fn manual_log(id: &str, date: &str, summary: &str) -> ManualLog {
        ManualLog {
            id: id.to_string(),
            project_id: None,
            date: date.to_string(),
            activity_type: ActivityType::Development,
            summary: summary.to_string(),
            outcome: None,
            duration_minutes: Some(30),
            follow_up: None,
            included_in_report: true,
        }
    }

    #[test]
    fn project_switching_requires_threshold() {
        let items = vec![
            activity("1", "A", "2026-05-29T08:00:00Z"),
            activity("2", "B", "2026-05-29T09:00:00Z"),
            activity("3", "A", "2026-05-29T10:00:00Z"),
            activity("4", "B", "2026-05-29T11:00:00Z"),
        ];
        assert!(project_switching_insights(&items, "today").is_empty());
    }

    #[test]
    fn project_switching_detects_high_switch_count() {
        let mut items = Vec::new();
        for index in 0..9 {
            let project = if index % 2 == 0 { "A" } else { "B" };
            items.push(activity(
                &index.to_string(),
                project,
                &format!("2026-05-29T{:02}:00:00Z", index + 8),
            ));
        }
        assert_eq!(project_switching_insights(&items, "today").len(), 1);
    }

    #[test]
    fn stale_tasks_detect_old_open_work() {
        let tasks = vec![task(
            "task_1",
            "Finish old work",
            WeeklyTaskStatus::Todo,
            "2026-05-01",
        )];
        let insights = stale_task_insights(&tasks, "2026-05-29", "friction");
        assert_eq!(insights.len(), 1);
        assert_eq!(insights[0].evidence_items[0].source_id, "task_1");
        assert!(matches!(
            insights[0].evidence_items[0].source_type,
            FrictionEvidenceSourceType::WeeklyTask
        ));
    }

    #[test]
    fn repeated_issue_ignores_generic_global_token() {
        let items = vec![activity_with_summary(
            "activity_1",
            "Product",
            "2026-05-27T10:00:00Z",
            "global update changes",
        )];
        let tasks = vec![task(
            "task_1",
            "global project update",
            WeeklyTaskStatus::Todo,
            "2026-05-25",
        )];
        let logs = vec![
            manual_log("log_1", "2026-05-25", "global local shared changes"),
            manual_log("log_2", "2026-05-26", "global common project update"),
        ];

        assert!(repeated_issue_insights(&items, &tasks, &logs, "friction").is_empty());
    }

    #[test]
    fn repeated_issue_requires_task_or_log_evidence_and_returns_items() {
        let items = vec![
            activity_with_summary(
                "activity_1",
                "Product",
                "2026-05-25T10:00:00Z",
                "callback timeout handling",
            ),
            activity_with_summary(
                "activity_2",
                "Product",
                "2026-05-26T10:00:00Z",
                "callback timeout handling",
            ),
        ];
        let tasks = vec![task(
            "task_1",
            "Callback timeout handling",
            WeeklyTaskStatus::Todo,
            "2026-05-27",
        )];
        let logs = vec![manual_log("log_1", "2026-05-28", "callback timeout handling follow-up")];

        let insights = repeated_issue_insights(&items, &tasks, &logs, "friction");
        assert_eq!(insights.len(), 1);
        assert!(insights[0].detail.contains("callback timeout handling"));
        assert!(insights[0]
            .evidence_items
            .iter()
            .any(|item| item.source_id == "task_1"));
    }

    #[test]
    fn completed_matching_task_suppresses_repeated_issue() {
        let items = vec![
            activity_with_summary(
                "activity_1",
                "Product",
                "2026-05-25T10:00:00Z",
                "callback timeout handling",
            ),
            activity_with_summary(
                "activity_2",
                "Product",
                "2026-05-26T10:00:00Z",
                "callback timeout handling",
            ),
        ];
        let tasks = vec![task(
            "task_1",
            "Callback timeout handling",
            WeeklyTaskStatus::Completed,
            "2026-05-27",
        )];
        let logs = vec![manual_log("log_1", "2026-05-28", "callback timeout handling follow-up")];

        assert!(repeated_issue_insights(&items, &tasks, &logs, "friction").is_empty());
    }
}
