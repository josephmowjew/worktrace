use crate::domain::activity::{ActivityDay, ListActivityInput};
use crate::domain::report::{
    GenerateReportInput, GeneratedReport, Report, ReportSummary, SaveReportInput,
};
use crate::domain::weekly_task::{ListWeeklyTasksInput, WeeklyTask, WeeklyTaskType};
use crate::infrastructure::database::repositories::{
    ActivityRepository, ReportRepository, WeeklyTaskRepository,
};

pub struct ReportService;

impl ReportService {
    pub async fn generate(
        activity_repository: &ActivityRepository<'_>,
        weekly_task_repository: &WeeklyTaskRepository<'_>,
        input: GenerateReportInput,
    ) -> Result<GeneratedReport, ReportServiceError> {
        validate_range(&input.start_date, &input.end_date)?;

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
            })
            .await
            .map_err(ReportServiceError::Database)?;
        let weekly_tasks = if input.include_weekly_tasks.unwrap_or(true) {
            weekly_task_repository
                .list(ListWeeklyTasksInput {
                    week_start_date: input.start_date.clone(),
                    week_end_date: input.end_date.clone(),
                    project_ids: input.project_ids.clone(),
                    task_type: None,
                    status: None,
                    included_in_report: None,
                })
                .await
                .map_err(ReportServiceError::Database)?
        } else {
            Vec::new()
        };

        let include_hidden = input.include_hidden.unwrap_or(false);
        let content = render_markdown(
            &input.start_date,
            &input.end_date,
            input.recipient_name.as_deref(),
            &activity,
            &weekly_tasks,
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

fn render_markdown(
    start_date: &str,
    end_date: &str,
    recipient_name: Option<&str>,
    days: &[ActivityDay],
    weekly_tasks: &[WeeklyTask],
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
        items
            .iter()
            .filter(|(_, item)| item.activity_type == "commit")
            .count()
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

    if items.is_empty() && weekly_tasks.is_empty() {
        lines.push("## Activity".to_string());
        lines.push("- No report-ready activity found for this range.".to_string());
        return lines.join("\n");
    }

    if !items.is_empty() {
        lines.push("## Activity".to_string());
        let mut current_date = "";
        let mut current_project = "";

        for (date, item) in items {
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
        CommitRepository, ManualLogRepository, ProjectRepository, WeeklyTaskRepository,
    };

    #[tokio::test]
    async fn generate_report_renders_commits_and_manual_logs() {
        let options = SqliteConnectOptions::new()
            .filename(":memory:")
            .create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .expect("create sqlite test pool");
        run_migrations(&pool).await.expect("run migrations");

        let project = ProjectRepository::new(&pool)
            .create(CreateProjectInput {
                name: "WorkTrace".to_string(),
                repo_path: None,
                github_url: None,
                project_type: Some("Company".to_string()),
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
            })
            .await
            .expect("create weekly task");

        let report = ReportService::generate(
            &ActivityRepository::new(&pool),
            &WeeklyTaskRepository::new(&pool),
            GenerateReportInput {
                start_date: "2026-05-19".to_string(),
                end_date: "2026-05-21".to_string(),
                recipient_name: Some("Manager".to_string()),
                project_ids: None,
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
}
