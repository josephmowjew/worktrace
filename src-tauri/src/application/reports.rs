use crate::domain::activity::{ActivityDay, ListActivityInput};
use crate::domain::activity_group::{ActivityGroup, ListActivityGroupsInput};
use crate::domain::report::{
    CreateReportNoteInput, GenerateReportInput, GeneratedReport, ListReportNotesInput, Report,
    ReportNote, ReportSummary, SaveDailyReviewNoteInput, SaveReportInput, UpdateReportNoteInput,
};
use crate::domain::weekly_task::{ListWeeklyTasksInput, WeeklyTask, WeeklyTaskType};
use crate::infrastructure::database::repositories::{
    ActivityGroupRepository, ActivityRepository, GitMetadataRepository, ReportNoteRepository,
    ReportRepository, WeeklyTaskRepository,
};
use std::collections::HashSet;

pub struct ReportService;

impl ReportService {
    pub async fn generate(
        activity_repository: &ActivityRepository<'_>,
        activity_group_repository: &ActivityGroupRepository<'_>,
        weekly_task_repository: &WeeklyTaskRepository<'_>,
        report_note_repository: &ReportNoteRepository<'_>,
        git_metadata_repository: &GitMetadataRepository<'_>,
        input: GenerateReportInput,
    ) -> Result<GeneratedReport, ReportServiceError> {
        validate_range(&input.start_date, &input.end_date)?;
        let (git_refs, worktree_paths) = resolve_git_focus(
            git_metadata_repository,
            input.project_ids.as_deref(),
            &input,
        )
        .await?;

        let mut sections = Vec::new();
        if input.include_commits.unwrap_or(true) {
            sections.push("commit".to_string());
        }
        if input.include_manual_logs.unwrap_or(true) {
            sections.push("manual".to_string());
        }
        if input.include_weekly_tasks.unwrap_or(true) {
            sections.push("weekly_tasks".to_string());
        }

        let activity = activity_repository
            .list(ListActivityInput {
                from: input.start_date.clone(),
                to: input.end_date.clone(),
                activity_type: None,
                project_ids: input.project_ids.clone(),
                workspace_ids: None,
                classification: normalize_report_classification(&input.classification),
                git_refs: git_refs.clone(),
                worktree_paths: worktree_paths.clone(),
            })
            .await
            .map_err(ReportServiceError::Database)?;
        let activity_groups = activity_group_repository
            .list(ListActivityGroupsInput {
                from: input.start_date.clone(),
                to: input.end_date.clone(),
                project_ids: input.project_ids.clone(),
                workspace_ids: None,
                classification: normalize_report_classification(&input.classification),
                git_refs: git_refs.clone(),
                worktree_paths: worktree_paths.clone(),
                include_hidden: input.include_hidden,
            })
            .await
            .map_err(ReportServiceError::Database)?;
        let weekly_tasks = if input.include_weekly_tasks.unwrap_or(true) {
            weekly_task_repository
                .list(ListWeeklyTasksInput {
                    week_start_date: input.start_date.clone(),
                    week_end_date: input.end_date.clone(),
                    project_ids: input.project_ids.clone(),
                    classification: normalize_report_classification(&input.classification),
                    task_type: None,
                    status: None,
                    included_in_report: None,
                })
                .await
                .map_err(ReportServiceError::Database)?
        } else {
            Vec::new()
        };
        let report_notes = report_note_repository
            .list_for_report(
                &input.start_date,
                &input.end_date,
                &input.project_ids,
                &normalize_report_classification(&input.classification),
            )
            .await
            .map_err(ReportServiceError::Database)?;

        let include_hidden = input.include_hidden.unwrap_or(false);
        let content = render_markdown(
            &input.start_date,
            &input.end_date,
            input.recipient_name.as_deref(),
            &activity,
            &activity_groups,
            &weekly_tasks,
            &report_notes,
            &sections,
            include_hidden,
        );

        Ok(GeneratedReport {
            title: format!("Weekly Report {} to {}", input.start_date, input.end_date),
            start_date: input.start_date,
            end_date: input.end_date,
            recipient_name: input.recipient_name,
            content,
        })
    }

    pub async fn save(
        repository: &ReportRepository<'_>,
        input: SaveReportInput,
    ) -> Result<Report, ReportServiceError> {
        if input.title.trim().is_empty() {
            return Err(ReportServiceError::Validation(
                "Report title is required".to_string(),
            ));
        }
        validate_range(&input.start_date, &input.end_date)?;
        if input.content.trim().is_empty() {
            return Err(ReportServiceError::Validation(
                "Report content is required".to_string(),
            ));
        }

        repository
            .save(input)
            .await
            .map_err(ReportServiceError::Database)
    }

    pub async fn list(
        repository: &ReportRepository<'_>,
    ) -> Result<Vec<ReportSummary>, sqlx::Error> {
        repository.list().await
    }

    pub async fn get(
        repository: &ReportRepository<'_>,
        id: &str,
    ) -> Result<Option<Report>, sqlx::Error> {
        repository.get(id).await
    }

    pub async fn list_notes(
        repository: &ReportNoteRepository<'_>,
        input: ListReportNotesInput,
    ) -> Result<Vec<ReportNote>, ReportServiceError> {
        validate_range(&input.from, &input.to)?;
        repository
            .list_by_date_range(&input.from, &input.to)
            .await
            .map_err(ReportServiceError::Database)
    }

    pub async fn save_daily_review_note(
        repository: &ReportNoteRepository<'_>,
        input: SaveDailyReviewNoteInput,
    ) -> Result<ReportNote, ReportServiceError> {
        if input.date.trim().is_empty() {
            return Err(ReportServiceError::Validation(
                "Review date is required".to_string(),
            ));
        }

        let content = daily_review_content(&input);
        if content.trim().is_empty() {
            return Err(ReportServiceError::Validation(
                "Review content is required".to_string(),
            ));
        }

        if let Some(existing) = repository
            .find_daily_review_by_date(&input.date)
            .await
            .map_err(ReportServiceError::Database)?
        {
            return repository
                .update(
                    &existing.id,
                    UpdateReportNoteInput {
                        project_id: None,
                        note_type: Some("daily_review".to_string()),
                        date: Some(input.date),
                        content: Some(content),
                        included_in_report: Some(input.included_in_report.unwrap_or(true)),
                    },
                )
                .await
                .map_err(ReportServiceError::Database)?
                .ok_or_else(|| {
                    ReportServiceError::Validation("Daily review note was not found".to_string())
                });
        }

        repository
            .create(CreateReportNoteInput {
                project_id: None,
                note_type: "daily_review".to_string(),
                date: input.date,
                content,
                included_in_report: Some(input.included_in_report.unwrap_or(true)),
            })
            .await
            .map_err(ReportServiceError::Database)
    }
}

#[derive(Debug)]
pub enum ReportServiceError {
    Validation(String),
    Database(sqlx::Error),
}

fn validate_range(start_date: &str, end_date: &str) -> Result<(), ReportServiceError> {
    if start_date.trim().is_empty() || end_date.trim().is_empty() {
        return Err(ReportServiceError::Validation(
            "Report date range is required".to_string(),
        ));
    }

    Ok(())
}

fn normalize_report_classification(value: &Option<String>) -> Option<String> {
    match value.as_deref().map(str::trim) {
        Some("work") => Some("work".to_string()),
        Some("personal") => Some("personal".to_string()),
        Some("unclassified") => Some("unclassified".to_string()),
        _ => None,
    }
}

async fn resolve_git_focus(
    git_metadata_repository: &GitMetadataRepository<'_>,
    project_ids: Option<&[String]>,
    input: &GenerateReportInput,
) -> Result<
    (
        Option<Vec<crate::domain::git_metadata::GitRefFilter>>,
        Option<Vec<String>>,
    ),
    ReportServiceError,
> {
    if input.git_refs.is_some() || input.worktree_paths.is_some() {
        return Ok((input.git_refs.clone(), input.worktree_paths.clone()));
    }

    if input.use_project_git_focus.unwrap_or(true) {
        let (refs, worktree_paths) = git_metadata_repository
            .focus_for_projects(project_ids)
            .await
            .map_err(ReportServiceError::Database)?;
        return Ok((
            if refs.is_empty() { None } else { Some(refs) },
            if worktree_paths.is_empty() {
                None
            } else {
                Some(worktree_paths)
            },
        ));
    }

    Ok((None, None))
}

fn render_markdown(
    start_date: &str,
    end_date: &str,
    recipient_name: Option<&str>,
    days: &[ActivityDay],
    activity_groups: &[ActivityGroup],
    weekly_tasks: &[WeeklyTask],
    report_notes: &[ReportNote],
    sections: &[String],
    include_hidden: bool,
) -> String {
    let mut lines = Vec::new();
    lines.push(format!("# Weekly Report: {start_date} to {end_date}"));
    if let Some(recipient_name) = recipient_name.filter(|value| !value.trim().is_empty()) {
        lines.push(format!("To: {recipient_name}"));
    }
    lines.push(String::new());

    let items = days
        .iter()
        .flat_map(|day| day.items.iter().map(move |item| (day.date.as_str(), item)))
        .filter(|(_, item)| include_hidden || item.included_in_report)
        .filter(|(_, item)| {
            (sections.iter().any(|section| section == "commit") && item.activity_type == "commit")
                || (sections.iter().any(|section| section == "manual")
                    && item.activity_type != "commit")
        })
        .collect::<Vec<_>>();

    lines.push("## Summary".to_string());
    lines.push(format!("- Total report items: {}", items.len()));
    lines.push(format!(
        "- Commits: {}",
        if activity_groups.is_empty() {
            items
                .iter()
                .filter(|(_, item)| item.activity_type == "commit")
                .count()
        } else {
            activity_groups
                .iter()
                .filter(|group| include_hidden || group.included_in_report)
                .map(|group| group.items.len())
                .sum()
        }
    ));
    lines.push(format!(
        "- Manual activities: {}",
        items
            .iter()
            .filter(|(_, item)| item.activity_type != "commit")
            .count()
    ));
    lines.push(format!(
        "- Weekly plan items: {}",
        weekly_tasks
            .iter()
            .filter(|task| include_hidden || task.included_in_report)
            .count()
    ));
    lines.push(String::new());

    render_daily_review_notes(&mut lines, report_notes, include_hidden);

    if items.is_empty() && activity_groups.is_empty() && weekly_tasks.is_empty() {
        lines.push("## Activity".to_string());
        lines.push("- No report-ready activity found for this range.".to_string());
        return lines.join("\n");
    }

    if !activity_groups.is_empty() && sections.iter().any(|section| section == "commit") {
        render_activity_groups(&mut lines, activity_groups, include_hidden);
    }

    let grouped_commit_ids = activity_groups
        .iter()
        .flat_map(|group| group.items.iter().map(|item| item.source_id.as_str()))
        .collect::<HashSet<_>>();
    let raw_items = items
        .into_iter()
        .filter(|(_, item)| {
            item.activity_type != "commit" || !grouped_commit_ids.contains(item.id.as_str())
        })
        .collect::<Vec<_>>();

    if !raw_items.is_empty() {
        lines.push("## Activity".to_string());
        let mut current_date = "";
        let mut current_project = "";

        for (date, item) in raw_items {
            if date != current_date {
                current_date = date;
                current_project = "";
                lines.push(String::new());
                lines.push(format!("### {date}"));
            }

            let project_name = item.project_name.as_deref().unwrap_or("General");
            if project_name != current_project {
                current_project = project_name;
                lines.push(format!("#### {project_name}"));
            }

            lines.push(format!(
                "- **{}:** {}",
                label_activity(&item.activity_type),
                item.summary
            ));
        }
    }

    if sections.iter().any(|section| section == "weekly_tasks") {
        render_weekly_tasks(&mut lines, weekly_tasks, include_hidden);
    }

    lines.join("\n")
}

fn render_daily_review_notes(
    lines: &mut Vec<String>,
    report_notes: &[ReportNote],
    include_hidden: bool,
) {
    let notes = report_notes
        .iter()
        .filter(|note| note.note_type == "daily_review")
        .filter(|note| include_hidden || note.included_in_report)
        .collect::<Vec<_>>();

    if notes.is_empty() {
        return;
    }

    lines.push("## Daily Review Notes".to_string());
    for note in notes {
        lines.push(String::new());
        lines.push(format!("### {}", note.date));
        lines.push(note.content.clone());
    }
    lines.push(String::new());
}

fn render_activity_groups(
    lines: &mut Vec<String>,
    activity_groups: &[ActivityGroup],
    include_hidden: bool,
) {
    let groups = activity_groups
        .iter()
        .filter(|group| include_hidden || group.included_in_report)
        .collect::<Vec<_>>();

    if groups.is_empty() {
        return;
    }

    lines.push("## Grouped Work".to_string());
    let mut current_project = "";
    for group in groups {
        let project = group.project_name.as_deref().unwrap_or("General");
        if project != current_project {
            current_project = project;
            lines.push(String::new());
            lines.push(format!("### {project}"));
        }

        let details = group
            .report_summary
            .as_ref()
            .or(group.summary.as_ref())
            .filter(|value| !value.trim().is_empty())
            .map(|summary| format!(" - {}", summary.replace('\n', "; ")))
            .unwrap_or_default();
        lines.push(format!("- **{}**{}", group.title, details));
    }
    lines.push(String::new());
}

fn render_weekly_tasks(lines: &mut Vec<String>, tasks: &[WeeklyTask], include_hidden: bool) {
    let visible_tasks = tasks
        .iter()
        .filter(|task| include_hidden || task.included_in_report)
        .collect::<Vec<_>>();

    for (heading, task_type) in [
        ("Completed Checklist", WeeklyTaskType::CompletedChecklist),
        ("Blockers", WeeklyTaskType::Blocker),
        ("Carryovers", WeeklyTaskType::Carryover),
        ("Planned Work", WeeklyTaskType::PlannedWork),
        ("Follow-ups", WeeklyTaskType::FollowUp),
    ] {
        let section_tasks = visible_tasks
            .iter()
            .filter(|task| task.task_type == task_type)
            .collect::<Vec<_>>();

        if section_tasks.is_empty() {
            continue;
        }

        lines.push(String::new());
        lines.push(format!("## {heading}"));
        for task in section_tasks {
            let project = task.project_name.as_deref().unwrap_or("General");
            let details = task
                .details
                .as_ref()
                .filter(|value| !value.trim().is_empty())
                .map(|value| format!(" - {value}"))
                .unwrap_or_default();
            lines.push(format!(
                "- **{}** [{} / {}]{}",
                task.title,
                project,
                task.status.as_storage_value(),
                details
            ));
        }
    }
}

fn label_activity(value: &str) -> String {
    if value == "commit" {
        return "Commit".to_string();
    }

    value.replace('_', " ")
}

fn daily_review_content(input: &SaveDailyReviewNoteInput) -> String {
    let mut sections = Vec::new();

    if !input.finished.trim().is_empty() {
        sections.push(format!("### Finished today\n{}", input.finished.trim()));
    }
    if !input.blocked.trim().is_empty() {
        sections.push(format!("### Blocked\n{}", input.blocked.trim()));
    }
    if !input.carry_into_tomorrow.trim().is_empty() {
        sections.push(format!(
            "### Carry into tomorrow\n{}",
            input.carry_into_tomorrow.trim()
        ));
    }

    sections.join("\n\n")
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    use super::*;
    use crate::domain::commit::Commit;
    use crate::domain::manual_log::{ActivityType, CreateManualLogInput};
    use crate::domain::project::CreateProjectInput;
    use crate::domain::weekly_task::{
        CreateWeeklyTaskInput, WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType,
    };
    use crate::infrastructure::database::migrations::run_migrations;
    use crate::infrastructure::database::repositories::{
        CommitRepository, ManualLogRepository, ProjectRepository, ReportNoteRepository,
        WeeklyTaskRepository,
    };

    #[tokio::test]
    async fn generate_report_renders_commits_and_manual_logs() {
        let pool = test_pool().await;

        let project = ProjectRepository::new(&pool)
            .create(CreateProjectInput {
                name: "WorkTrace".to_string(),
                description: None,
                repo_path: None,
                github_url: None,
                project_type: Some("Company".to_string()),
                classification: None,
            })
            .await
            .expect("create project");

        CommitRepository::new(&pool)
            .upsert(&Commit {
                id: "commit_report_1".to_string(),
                project_id: project.id.clone(),
                commit_hash: "abc123".to_string(),
                message: "feat: generate weekly reports".to_string(),
                author_name: None,
                author_email: None,
                branch: Some("main".to_string()),
                committed_at: "2026-05-20T10:00:00Z".to_string(),
                files_changed: Some(1),
                insertions: Some(10),
                deletions: Some(2),
                included_in_report: true,
            })
            .await
            .expect("insert commit");

        ManualLogRepository::new(&pool)
            .create(CreateManualLogInput {
                project_id: Some(project.id),
                date: "2026-05-20".to_string(),
                activity_type: ActivityType::Meeting,
                summary: "Reviewed weekly priorities".to_string(),
                outcome: None,
                duration_minutes: Some(30),
                follow_up: None,
                included_in_report: Some(true),
            })
            .await
            .expect("create manual log");

        WeeklyTaskRepository::new(&pool)
            .create(CreateWeeklyTaskInput {
                project_id: None,
                task_type: WeeklyTaskType::Blocker,
                status: Some(WeeklyTaskStatus::Blocked),
                title: "Waiting on deployment credentials".to_string(),
                details: Some("Need access before release can continue".to_string()),
                week_start_date: "2026-05-19".to_string(),
                target_date: None,
                completed_at: None,
                priority: Some(WeeklyTaskPriority::High),
                included_in_report: Some(true),
                progress_percent: None,
                estimated_minutes: None,
            })
            .await
            .expect("create weekly task");

        let report = ReportService::generate(
            &ActivityRepository::new(&pool),
            &ActivityGroupRepository::new(&pool),
            &WeeklyTaskRepository::new(&pool),
            &ReportNoteRepository::new(&pool),
            &GitMetadataRepository::new(&pool),
            GenerateReportInput {
                start_date: "2026-05-19".to_string(),
                end_date: "2026-05-21".to_string(),
                recipient_name: Some("Manager".to_string()),
                project_ids: None,
                classification: None,
                git_refs: None,
                worktree_paths: None,
                use_project_git_focus: Some(false),
                include_commits: Some(true),
                include_manual_logs: Some(true),
                include_weekly_tasks: Some(true),
                include_hidden: Some(false),
            },
        )
        .await
        .expect("generate report");

        assert!(report.content.contains("feat: generate weekly reports"));
        assert!(report.content.contains("Reviewed weekly priorities"));
        assert!(report.content.contains("## Blockers"));
        assert!(report.content.contains("Waiting on deployment credentials"));
        assert!(report.content.contains("To: Manager"));
    }

    #[tokio::test]
    async fn daily_review_note_save_updates_existing_note() {
        let pool = test_pool().await;
        let repository = ReportNoteRepository::new(&pool);

        let first = ReportService::save_daily_review_note(
            &repository,
            SaveDailyReviewNoteInput {
                date: "2026-05-20".to_string(),
                finished: "- First pass".to_string(),
                blocked: String::new(),
                carry_into_tomorrow: "- Follow up".to_string(),
                included_in_report: Some(true),
            },
        )
        .await
        .expect("save first note");

        let second = ReportService::save_daily_review_note(
            &repository,
            SaveDailyReviewNoteInput {
                date: "2026-05-20".to_string(),
                finished: "- Updated pass".to_string(),
                blocked: "- Waiting on review".to_string(),
                carry_into_tomorrow: String::new(),
                included_in_report: Some(true),
            },
        )
        .await
        .expect("update note");

        let notes = repository
            .list_by_date_range("2026-05-20", "2026-05-20")
            .await
            .expect("list notes");

        assert_eq!(first.id, second.id);
        assert_eq!(notes.len(), 1);
        assert!(notes[0].content.contains("Updated pass"));
        assert!(notes[0].content.contains("Waiting on review"));
    }

    #[tokio::test]
    async fn generate_report_includes_only_included_daily_review_notes() {
        let pool = test_pool().await;
        let repository = ReportNoteRepository::new(&pool);

        repository
            .create(CreateReportNoteInput {
                project_id: None,
                note_type: "daily_review".to_string(),
                date: "2026-05-20".to_string(),
                content: "### Finished today\n- Shipped the review workflow".to_string(),
                included_in_report: Some(true),
            })
            .await
            .expect("create included note");
        repository
            .create(CreateReportNoteInput {
                project_id: None,
                note_type: "daily_review".to_string(),
                date: "2026-05-21".to_string(),
                content: "### Finished today\n- Hidden note".to_string(),
                included_in_report: Some(false),
            })
            .await
            .expect("create hidden note");

        let report = ReportService::generate(
            &ActivityRepository::new(&pool),
            &ActivityGroupRepository::new(&pool),
            &WeeklyTaskRepository::new(&pool),
            &repository,
            &GitMetadataRepository::new(&pool),
            GenerateReportInput {
                start_date: "2026-05-19".to_string(),
                end_date: "2026-05-22".to_string(),
                recipient_name: None,
                project_ids: None,
                classification: None,
                git_refs: None,
                worktree_paths: None,
                use_project_git_focus: Some(false),
                include_commits: Some(true),
                include_manual_logs: Some(true),
                include_weekly_tasks: Some(true),
                include_hidden: Some(false),
            },
        )
        .await
        .expect("generate report");

        assert!(report.content.contains("## Daily Review Notes"));
        assert!(report.content.contains("Shipped the review workflow"));
        assert!(!report.content.contains("Hidden note"));
    }

    #[tokio::test]
    async fn generate_report_filters_by_project_classification() {
        let pool = test_pool().await;
        let projects = ProjectRepository::new(&pool);
        let work_project = projects
            .create(CreateProjectInput {
                name: "Work API".to_string(),
                description: None,
                repo_path: None,
                github_url: None,
                project_type: Some("Backend".to_string()),
                classification: Some("work".to_string()),
            })
            .await
            .expect("create work project");
        let personal_project = projects
            .create(CreateProjectInput {
                name: "Personal Tool".to_string(),
                description: None,
                repo_path: None,
                github_url: None,
                project_type: Some("Tools".to_string()),
                classification: Some("personal".to_string()),
            })
            .await
            .expect("create personal project");

        let logs = ManualLogRepository::new(&pool);
        logs.create(CreateManualLogInput {
            project_id: Some(work_project.id.clone()),
            date: "2026-05-20".to_string(),
            activity_type: ActivityType::Planning,
            summary: "Prepared work launch checklist".to_string(),
            outcome: None,
            duration_minutes: Some(45),
            follow_up: None,
            included_in_report: Some(true),
        })
        .await
        .expect("create work log");
        logs.create(CreateManualLogInput {
            project_id: Some(personal_project.id),
            date: "2026-05-20".to_string(),
            activity_type: ActivityType::Planning,
            summary: "Planned personal app feature".to_string(),
            outcome: None,
            duration_minutes: Some(30),
            follow_up: None,
            included_in_report: Some(true),
        })
        .await
        .expect("create personal log");
        logs.create(CreateManualLogInput {
            project_id: None,
            date: "2026-05-20".to_string(),
            activity_type: ActivityType::Planning,
            summary: "General projectless note".to_string(),
            outcome: None,
            duration_minutes: Some(15),
            follow_up: None,
            included_in_report: Some(true),
        })
        .await
        .expect("create general log");

        let report = ReportService::generate(
            &ActivityRepository::new(&pool),
            &ActivityGroupRepository::new(&pool),
            &WeeklyTaskRepository::new(&pool),
            &ReportNoteRepository::new(&pool),
            &GitMetadataRepository::new(&pool),
            GenerateReportInput {
                start_date: "2026-05-19".to_string(),
                end_date: "2026-05-21".to_string(),
                recipient_name: None,
                project_ids: None,
                classification: Some("work".to_string()),
                git_refs: None,
                worktree_paths: None,
                use_project_git_focus: Some(false),
                include_commits: Some(true),
                include_manual_logs: Some(true),
                include_weekly_tasks: Some(true),
                include_hidden: Some(false),
            },
        )
        .await
        .expect("generate work report");

        assert!(report.content.contains("Prepared work launch checklist"));
        assert!(!report.content.contains("Planned personal app feature"));
        assert!(!report.content.contains("General projectless note"));
    }

    async fn test_pool() -> sqlx::SqlitePool {
        let options = SqliteConnectOptions::new()
            .filename(":memory:")
            .create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .expect("create sqlite test pool");
        run_migrations(&pool).await.expect("run migrations");
        pool
    }
}
