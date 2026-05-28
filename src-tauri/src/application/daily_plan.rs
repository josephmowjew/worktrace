use chrono::{Datelike, Duration, NaiveDate, Utc};

use crate::application::repositories::{
    CalendarEventStore, DailyPlanStore, FocusSessionStore, ManualLogStore, WeeklyTaskStore,
};
use crate::domain::calendar::ListCalendarEventsInput;
use crate::domain::daily_plan::{
    DailyPlan, DailyPlanItem, DailyPlanItemStatus, DistractionRisk, EndOfDayProgress,
    GetDailyPlanInput, GetTodayCommandCenterInput, PlannedVsActualItem, ReplaceDailyPlanItemInput,
    ReplaceDailyPlanItemsInput, TodayCommandCenter, UpdateDailyPlanItemInput, UpsertDailyPlanInput,
};
use crate::domain::focus_session::{FocusSession, ListFocusSessionsInput};
use crate::domain::manual_log::{ActivityType, ManualLog};
use crate::domain::weekly_task::{
    ListWeeklyTasksInput, WeeklyTask, WeeklyTaskPriority, WeeklyTaskStatus,
};

pub struct DailyPlanService;

impl DailyPlanService {
    pub async fn get_daily_plan(
        store: &impl DailyPlanStore,
        input: GetDailyPlanInput,
    ) -> Result<Option<DailyPlan>, DailyPlanServiceError> {
        validate_date(&input.date)?;
        store
            .get_by_date(input)
            .await
            .map_err(DailyPlanServiceError::Database)
    }

    pub async fn upsert_daily_plan(
        store: &impl DailyPlanStore,
        input: UpsertDailyPlanInput,
    ) -> Result<DailyPlan, DailyPlanServiceError> {
        validate_date(&input.date)?;
        if input
            .focus_goal_minutes
            .map(|minutes| minutes <= 0 || minutes > 24 * 60)
            .unwrap_or(false)
        {
            return Err(DailyPlanServiceError::Validation(
                "Focus goal must be between 1 and 1440 minutes".to_string(),
            ));
        }
        store
            .upsert(input)
            .await
            .map_err(DailyPlanServiceError::Database)
    }

    pub async fn replace_daily_plan_items(
        store: &impl DailyPlanStore,
        input: ReplaceDailyPlanItemsInput,
    ) -> Result<Vec<DailyPlanItem>, DailyPlanServiceError> {
        validate_date(&input.date)?;
        if input.items.len() > 3 {
            return Err(DailyPlanServiceError::Validation(
                "Top priorities are capped at 3 items".to_string(),
            ));
        }
        for item in &input.items {
            validate_item(item)?;
        }
        let plan = store
            .upsert(UpsertDailyPlanInput {
                date: input.date,
                focus_goal_minutes: None,
                current_task_id: None,
                suggested_task_id: None,
            })
            .await
            .map_err(DailyPlanServiceError::Database)?;
        store
            .replace_items(&plan.id, input.items)
            .await
            .map_err(DailyPlanServiceError::Database)
    }

    pub async fn update_daily_plan_item(
        store: &impl DailyPlanStore,
        id: &str,
        input: UpdateDailyPlanItemInput,
    ) -> Result<Option<DailyPlanItem>, DailyPlanServiceError> {
        if input
            .planned_minutes
            .map(|minutes| minutes <= 0 || minutes > 24 * 60)
            .unwrap_or(false)
        {
            return Err(DailyPlanServiceError::Validation(
                "Planned minutes must be between 1 and 1440".to_string(),
            ));
        }
        if input
            .title
            .as_ref()
            .map(|title| title.trim().is_empty())
            .unwrap_or(false)
        {
            return Err(DailyPlanServiceError::Validation(
                "Priority title cannot be empty".to_string(),
            ));
        }
        store
            .update_item(id, input)
            .await
            .map_err(DailyPlanServiceError::Database)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn get_today_command_center(
        plans: &impl DailyPlanStore,
        weekly_tasks: &impl WeeklyTaskStore,
        focus_sessions: &impl FocusSessionStore,
        manual_logs: &impl ManualLogStore,
        calendar_events: &impl CalendarEventStore,
        input: GetTodayCommandCenterInput,
    ) -> Result<TodayCommandCenter, DailyPlanServiceError> {
        validate_date(&input.date)?;
        let date = input.date.clone();
        let monday = monday_for_date(&date)?;
        let friday = (NaiveDate::parse_from_str(&monday, "%Y-%m-%d")
            .map_err(|_| DailyPlanServiceError::Validation("Invalid date".to_string()))?
            + Duration::days(4))
        .format("%Y-%m-%d")
        .to_string();

        let daily_plan = plans
            .upsert(UpsertDailyPlanInput {
                date: date.clone(),
                focus_goal_minutes: None,
                current_task_id: None,
                suggested_task_id: None,
            })
            .await
            .map_err(DailyPlanServiceError::Database)?;
        let saved_priorities = plans
            .list_items(&daily_plan.id)
            .await
            .map_err(DailyPlanServiceError::Database)?;

        let tasks = weekly_tasks
            .list(ListWeeklyTasksInput {
                week_start_date: monday,
                week_end_date: friday,
                project_ids: None,
                classification: None,
                task_type: None,
                status: None,
                included_in_report: None,
            })
            .await
            .map_err(DailyPlanServiceError::Database)?;

        let focus = focus_sessions
            .list(ListFocusSessionsInput {
                from: Some(date.clone()),
                to: Some(date.clone()),
                status: None,
                project_ids: None,
            })
            .await
            .map_err(DailyPlanServiceError::Database)?;
        let active_focus = focus_sessions
            .active()
            .await
            .map_err(DailyPlanServiceError::Database)?;
        let logs = manual_logs
            .list_by_date_range(&date, &date)
            .await
            .map_err(DailyPlanServiceError::Database)?;
        let meetings = calendar_events
            .list(ListCalendarEventsInput {
                from: format!("{date}T00:00:00Z"),
                to: format!("{date}T23:59:59Z"),
                source_id: None,
            })
            .await
            .map_err(DailyPlanServiceError::Database)?
            .into_iter()
            .filter(|event| !event.is_cancelled)
            .collect::<Vec<_>>();

        let top_priorities =
            effective_top_priorities(&saved_priorities, &tasks, &daily_plan, &date);
        let current_task = resolve_current_task(&daily_plan, &active_focus, &tasks);
        let suggested_next_task = resolve_suggested_task(&daily_plan, &top_priorities, &tasks);
        let focus_actual_minutes = total_focus_minutes(&focus, &active_focus);
        let planned_vs_actual = compute_plan_vs_actual(&top_priorities, &tasks, &focus);
        let planned_total = planned_vs_actual
            .iter()
            .map(|item| item.planned_minutes)
            .sum::<i32>();
        let actual_total = planned_vs_actual
            .iter()
            .map(|item| item.actual_minutes)
            .sum::<i32>()
            + non_focus_manual_minutes(&logs);
        let completed_priorities = top_priorities
            .iter()
            .filter(|item| item.status == DailyPlanItemStatus::Done)
            .count() as i32;
        let end_of_day_progress = EndOfDayProgress {
            completed_priorities,
            total_priorities: top_priorities.len() as i32,
            planned_minutes: planned_total,
            actual_minutes: actual_total,
            variance_minutes: actual_total - planned_total,
        };
        let distraction_risk =
            compute_distraction_risk(&planned_vs_actual, &logs, actual_total, &active_focus);

        Ok(TodayCommandCenter {
            date,
            daily_plan: daily_plan.clone(),
            top_priorities,
            meetings,
            focus_goal_minutes: daily_plan.focus_goal_minutes,
            focus_actual_minutes,
            current_task,
            suggested_next_task,
            distraction_risk,
            end_of_day_progress,
            planned_vs_actual,
        })
    }
}

#[derive(Debug)]
pub enum DailyPlanServiceError {
    Validation(String),
    Database(sqlx::Error),
}

fn validate_date(value: &str) -> Result<(), DailyPlanServiceError> {
    if value.trim().is_empty() {
        return Err(DailyPlanServiceError::Validation(
            "Date is required".to_string(),
        ));
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| DailyPlanServiceError::Validation("Date must be YYYY-MM-DD".to_string()))?;
    Ok(())
}

fn validate_item(item: &ReplaceDailyPlanItemInput) -> Result<(), DailyPlanServiceError> {
    if item.rank < 1 || item.rank > 3 {
        return Err(DailyPlanServiceError::Validation(
            "Priority rank must be between 1 and 3".to_string(),
        ));
    }
    if item.title.trim().is_empty() {
        return Err(DailyPlanServiceError::Validation(
            "Priority title is required".to_string(),
        ));
    }
    if item
        .planned_minutes
        .map(|minutes| minutes <= 0 || minutes > 24 * 60)
        .unwrap_or(false)
    {
        return Err(DailyPlanServiceError::Validation(
            "Planned minutes must be between 1 and 1440".to_string(),
        ));
    }
    Ok(())
}

fn monday_for_date(date: &str) -> Result<String, DailyPlanServiceError> {
    let d = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| DailyPlanServiceError::Validation("Invalid date".to_string()))?;
    let offset = d.weekday().num_days_from_monday() as i64;
    Ok((d - Duration::days(offset)).format("%Y-%m-%d").to_string())
}

fn resolve_current_task(
    plan: &DailyPlan,
    active_focus: &Option<FocusSession>,
    tasks: &[WeeklyTask],
) -> Option<WeeklyTask> {
    if let Some(task_id) = &plan.current_task_id {
        if let Some(task) = tasks.iter().find(|task| &task.id == task_id) {
            return Some(task.clone());
        }
    }
    if let Some(active) = active_focus {
        if let Some(task_id) = &active.task_id {
            if let Some(task) = tasks.iter().find(|task| &task.id == task_id) {
                return Some(task.clone());
            }
        }
    }
    tasks
        .iter()
        .find(|task| task.status == WeeklyTaskStatus::InProgress)
        .cloned()
}

fn effective_top_priorities(
    saved_priorities: &[DailyPlanItem],
    tasks: &[WeeklyTask],
    plan: &DailyPlan,
    date: &str,
) -> Vec<DailyPlanItem> {
    if !saved_priorities.is_empty() {
        return saved_priorities.to_vec();
    }

    let mut eligible = tasks
        .iter()
        .filter(|task| {
            task.status != WeeklyTaskStatus::Completed
                && task.status != WeeklyTaskStatus::Dropped
                && task
                    .target_date
                    .as_deref()
                    .map(|target| target <= date)
                    .unwrap_or(true)
        })
        .cloned()
        .collect::<Vec<_>>();

    eligible.sort_by_key(|task| {
        (
            priority_rank(&task.priority),
            task.target_date
                .clone()
                .unwrap_or_else(|| "9999-12-31".to_string()),
            task.created_at.clone(),
        )
    });

    eligible
        .into_iter()
        .take(3)
        .enumerate()
        .map(|(index, task)| {
            let planned_minutes = task
                .estimated_minutes
                .or_else(|| Some(default_planned_minutes(&task.priority)));
            DailyPlanItem {
                id: format!("suggested_daily_plan_item_{}", task.id),
                daily_plan_id: plan.id.clone(),
                rank: index as i32 + 1,
                title: task.title,
                weekly_task_id: Some(task.id),
                planned_minutes,
                status: DailyPlanItemStatus::Todo,
                created_at: plan.updated_at.clone(),
                updated_at: plan.updated_at.clone(),
            }
        })
        .collect()
}

fn resolve_suggested_task(
    plan: &DailyPlan,
    priorities: &[DailyPlanItem],
    tasks: &[WeeklyTask],
) -> Option<WeeklyTask> {
    if let Some(task_id) = &plan.suggested_task_id {
        if let Some(task) = tasks.iter().find(|task| &task.id == task_id) {
            return Some(task.clone());
        }
    }
    for item in priorities {
        if item.status == DailyPlanItemStatus::Done || item.status == DailyPlanItemStatus::Dropped {
            continue;
        }
        if let Some(task_id) = &item.weekly_task_id {
            if let Some(task) = tasks.iter().find(|task| &task.id == task_id) {
                if task.status == WeeklyTaskStatus::Todo
                    || task.status == WeeklyTaskStatus::InProgress
                {
                    return Some(task.clone());
                }
            }
        }
    }
    let mut open_tasks = tasks
        .iter()
        .filter(|task| {
            task.status == WeeklyTaskStatus::Todo || task.status == WeeklyTaskStatus::InProgress
        })
        .cloned()
        .collect::<Vec<_>>();
    open_tasks.sort_by_key(|task| {
        (
            priority_rank(&task.priority),
            task.target_date
                .clone()
                .unwrap_or_else(|| "9999-12-31".to_string()),
            task.created_at.clone(),
        )
    });
    open_tasks.first().cloned()
}

fn priority_rank(priority: &WeeklyTaskPriority) -> i32 {
    match priority {
        WeeklyTaskPriority::High => 0,
        WeeklyTaskPriority::Normal => 1,
        WeeklyTaskPriority::Low => 2,
    }
}

fn default_planned_minutes(priority: &WeeklyTaskPriority) -> i32 {
    match priority {
        WeeklyTaskPriority::High => 90,
        WeeklyTaskPriority::Normal => 60,
        WeeklyTaskPriority::Low => 30,
    }
}

fn total_focus_minutes(focus: &[FocusSession], active_focus: &Option<FocusSession>) -> i32 {
    let mut total = focus
        .iter()
        .filter(|session| session.status.as_storage_value() == "completed")
        .map(|session| session.duration_minutes.unwrap_or(0).max(0) as i32)
        .sum::<i32>();
    if let Some(active) = active_focus {
        if active.status.as_storage_value() == "active" {
            let started = chrono::DateTime::parse_from_rfc3339(&active.started_at).ok();
            if let Some(started) = started {
                let minutes = (Utc::now().timestamp() - started.timestamp()) / 60;
                total += minutes.max(0) as i32;
            }
        }
    }
    total
}

fn compute_plan_vs_actual(
    priorities: &[DailyPlanItem],
    tasks: &[WeeklyTask],
    focus: &[FocusSession],
) -> Vec<PlannedVsActualItem> {
    priorities
        .iter()
        .map(|item| {
            let linked_task = item
                .weekly_task_id
                .as_ref()
                .and_then(|id| tasks.iter().find(|task| &task.id == id));
            let planned = item
                .planned_minutes
                .or_else(|| linked_task.and_then(|task| task.estimated_minutes))
                .unwrap_or_else(|| {
                    linked_task
                        .map(|task| default_planned_minutes(&task.priority))
                        .unwrap_or(60)
                })
                .max(1);
            let actual = item
                .weekly_task_id
                .as_ref()
                .map(|task_id| {
                    focus
                        .iter()
                        .filter(|session| session.task_id.as_deref() == Some(task_id.as_str()))
                        .map(|session| session.duration_minutes.unwrap_or(0).max(0) as i32)
                        .sum::<i32>()
                })
                .unwrap_or(0);
            let ratio = if planned > 0 {
                Some(actual as f64 / planned as f64)
            } else {
                None
            };
            let status = match ratio {
                Some(value) if value < 0.9 => "under",
                Some(value) if value > 1.25 => "over",
                _ => "met",
            }
            .to_string();

            PlannedVsActualItem {
                item_id: item.id.clone(),
                title: item.title.clone(),
                planned_minutes: planned,
                actual_minutes: actual,
                variance_minutes: actual - planned,
                ratio,
                status,
            }
        })
        .collect()
}

fn non_focus_manual_minutes(logs: &[ManualLog]) -> i32 {
    logs.iter()
        .filter(|log| log.activity_type != ActivityType::Meeting)
        .map(|log| log.duration_minutes.unwrap_or(0).max(0) as i32)
        .sum::<i32>()
}

fn compute_distraction_risk(
    plan_vs_actual: &[PlannedVsActualItem],
    logs: &[ManualLog],
    actual_total: i32,
    active_focus: &Option<FocusSession>,
) -> DistractionRisk {
    let mut score = 0f64;
    let mut reasons = Vec::new();
    let planned_total = plan_vs_actual
        .iter()
        .map(|item| item.planned_minutes)
        .sum::<i32>();
    let actual_on_planned = plan_vs_actual
        .iter()
        .map(|item| item.actual_minutes)
        .sum::<i32>();
    let coverage = if planned_total > 0 {
        actual_on_planned as f64 / planned_total as f64
    } else {
        1.0
    };
    let distraction_minutes = logs
        .iter()
        .filter(|log| {
            matches!(
                log.activity_type,
                ActivityType::Support | ActivityType::ClientFeedback | ActivityType::Meeting
            )
        })
        .map(|log| log.duration_minutes.unwrap_or(0).max(0) as i32)
        .sum::<i32>();
    let distraction_ratio = distraction_minutes as f64 / actual_total.max(1) as f64;
    score += 40.0 * (distraction_ratio / 0.35).clamp(0.0, 1.0);
    if distraction_minutes > 0 {
        reasons.push(format!("{distraction_minutes}m likely distraction context"));
    }
    if coverage < 0.5 {
        score += 20.0;
        reasons.push("Low planned-work coverage".to_string());
    }
    let unplanned = (actual_total - actual_on_planned).max(0);
    if unplanned > 90 {
        score += 15.0;
        reasons.push("High unplanned work time".to_string());
    }
    if let Some(active) = active_focus {
        if active.status.as_storage_value() == "active" {
            if let Ok(started) = chrono::DateTime::parse_from_rfc3339(&active.started_at) {
                let minutes = (Utc::now().timestamp() - started.timestamp()) / 60;
                if minutes > 120 {
                    score += 15.0;
                    reasons.push("Active focus session running > 120m".to_string());
                }
            }
        }
    }
    let level = if score >= 65.0 {
        "high"
    } else if score >= 35.0 {
        "medium"
    } else {
        "low"
    };
    DistractionRisk {
        level: level.to_string(),
        score: score.round().clamp(0.0, 100.0) as i32,
        reasons,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::weekly_task::{WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType};

    fn plan() -> DailyPlan {
        DailyPlan {
            id: "daily_plan_1".to_string(),
            date: "2026-05-28".to_string(),
            focus_goal_minutes: 240,
            current_task_id: None,
            suggested_task_id: None,
            created_at: "2026-05-28T08:00:00Z".to_string(),
            updated_at: "2026-05-28T08:00:00Z".to_string(),
        }
    }

    fn task(
        id: &str,
        title: &str,
        status: WeeklyTaskStatus,
        priority: WeeklyTaskPriority,
        target_date: Option<&str>,
        estimated_minutes: Option<i32>,
        created_at: &str,
    ) -> WeeklyTask {
        WeeklyTask {
            id: id.to_string(),
            project_id: None,
            project_name: None,
            task_type: WeeklyTaskType::PlannedWork,
            status,
            title: title.to_string(),
            details: None,
            week_start_date: "2026-05-25".to_string(),
            target_date: target_date.map(str::to_string),
            completed_at: None,
            priority,
            included_in_report: false,
            progress_percent: None,
            estimated_minutes,
            created_at: created_at.to_string(),
            updated_at: created_at.to_string(),
        }
    }

    fn saved_item() -> DailyPlanItem {
        DailyPlanItem {
            id: "daily_plan_item_1".to_string(),
            daily_plan_id: "daily_plan_1".to_string(),
            rank: 1,
            title: "Saved priority".to_string(),
            weekly_task_id: None,
            planned_minutes: Some(45),
            status: DailyPlanItemStatus::Todo,
            created_at: "2026-05-28T08:00:00Z".to_string(),
            updated_at: "2026-05-28T08:00:00Z".to_string(),
        }
    }

    #[test]
    fn suggests_top_three_today_tasks_when_no_priorities_are_saved() {
        let plan = plan();
        let tasks = vec![
            task(
                "normal",
                "Normal task",
                WeeklyTaskStatus::Todo,
                WeeklyTaskPriority::Normal,
                Some("2026-05-28"),
                Some(50),
                "2026-05-28T10:00:00Z",
            ),
            task(
                "high",
                "High task",
                WeeklyTaskStatus::Todo,
                WeeklyTaskPriority::High,
                Some("2026-05-28"),
                None,
                "2026-05-28T11:00:00Z",
            ),
            task(
                "low",
                "Low task",
                WeeklyTaskStatus::InProgress,
                WeeklyTaskPriority::Low,
                None,
                Some(20),
                "2026-05-28T09:00:00Z",
            ),
            task(
                "extra",
                "Extra task",
                WeeklyTaskStatus::Todo,
                WeeklyTaskPriority::Low,
                None,
                None,
                "2026-05-28T12:00:00Z",
            ),
        ];

        let priorities = effective_top_priorities(&[], &tasks, &plan, "2026-05-28");

        assert_eq!(priorities.len(), 3);
        assert_eq!(priorities[0].title, "High task");
        assert_eq!(priorities[0].weekly_task_id.as_deref(), Some("high"));
        assert_eq!(priorities[0].planned_minutes, Some(90));
        assert_eq!(priorities[1].title, "Normal task");
        assert_eq!(priorities[1].planned_minutes, Some(50));
        assert_eq!(priorities[2].title, "Low task");
    }

    #[test]
    fn saved_priorities_win_over_suggestions() {
        let plan = plan();
        let saved = vec![saved_item()];
        let tasks = vec![task(
            "high",
            "High task",
            WeeklyTaskStatus::Todo,
            WeeklyTaskPriority::High,
            None,
            None,
            "2026-05-28T09:00:00Z",
        )];

        let priorities = effective_top_priorities(&saved, &tasks, &plan, "2026-05-28");

        assert_eq!(priorities, saved);
    }

    #[test]
    fn suggestions_exclude_done_dropped_and_future_tasks() {
        let plan = plan();
        let tasks = vec![
            task(
                "done",
                "Done task",
                WeeklyTaskStatus::Completed,
                WeeklyTaskPriority::High,
                Some("2026-05-28"),
                None,
                "2026-05-28T09:00:00Z",
            ),
            task(
                "dropped",
                "Dropped task",
                WeeklyTaskStatus::Dropped,
                WeeklyTaskPriority::High,
                Some("2026-05-28"),
                None,
                "2026-05-28T09:00:00Z",
            ),
            task(
                "future",
                "Future task",
                WeeklyTaskStatus::Todo,
                WeeklyTaskPriority::High,
                Some("2026-05-29"),
                None,
                "2026-05-28T09:00:00Z",
            ),
            task(
                "today",
                "Today task",
                WeeklyTaskStatus::Blocked,
                WeeklyTaskPriority::Normal,
                Some("2026-05-28"),
                None,
                "2026-05-28T09:00:00Z",
            ),
        ];

        let priorities = effective_top_priorities(&[], &tasks, &plan, "2026-05-28");

        assert_eq!(priorities.len(), 1);
        assert_eq!(priorities[0].weekly_task_id.as_deref(), Some("today"));
    }

    #[test]
    fn suggested_priorities_drive_plan_vs_actual_minutes() {
        let plan = plan();
        let tasks = vec![task(
            "high",
            "High task",
            WeeklyTaskStatus::Todo,
            WeeklyTaskPriority::High,
            None,
            None,
            "2026-05-28T09:00:00Z",
        )];
        let priorities = effective_top_priorities(&[], &tasks, &plan, "2026-05-28");

        let plan_vs_actual = compute_plan_vs_actual(&priorities, &tasks, &[]);

        assert_eq!(plan_vs_actual.len(), 1);
        assert_eq!(plan_vs_actual[0].planned_minutes, 90);
        assert_eq!(plan_vs_actual[0].actual_minutes, 0);
        assert_eq!(plan_vs_actual[0].status, "under");
    }
}
