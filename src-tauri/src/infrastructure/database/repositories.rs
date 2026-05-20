use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Utc;
use sqlx::{Row, SqlitePool};

use crate::application::repositories::{
    CommitStore, ManualLogStore, ProjectStore, ReportItemStore, ReportNoteStore, ReportStore,
    SettingsStore, WeeklyTaskStore,
};
use crate::domain::activity::{ActivityDay, ActivityItem, ListActivityInput};
use crate::domain::commit::Commit;
use crate::domain::manual_log::{
    ActivityType, CreateManualLogInput, ManualLog, UpdateManualLogInput,
};
use crate::domain::project::{CreateProjectInput, Project, UpdateProjectInput};
use crate::domain::report::{
    CreateReportItemInput, CreateReportNoteInput, Report, ReportItem, ReportNote, ReportSummary,
    SaveReportInput, UpdateReportNoteInput,
};
use crate::domain::settings::{Settings, UpdateSettingsInput};
use crate::domain::weekly_task::{
    CreateWeeklyTaskInput, ListWeeklyTasksInput, UpdateWeeklyTaskInput, WeeklyTask,
    WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType,
};

pub struct ProjectRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ProjectRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<Project>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, name, repo_path, github_url, type, status, created_at, updated_at
            FROM projects
            ORDER BY status ASC, updated_at DESC, name ASC
            "#,
        )
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(project_from_row).collect())
    }

    pub async fn list_active(&self) -> Result<Vec<Project>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, name, repo_path, github_url, type, status, created_at, updated_at
            FROM projects
            WHERE status = 'active'
            ORDER BY updated_at DESC, name ASC
            "#,
        )
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(project_from_row).collect())
    }

    pub async fn create(&self, input: CreateProjectInput) -> Result<Project, sqlx::Error> {
        let now = current_timestamp();
        let project = Project {
            id: generate_id("project"),
            name: input.name.trim().to_string(),
            repo_path: normalize_optional(input.repo_path),
            github_url: normalize_optional(input.github_url),
            project_type: normalize_optional(input.project_type),
            status: "active".to_string(),
            created_at: now.clone(),
            updated_at: now,
        };

        sqlx::query(
            r#"
            INSERT INTO projects (id, name, repo_path, github_url, type, status, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
        )
        .bind(&project.id)
        .bind(&project.name)
        .bind(&project.repo_path)
        .bind(&project.github_url)
        .bind(&project.project_type)
        .bind(&project.status)
        .bind(&project.created_at)
        .bind(&project.updated_at)
        .execute(self.pool)
        .await?;

        Ok(project)
    }

    pub async fn update(
        &self,
        id: &str,
        input: UpdateProjectInput,
    ) -> Result<Option<Project>, sqlx::Error> {
        let Some(mut project) = self.find(id).await? else {
            return Ok(None);
        };

        if let Some(name) = input.name {
            project.name = name.trim().to_string();
        }

        if input.repo_path.is_some() {
            project.repo_path = normalize_optional(input.repo_path);
        }

        if input.github_url.is_some() {
            project.github_url = normalize_optional(input.github_url);
        }

        if input.project_type.is_some() {
            project.project_type = normalize_optional(input.project_type);
        }

        if let Some(status) = input.status {
            project.status = status;
        }

        project.updated_at = current_timestamp();

        sqlx::query(
            r#"
            UPDATE projects
            SET name = ?2,
                repo_path = ?3,
                github_url = ?4,
                type = ?5,
                status = ?6,
                updated_at = ?7
            WHERE id = ?1
            "#,
        )
        .bind(&project.id)
        .bind(&project.name)
        .bind(&project.repo_path)
        .bind(&project.github_url)
        .bind(&project.project_type)
        .bind(&project.status)
        .bind(&project.updated_at)
        .execute(self.pool)
        .await?;

        Ok(Some(project))
    }

    pub async fn archive(&self, id: &str) -> Result<Option<Project>, sqlx::Error> {
        self.update(
            id,
            UpdateProjectInput {
                name: None,
                repo_path: None,
                github_url: None,
                project_type: None,
                status: Some("archived".to_string()),
            },
        )
        .await
    }

    async fn find(&self, id: &str) -> Result<Option<Project>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, name, repo_path, github_url, type, status, created_at, updated_at
            FROM projects
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(project_from_row))
    }
}

#[async_trait::async_trait]
impl ProjectStore for ProjectRepository<'_> {
    async fn list(&self) -> Result<Vec<Project>, sqlx::Error> {
        ProjectRepository::list(self).await
    }

    async fn list_active(&self) -> Result<Vec<Project>, sqlx::Error> {
        ProjectRepository::list_active(self).await
    }

    async fn create(&self, input: CreateProjectInput) -> Result<Project, sqlx::Error> {
        ProjectRepository::create(self, input).await
    }

    async fn update(
        &self,
        id: &str,
        input: UpdateProjectInput,
    ) -> Result<Option<Project>, sqlx::Error> {
        ProjectRepository::update(self, id, input).await
    }

    async fn archive(&self, id: &str) -> Result<Option<Project>, sqlx::Error> {
        ProjectRepository::archive(self, id).await
    }
}

pub struct CommitRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> CommitRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, commit: &Commit) -> Result<CommitUpsertResult, sqlx::Error> {
        let exists = sqlx::query(
            r#"
            SELECT 1
            FROM commits
            WHERE project_id = ?1 AND commit_hash = ?2
            LIMIT 1
            "#,
        )
        .bind(&commit.project_id)
        .bind(&commit.commit_hash)
        .fetch_optional(self.pool)
        .await?
        .is_some();

        let now = current_timestamp();

        sqlx::query(
            r#"
            INSERT INTO commits (
              id, project_id, commit_hash, message, author_name, author_email, branch,
              committed_at, files_changed, insertions, deletions, included_in_report,
              created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(project_id, commit_hash) DO UPDATE SET
              message = excluded.message,
              author_name = excluded.author_name,
              author_email = excluded.author_email,
              branch = excluded.branch,
              committed_at = excluded.committed_at,
              files_changed = excluded.files_changed,
              insertions = excluded.insertions,
              deletions = excluded.deletions,
              updated_at = excluded.updated_at
            "#,
        )
        .bind(&commit.id)
        .bind(&commit.project_id)
        .bind(&commit.commit_hash)
        .bind(&commit.message)
        .bind(&commit.author_name)
        .bind(&commit.author_email)
        .bind(&commit.branch)
        .bind(&commit.committed_at)
        .bind(commit.files_changed)
        .bind(commit.insertions)
        .bind(commit.deletions)
        .bind(if commit.included_in_report { 1 } else { 0 })
        .bind(&now)
        .bind(&now)
        .execute(self.pool)
        .await?;

        Ok(if exists {
            CommitUpsertResult::Updated
        } else {
            CommitUpsertResult::Inserted
        })
    }
}

#[async_trait::async_trait]
impl CommitStore for CommitRepository<'_> {
    async fn upsert(&self, commit: &Commit) -> Result<CommitUpsertResult, sqlx::Error> {
        CommitRepository::upsert(self, commit).await
    }
}

pub struct ActivityRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ActivityRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self, input: ListActivityInput) -> Result<Vec<ActivityDay>, sqlx::Error> {
        let mut items = Vec::new();
        let include_commits = input
            .activity_type
            .as_deref()
            .map(|value| value == "all" || value == "commit")
            .unwrap_or(true);
        let include_manual = input
            .activity_type
            .as_deref()
            .map(|value| value != "commit")
            .unwrap_or(true);

        if include_commits {
            let rows = sqlx::query(
                r#"
                SELECT commits.id,
                       commits.project_id,
                       projects.name AS project_name,
                       commits.message,
                       commits.committed_at,
                       commits.included_in_report,
                       commits.commit_hash,
                       commits.author_name,
                       commits.author_email,
                       commits.branch,
                       commits.files_changed,
                       commits.insertions,
                       commits.deletions
                FROM commits
                LEFT JOIN projects ON projects.id = commits.project_id
                WHERE substr(commits.committed_at, 1, 10) >= ?1
                  AND substr(commits.committed_at, 1, 10) <= ?2
                ORDER BY commits.committed_at DESC
                "#,
            )
            .bind(&input.from)
            .bind(&input.to)
            .fetch_all(self.pool)
            .await?;

            for row in rows {
                let project_id: String = row.get("project_id");
                if !project_filter_matches(&input.project_ids, &project_id) {
                    continue;
                }

                items.push(ActivityItem {
                    id: row.get("id"),
                    project_id: Some(project_id),
                    project_name: row.get("project_name"),
                    activity_type: "commit".to_string(),
                    summary: row.get("message"),
                    occurred_at: row.get("committed_at"),
                    included_in_report: i64_to_bool(row.get("included_in_report")),
                    commit_hash: row.get("commit_hash"),
                    author_name: row.get("author_name"),
                    author_email: row.get("author_email"),
                    branch: row.get("branch"),
                    files_changed: row.get("files_changed"),
                    insertions: row.get("insertions"),
                    deletions: row.get("deletions"),
                });
            }
        }

        if include_manual {
            let rows = sqlx::query(
                r#"
                SELECT manual_logs.id,
                       manual_logs.project_id,
                       projects.name AS project_name,
                       manual_logs.activity_type,
                       manual_logs.summary,
                       manual_logs.date,
                       manual_logs.included_in_report
                FROM manual_logs
                LEFT JOIN projects ON projects.id = manual_logs.project_id
                WHERE manual_logs.date >= ?1
                  AND manual_logs.date <= ?2
                ORDER BY manual_logs.date DESC
                "#,
            )
            .bind(&input.from)
            .bind(&input.to)
            .fetch_all(self.pool)
            .await?;

            for row in rows {
                let project_id: Option<String> = row.get("project_id");
                if let Some(project_id) = &project_id {
                    if !project_filter_matches(&input.project_ids, project_id) {
                        continue;
                    }
                } else if input.project_ids.is_some() {
                    continue;
                }

                let activity_type: String = row.get("activity_type");
                if !activity_filter_matches(&input.activity_type, &activity_type) {
                    continue;
                }

                items.push(ActivityItem {
                    id: row.get("id"),
                    project_id,
                    project_name: row.get("project_name"),
                    activity_type,
                    summary: row.get("summary"),
                    occurred_at: row.get("date"),
                    included_in_report: i64_to_bool(row.get("included_in_report")),
                    commit_hash: None,
                    author_name: None,
                    author_email: None,
                    branch: None,
                    files_changed: None,
                    insertions: None,
                    deletions: None,
                });
            }
        }

        items.sort_by(|left, right| right.occurred_at.cmp(&left.occurred_at));

        let mut days: Vec<ActivityDay> = Vec::new();
        for item in items {
            let date = item.occurred_at.chars().take(10).collect::<String>();

            if let Some(day) = days.iter_mut().find(|day| day.date == date) {
                day.items.push(item);
            } else {
                days.push(ActivityDay {
                    date,
                    items: vec![item],
                });
            }
        }

        Ok(days)
    }
}

pub struct ManualLogRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ManualLogRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, input: CreateManualLogInput) -> Result<ManualLog, sqlx::Error> {
        let now = current_timestamp();
        let log = ManualLog {
            id: generate_id("manual_log"),
            project_id: normalize_optional(input.project_id),
            date: input.date,
            activity_type: input.activity_type,
            summary: input.summary.trim().to_string(),
            outcome: normalize_optional(input.outcome),
            duration_minutes: input.duration_minutes,
            follow_up: normalize_optional(input.follow_up),
            included_in_report: input.included_in_report.unwrap_or(true),
        };

        sqlx::query(
            r#"
            INSERT INTO manual_logs (
              id, project_id, date, activity_type, summary, outcome, duration_minutes,
              follow_up, included_in_report, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
        )
        .bind(&log.id)
        .bind(&log.project_id)
        .bind(&log.date)
        .bind(log.activity_type.as_storage_value())
        .bind(&log.summary)
        .bind(&log.outcome)
        .bind(log.duration_minutes)
        .bind(&log.follow_up)
        .bind(bool_to_i64(log.included_in_report))
        .bind(&now)
        .bind(&now)
        .execute(self.pool)
        .await?;

        Ok(log)
    }

    pub async fn update(
        &self,
        id: &str,
        input: UpdateManualLogInput,
    ) -> Result<Option<ManualLog>, sqlx::Error> {
        let Some(mut log) = self.find(id).await? else {
            return Ok(None);
        };

        if input.project_id.is_some() {
            log.project_id = normalize_optional(input.project_id);
        }
        if let Some(date) = input.date {
            log.date = date;
        }
        if let Some(activity_type) = input.activity_type {
            log.activity_type = activity_type;
        }
        if let Some(summary) = input.summary {
            log.summary = summary.trim().to_string();
        }
        if input.outcome.is_some() {
            log.outcome = normalize_optional(input.outcome);
        }
        if input.duration_minutes.is_some() {
            log.duration_minutes = input.duration_minutes;
        }
        if input.follow_up.is_some() {
            log.follow_up = normalize_optional(input.follow_up);
        }
        if let Some(included) = input.included_in_report {
            log.included_in_report = included;
        }

        let now = current_timestamp();
        sqlx::query(
            r#"
            UPDATE manual_logs
            SET project_id = ?2,
                date = ?3,
                activity_type = ?4,
                summary = ?5,
                outcome = ?6,
                duration_minutes = ?7,
                follow_up = ?8,
                included_in_report = ?9,
                updated_at = ?10
            WHERE id = ?1
            "#,
        )
        .bind(&log.id)
        .bind(&log.project_id)
        .bind(&log.date)
        .bind(log.activity_type.as_storage_value())
        .bind(&log.summary)
        .bind(&log.outcome)
        .bind(log.duration_minutes)
        .bind(&log.follow_up)
        .bind(bool_to_i64(log.included_in_report))
        .bind(&now)
        .execute(self.pool)
        .await?;

        Ok(Some(log))
    }

    pub async fn delete(&self, id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM manual_logs WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn list_by_date_range(
        &self,
        from: &str,
        to: &str,
    ) -> Result<Vec<ManualLog>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, project_id, date, activity_type, summary, outcome, duration_minutes,
                   follow_up, included_in_report
            FROM manual_logs
            WHERE date >= ?1 AND date <= ?2
            ORDER BY date ASC, created_at ASC
            "#,
        )
        .bind(from)
        .bind(to)
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(manual_log_from_row).collect())
    }

    async fn find(&self, id: &str) -> Result<Option<ManualLog>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, project_id, date, activity_type, summary, outcome, duration_minutes,
                   follow_up, included_in_report
            FROM manual_logs
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(manual_log_from_row))
    }
}

#[async_trait::async_trait]
impl ManualLogStore for ManualLogRepository<'_> {
    async fn create(&self, input: CreateManualLogInput) -> Result<ManualLog, sqlx::Error> {
        ManualLogRepository::create(self, input).await
    }

    async fn update(
        &self,
        id: &str,
        input: UpdateManualLogInput,
    ) -> Result<Option<ManualLog>, sqlx::Error> {
        ManualLogRepository::update(self, id, input).await
    }

    async fn delete(&self, id: &str) -> Result<bool, sqlx::Error> {
        ManualLogRepository::delete(self, id).await
    }

    async fn list_by_date_range(
        &self,
        from: &str,
        to: &str,
    ) -> Result<Vec<ManualLog>, sqlx::Error> {
        ManualLogRepository::list_by_date_range(self, from, to).await
    }
}

pub struct ReportRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ReportRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn save(&self, input: SaveReportInput) -> Result<Report, sqlx::Error> {
        let report = Report {
            id: generate_id("report"),
            title: input.title.trim().to_string(),
            start_date: input.start_date,
            end_date: input.end_date,
            recipient_name: normalize_optional(input.recipient_name),
            content: input.content,
            created_at: current_timestamp(),
        };

        sqlx::query(
            r#"
            INSERT INTO reports (id, title, start_date, end_date, recipient_name, content, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
        )
        .bind(&report.id)
        .bind(&report.title)
        .bind(&report.start_date)
        .bind(&report.end_date)
        .bind(&report.recipient_name)
        .bind(&report.content)
        .bind(&report.created_at)
        .execute(self.pool)
        .await?;

        Ok(report)
    }

    pub async fn list(&self) -> Result<Vec<ReportSummary>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, title, start_date, end_date, recipient_name, created_at
            FROM reports
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(report_summary_from_row).collect())
    }

    pub async fn get(&self, id: &str) -> Result<Option<Report>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, title, start_date, end_date, recipient_name, content, created_at
            FROM reports
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(report_from_row))
    }
}

#[async_trait::async_trait]
impl ReportStore for ReportRepository<'_> {
    async fn save(&self, input: SaveReportInput) -> Result<Report, sqlx::Error> {
        ReportRepository::save(self, input).await
    }

    async fn list(&self) -> Result<Vec<ReportSummary>, sqlx::Error> {
        ReportRepository::list(self).await
    }

    async fn get(&self, id: &str) -> Result<Option<Report>, sqlx::Error> {
        ReportRepository::get(self, id).await
    }
}

pub struct ReportItemRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ReportItemRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, input: CreateReportItemInput) -> Result<ReportItem, sqlx::Error> {
        let item = ReportItem {
            id: generate_id("report_item"),
            report_id: input.report_id,
            project_id: normalize_optional(input.project_id),
            source_type: input.source_type,
            source_id: normalize_optional(input.source_id),
            summary: normalize_optional(input.summary),
            created_at: current_timestamp(),
        };

        sqlx::query(
            r#"
            INSERT INTO report_items (id, report_id, project_id, source_type, source_id, summary, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
        )
        .bind(&item.id)
        .bind(&item.report_id)
        .bind(&item.project_id)
        .bind(&item.source_type)
        .bind(&item.source_id)
        .bind(&item.summary)
        .bind(&item.created_at)
        .execute(self.pool)
        .await?;

        Ok(item)
    }

    pub async fn list_by_report(&self, report_id: &str) -> Result<Vec<ReportItem>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, report_id, project_id, source_type, source_id, summary, created_at
            FROM report_items
            WHERE report_id = ?1
            ORDER BY created_at ASC
            "#,
        )
        .bind(report_id)
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(report_item_from_row).collect())
    }
}

#[async_trait::async_trait]
impl ReportItemStore for ReportItemRepository<'_> {
    async fn insert(&self, input: CreateReportItemInput) -> Result<ReportItem, sqlx::Error> {
        ReportItemRepository::insert(self, input).await
    }

    async fn list_by_report(&self, report_id: &str) -> Result<Vec<ReportItem>, sqlx::Error> {
        ReportItemRepository::list_by_report(self, report_id).await
    }
}

pub struct ReportNoteRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ReportNoteRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, input: CreateReportNoteInput) -> Result<ReportNote, sqlx::Error> {
        let now = current_timestamp();
        let note = ReportNote {
            id: generate_id("report_note"),
            project_id: normalize_optional(input.project_id),
            note_type: input.note_type,
            date: input.date,
            content: input.content.trim().to_string(),
            included_in_report: input.included_in_report.unwrap_or(true),
            created_at: now.clone(),
            updated_at: now,
        };

        sqlx::query(
            r#"
            INSERT INTO report_notes (
              id, project_id, note_type, date, content, included_in_report, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
        )
        .bind(&note.id)
        .bind(&note.project_id)
        .bind(&note.note_type)
        .bind(&note.date)
        .bind(&note.content)
        .bind(bool_to_i64(note.included_in_report))
        .bind(&note.created_at)
        .bind(&note.updated_at)
        .execute(self.pool)
        .await?;

        Ok(note)
    }

    pub async fn update(
        &self,
        id: &str,
        input: UpdateReportNoteInput,
    ) -> Result<Option<ReportNote>, sqlx::Error> {
        let Some(mut note) = self.find(id).await? else {
            return Ok(None);
        };

        if input.project_id.is_some() {
            note.project_id = normalize_optional(input.project_id);
        }
        if let Some(note_type) = input.note_type {
            note.note_type = note_type;
        }
        if let Some(date) = input.date {
            note.date = date;
        }
        if let Some(content) = input.content {
            note.content = content.trim().to_string();
        }
        if let Some(included) = input.included_in_report {
            note.included_in_report = included;
        }
        note.updated_at = current_timestamp();

        sqlx::query(
            r#"
            UPDATE report_notes
            SET project_id = ?2,
                note_type = ?3,
                date = ?4,
                content = ?5,
                included_in_report = ?6,
                updated_at = ?7
            WHERE id = ?1
            "#,
        )
        .bind(&note.id)
        .bind(&note.project_id)
        .bind(&note.note_type)
        .bind(&note.date)
        .bind(&note.content)
        .bind(bool_to_i64(note.included_in_report))
        .bind(&note.updated_at)
        .execute(self.pool)
        .await?;

        Ok(Some(note))
    }

    pub async fn delete(&self, id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM report_notes WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn list_by_date_range(
        &self,
        from: &str,
        to: &str,
    ) -> Result<Vec<ReportNote>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, project_id, note_type, date, content, included_in_report, created_at, updated_at
            FROM report_notes
            WHERE date >= ?1 AND date <= ?2
            ORDER BY date ASC, created_at ASC
            "#,
        )
        .bind(from)
        .bind(to)
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(report_note_from_row).collect())
    }

    async fn find(&self, id: &str) -> Result<Option<ReportNote>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, project_id, note_type, date, content, included_in_report, created_at, updated_at
            FROM report_notes
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(report_note_from_row))
    }
}

#[async_trait::async_trait]
impl ReportNoteStore for ReportNoteRepository<'_> {
    async fn create(&self, input: CreateReportNoteInput) -> Result<ReportNote, sqlx::Error> {
        ReportNoteRepository::create(self, input).await
    }

    async fn update(
        &self,
        id: &str,
        input: UpdateReportNoteInput,
    ) -> Result<Option<ReportNote>, sqlx::Error> {
        ReportNoteRepository::update(self, id, input).await
    }

    async fn delete(&self, id: &str) -> Result<bool, sqlx::Error> {
        ReportNoteRepository::delete(self, id).await
    }

    async fn list_by_date_range(
        &self,
        from: &str,
        to: &str,
    ) -> Result<Vec<ReportNote>, sqlx::Error> {
        ReportNoteRepository::list_by_date_range(self, from, to).await
    }
}

pub struct SettingsRepository<'a> {
    pool: &'a SqlitePool,
}

pub struct WeeklyTaskRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> WeeklyTaskRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self, input: ListWeeklyTasksInput) -> Result<Vec<WeeklyTask>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT weekly_tasks.id,
                   weekly_tasks.project_id,
                   projects.name AS project_name,
                   weekly_tasks.task_type,
                   weekly_tasks.status,
                   weekly_tasks.title,
                   weekly_tasks.details,
                   weekly_tasks.week_start_date,
                   weekly_tasks.target_date,
                   weekly_tasks.completed_at,
                   weekly_tasks.priority,
                   weekly_tasks.included_in_report,
                   weekly_tasks.created_at,
                   weekly_tasks.updated_at
            FROM weekly_tasks
            LEFT JOIN projects ON projects.id = weekly_tasks.project_id
            WHERE (
                weekly_tasks.week_start_date >= ?1
                AND weekly_tasks.week_start_date <= ?2
              )
              OR (
                weekly_tasks.week_start_date < ?1
                AND weekly_tasks.status IN ('todo', 'in_progress', 'blocked')
              )
            ORDER BY
              CASE weekly_tasks.status
                WHEN 'blocked' THEN 0
                WHEN 'in_progress' THEN 1
                WHEN 'todo' THEN 2
                WHEN 'completed' THEN 3
                ELSE 4
              END,
              weekly_tasks.target_date ASC,
              weekly_tasks.created_at ASC
            "#,
        )
        .bind(&input.week_start_date)
        .bind(&input.week_end_date)
        .fetch_all(self.pool)
        .await?;

        let mut tasks = Vec::new();
        for row in rows {
            let task = weekly_task_from_row(row);

            if let Some(project_ids) = &input.project_ids {
                match &task.project_id {
                    Some(project_id) if project_ids.iter().any(|id| id == project_id) => {}
                    _ => continue,
                }
            }

            if input
                .task_type
                .as_ref()
                .map(|task_type| task.task_type != *task_type)
                .unwrap_or(false)
            {
                continue;
            }

            if input
                .status
                .as_ref()
                .map(|status| task.status != *status)
                .unwrap_or(false)
            {
                continue;
            }

            if input
                .included_in_report
                .map(|included| task.included_in_report != included)
                .unwrap_or(false)
            {
                continue;
            }

            tasks.push(task);
        }

        Ok(tasks)
    }

    pub async fn create(&self, input: CreateWeeklyTaskInput) -> Result<WeeklyTask, sqlx::Error> {
        let now = current_timestamp();
        let task_type = input.task_type;
        let included_in_report = input
            .included_in_report
            .unwrap_or_else(|| default_weekly_task_inclusion(&task_type));
        let task = WeeklyTask {
            id: generate_id("weekly_task"),
            project_id: normalize_optional(input.project_id),
            project_name: None,
            task_type,
            status: input.status.unwrap_or(WeeklyTaskStatus::Todo),
            title: input.title.trim().to_string(),
            details: normalize_optional(input.details),
            week_start_date: input.week_start_date,
            target_date: normalize_optional(input.target_date),
            completed_at: normalize_optional(input.completed_at),
            priority: input.priority.unwrap_or(WeeklyTaskPriority::Normal),
            included_in_report,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        sqlx::query(
            r#"
            INSERT INTO weekly_tasks (
              id, project_id, task_type, status, title, details, week_start_date,
              target_date, completed_at, priority, included_in_report, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            "#,
        )
        .bind(&task.id)
        .bind(&task.project_id)
        .bind(task.task_type.as_storage_value())
        .bind(task.status.as_storage_value())
        .bind(&task.title)
        .bind(&task.details)
        .bind(&task.week_start_date)
        .bind(&task.target_date)
        .bind(&task.completed_at)
        .bind(task.priority.as_storage_value())
        .bind(bool_to_i64(task.included_in_report))
        .bind(&task.created_at)
        .bind(&task.updated_at)
        .execute(self.pool)
        .await?;

        Ok(task)
    }

    pub async fn update(
        &self,
        id: &str,
        input: UpdateWeeklyTaskInput,
    ) -> Result<Option<WeeklyTask>, sqlx::Error> {
        let Some(mut task) = self.find(id).await? else {
            return Ok(None);
        };

        if input.project_id.is_some() {
            task.project_id = normalize_optional(input.project_id);
        }
        if let Some(task_type) = input.task_type {
            task.task_type = task_type;
        }
        if let Some(status) = input.status {
            task.status = status;
        }
        if let Some(title) = input.title {
            task.title = title.trim().to_string();
        }
        if input.details.is_some() {
            task.details = normalize_optional(input.details);
        }
        if let Some(week_start_date) = input.week_start_date {
            task.week_start_date = week_start_date;
        }
        if input.target_date.is_some() {
            task.target_date = normalize_optional(input.target_date);
        }
        if input.completed_at.is_some() {
            task.completed_at = normalize_optional(input.completed_at);
        }
        if let Some(priority) = input.priority {
            task.priority = priority;
        }
        if let Some(included) = input.included_in_report {
            task.included_in_report = included;
        }
        task.updated_at = current_timestamp();

        sqlx::query(
            r#"
            UPDATE weekly_tasks
            SET project_id = ?2,
                task_type = ?3,
                status = ?4,
                title = ?5,
                details = ?6,
                week_start_date = ?7,
                target_date = ?8,
                completed_at = ?9,
                priority = ?10,
                included_in_report = ?11,
                updated_at = ?12
            WHERE id = ?1
            "#,
        )
        .bind(&task.id)
        .bind(&task.project_id)
        .bind(task.task_type.as_storage_value())
        .bind(task.status.as_storage_value())
        .bind(&task.title)
        .bind(&task.details)
        .bind(&task.week_start_date)
        .bind(&task.target_date)
        .bind(&task.completed_at)
        .bind(task.priority.as_storage_value())
        .bind(bool_to_i64(task.included_in_report))
        .bind(&task.updated_at)
        .execute(self.pool)
        .await?;

        Ok(Some(task))
    }

    pub async fn delete(&self, id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM weekly_tasks WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    async fn find(&self, id: &str) -> Result<Option<WeeklyTask>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT weekly_tasks.id,
                   weekly_tasks.project_id,
                   projects.name AS project_name,
                   weekly_tasks.task_type,
                   weekly_tasks.status,
                   weekly_tasks.title,
                   weekly_tasks.details,
                   weekly_tasks.week_start_date,
                   weekly_tasks.target_date,
                   weekly_tasks.completed_at,
                   weekly_tasks.priority,
                   weekly_tasks.included_in_report,
                   weekly_tasks.created_at,
                   weekly_tasks.updated_at
            FROM weekly_tasks
            LEFT JOIN projects ON projects.id = weekly_tasks.project_id
            WHERE weekly_tasks.id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(weekly_task_from_row))
    }
}

#[async_trait::async_trait]
impl WeeklyTaskStore for WeeklyTaskRepository<'_> {
    async fn list(&self, input: ListWeeklyTasksInput) -> Result<Vec<WeeklyTask>, sqlx::Error> {
        WeeklyTaskRepository::list(self, input).await
    }

    async fn create(&self, input: CreateWeeklyTaskInput) -> Result<WeeklyTask, sqlx::Error> {
        WeeklyTaskRepository::create(self, input).await
    }

    async fn update(
        &self,
        id: &str,
        input: UpdateWeeklyTaskInput,
    ) -> Result<Option<WeeklyTask>, sqlx::Error> {
        WeeklyTaskRepository::update(self, id, input).await
    }

    async fn delete(&self, id: &str) -> Result<bool, sqlx::Error> {
        WeeklyTaskRepository::delete(self, id).await
    }
}

impl<'a> SettingsRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get(&self) -> Result<Settings, sqlx::Error> {
        let mut settings = Settings::default();
        let rows = sqlx::query("SELECT key, value FROM settings")
            .fetch_all(self.pool)
            .await?;

        for row in rows {
            let key: String = row.get("key");
            let value: String = row.get("value");
            apply_setting(&mut settings, &key, value);
        }

        Ok(settings)
    }

    pub async fn update(&self, input: UpdateSettingsInput) -> Result<Settings, sqlx::Error> {
        let mut settings = self.get().await?;

        if let Some(value) = input.name {
            settings.name = value;
        }
        if let Some(value) = input.email {
            settings.email = value;
        }
        if let Some(value) = input.default_manager_name {
            settings.default_manager_name = value;
        }
        if let Some(value) = input.git_author_email {
            settings.git_author_email = value;
        }
        if let Some(value) = input.default_report_template {
            settings.default_report_template = value;
        }
        if let Some(value) = input.working_days {
            settings.working_days = value;
        }
        if let Some(value) = input.theme {
            settings.theme = value;
        }

        self.upsert("profile.name", &settings.name).await?;
        self.upsert("profile.email", &settings.email).await?;
        self.upsert(
            "profile.default_manager_name",
            &settings.default_manager_name,
        )
        .await?;
        self.upsert("git.author_email", &settings.git_author_email)
            .await?;
        self.upsert(
            "reports.default_template",
            &settings.default_report_template,
        )
        .await?;
        self.upsert(
            "working_days",
            &serde_json::to_string(&settings.working_days).unwrap_or_else(|_| "[]".to_string()),
        )
        .await?;
        self.upsert("appearance.theme", &settings.theme).await?;

        Ok(settings)
    }

    async fn upsert(&self, key: &str, value: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO settings (key, value, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at
            "#,
        )
        .bind(key)
        .bind(value)
        .bind(current_timestamp())
        .execute(self.pool)
        .await?;

        Ok(())
    }
}

#[async_trait::async_trait]
impl SettingsStore for SettingsRepository<'_> {
    async fn get(&self) -> Result<Settings, sqlx::Error> {
        SettingsRepository::get(self).await
    }

    async fn update(&self, input: UpdateSettingsInput) -> Result<Settings, sqlx::Error> {
        SettingsRepository::update(self, input).await
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum CommitUpsertResult {
    Inserted,
    Updated,
}

fn manual_log_from_row(row: sqlx::sqlite::SqliteRow) -> ManualLog {
    let activity_type: String = row.get("activity_type");
    ManualLog {
        id: row.get("id"),
        project_id: row.get("project_id"),
        date: row.get("date"),
        activity_type: ActivityType::try_from(activity_type).unwrap_or(ActivityType::Development),
        summary: row.get("summary"),
        outcome: row.get("outcome"),
        duration_minutes: row.get("duration_minutes"),
        follow_up: row.get("follow_up"),
        included_in_report: i64_to_bool(row.get("included_in_report")),
    }
}

fn report_from_row(row: sqlx::sqlite::SqliteRow) -> Report {
    Report {
        id: row.get("id"),
        title: row.get("title"),
        start_date: row.get("start_date"),
        end_date: row.get("end_date"),
        recipient_name: row.get("recipient_name"),
        content: row.get("content"),
        created_at: row.get("created_at"),
    }
}

fn report_summary_from_row(row: sqlx::sqlite::SqliteRow) -> ReportSummary {
    ReportSummary {
        id: row.get("id"),
        title: row.get("title"),
        start_date: row.get("start_date"),
        end_date: row.get("end_date"),
        recipient_name: row.get("recipient_name"),
        created_at: row.get("created_at"),
    }
}

fn report_item_from_row(row: sqlx::sqlite::SqliteRow) -> ReportItem {
    ReportItem {
        id: row.get("id"),
        report_id: row.get("report_id"),
        project_id: row.get("project_id"),
        source_type: row.get("source_type"),
        source_id: row.get("source_id"),
        summary: row.get("summary"),
        created_at: row.get("created_at"),
    }
}

fn report_note_from_row(row: sqlx::sqlite::SqliteRow) -> ReportNote {
    ReportNote {
        id: row.get("id"),
        project_id: row.get("project_id"),
        note_type: row.get("note_type"),
        date: row.get("date"),
        content: row.get("content"),
        included_in_report: i64_to_bool(row.get("included_in_report")),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn weekly_task_from_row(row: sqlx::sqlite::SqliteRow) -> WeeklyTask {
    let task_type: String = row.get("task_type");
    let status: String = row.get("status");
    let priority: String = row.get("priority");

    WeeklyTask {
        id: row.get("id"),
        project_id: row.get("project_id"),
        project_name: row.get("project_name"),
        task_type: WeeklyTaskType::try_from(task_type).unwrap_or(WeeklyTaskType::PlannedWork),
        status: WeeklyTaskStatus::try_from(status).unwrap_or(WeeklyTaskStatus::Todo),
        title: row.get("title"),
        details: row.get("details"),
        week_start_date: row.get("week_start_date"),
        target_date: row.get("target_date"),
        completed_at: row.get("completed_at"),
        priority: WeeklyTaskPriority::try_from(priority).unwrap_or(WeeklyTaskPriority::Normal),
        included_in_report: i64_to_bool(row.get("included_in_report")),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn default_weekly_task_inclusion(task_type: &WeeklyTaskType) -> bool {
    matches!(
        task_type,
        WeeklyTaskType::Blocker | WeeklyTaskType::Carryover | WeeklyTaskType::CompletedChecklist
    )
}

fn apply_setting(settings: &mut Settings, key: &str, value: String) {
    match key {
        "profile.name" => settings.name = value,
        "profile.email" => settings.email = value,
        "profile.default_manager_name" => settings.default_manager_name = value,
        "git.author_email" => settings.git_author_email = value,
        "reports.default_template" => settings.default_report_template = value,
        "working_days" => {
            settings.working_days =
                serde_json::from_str(&value).unwrap_or_else(|_| Settings::default().working_days);
        }
        "appearance.theme" => settings.theme = value,
        _ => {}
    }
}

fn project_from_row(row: sqlx::sqlite::SqliteRow) -> Project {
    Project {
        id: row.get("id"),
        name: row.get("name"),
        repo_path: row.get("repo_path"),
        github_url: row.get("github_url"),
        project_type: row.get("type"),
        status: row.get("status"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn project_filter_matches(project_ids: &Option<Vec<String>>, project_id: &str) -> bool {
    project_ids
        .as_ref()
        .map(|ids| ids.iter().any(|id| id == project_id))
        .unwrap_or(true)
}

fn activity_filter_matches(activity_type_filter: &Option<String>, activity_type: &str) -> bool {
    activity_type_filter
        .as_deref()
        .map(|filter| {
            normalize_activity_filter(filter) == "all"
                || normalize_activity_filter(filter) == normalize_activity_filter(activity_type)
        })
        .unwrap_or(true)
}

fn normalize_activity_filter(value: &str) -> String {
    value.trim().to_lowercase().replace([' ', '-'], "_")
}

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn i64_to_bool(value: i64) -> bool {
    value == 1
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339()
}

fn generate_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    format!("{prefix}_{nanos}")
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    use super::*;
    use crate::infrastructure::database::migrations::run_migrations;

    async fn test_pool() -> SqlitePool {
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

    async fn create_project(pool: &SqlitePool) -> Project {
        ProjectRepository::new(pool)
            .create(CreateProjectInput {
                name: "Sparc Force API".to_string(),
                repo_path: Some("C:\\repo\\sparc-force-api".to_string()),
                github_url: Some("https://github.com/company/api".to_string()),
                project_type: Some("Company".to_string()),
            })
            .await
            .expect("create project")
    }

    #[tokio::test]
    async fn migrations_are_idempotent() {
        let pool = test_pool().await;
        run_migrations(&pool).await.expect("rerun migrations");

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'projects'",
        )
        .fetch_one(&pool)
        .await
        .expect("query sqlite master");

        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn project_create_list_update_archive_works() {
        let pool = test_pool().await;
        let repository = ProjectRepository::new(&pool);
        let project = repository
            .create(CreateProjectInput {
                name: "Sparc Website".to_string(),
                repo_path: Some("C:\\repo\\website".to_string()),
                github_url: None,
                project_type: Some("Client".to_string()),
            })
            .await
            .expect("create project");

        assert_eq!(repository.list().await.expect("list").len(), 1);

        let updated = repository
            .update(
                &project.id,
                UpdateProjectInput {
                    name: Some("Sparc Website CMS".to_string()),
                    repo_path: None,
                    github_url: None,
                    project_type: None,
                    status: None,
                },
            )
            .await
            .expect("update project")
            .expect("project exists");

        assert_eq!(updated.name, "Sparc Website CMS");

        let archived = repository
            .archive(&project.id)
            .await
            .expect("archive project")
            .expect("project exists");

        assert_eq!(archived.status, "archived");
    }

    #[tokio::test]
    async fn commit_upsert_reports_insert_then_update() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let repository = CommitRepository::new(&pool);
        let commit = Commit {
            id: "commit_1".to_string(),
            project_id: project.id,
            commit_hash: "abc123".to_string(),
            message: "feat: add project persistence".to_string(),
            author_name: Some("Joseph".to_string()),
            author_email: Some("joseph@example.com".to_string()),
            branch: Some("main".to_string()),
            committed_at: "2026-05-19T10:00:00Z".to_string(),
            files_changed: Some(2),
            insertions: Some(20),
            deletions: Some(3),
            included_in_report: true,
        };

        assert_eq!(
            repository.upsert(&commit).await.expect("insert commit"),
            CommitUpsertResult::Inserted
        );
        assert_eq!(
            repository.upsert(&commit).await.expect("update commit"),
            CommitUpsertResult::Updated
        );
    }

    #[tokio::test]
    async fn activity_lists_commits_and_manual_logs_by_day() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let commit_repository = CommitRepository::new(&pool);
        let manual_log_repository = ManualLogRepository::new(&pool);
        let activity_repository = ActivityRepository::new(&pool);

        commit_repository
            .upsert(&Commit {
                id: "commit_activity_1".to_string(),
                project_id: project.id.clone(),
                commit_hash: "activity123".to_string(),
                message: "feat: connect activity timeline".to_string(),
                author_name: Some("Joseph".to_string()),
                author_email: Some("joseph@example.com".to_string()),
                branch: Some("main".to_string()),
                committed_at: "2026-05-19T11:00:00Z".to_string(),
                files_changed: Some(3),
                insertions: Some(42),
                deletions: Some(7),
                included_in_report: true,
            })
            .await
            .expect("insert commit");

        manual_log_repository
            .create(CreateManualLogInput {
                project_id: Some(project.id),
                date: "2026-05-19".to_string(),
                activity_type: ActivityType::Testing,
                summary: "Verified activity rendering".to_string(),
                outcome: None,
                duration_minutes: Some(30),
                follow_up: None,
                included_in_report: Some(true),
            })
            .await
            .expect("create manual log");

        let days = activity_repository
            .list(ListActivityInput {
                from: "2026-05-18".to_string(),
                to: "2026-05-20".to_string(),
                activity_type: None,
                project_ids: None,
            })
            .await
            .expect("list activity");

        assert_eq!(days.len(), 1);
        assert_eq!(days[0].date, "2026-05-19");
        assert_eq!(days[0].items.len(), 2);
        assert!(days[0]
            .items
            .iter()
            .any(|item| item.activity_type == "commit"));
        assert!(days[0]
            .items
            .iter()
            .any(|item| item.activity_type == "Testing"));

        let commit_only = activity_repository
            .list(ListActivityInput {
                from: "2026-05-18".to_string(),
                to: "2026-05-20".to_string(),
                activity_type: Some("commit".to_string()),
                project_ids: None,
            })
            .await
            .expect("list commit activity");

        assert_eq!(commit_only[0].items.len(), 1);
        assert_eq!(commit_only[0].items[0].activity_type, "commit");

        let testing_only = activity_repository
            .list(ListActivityInput {
                from: "2026-05-18".to_string(),
                to: "2026-05-20".to_string(),
                activity_type: Some("Testing".to_string()),
                project_ids: None,
            })
            .await
            .expect("list testing activity");

        assert_eq!(testing_only[0].items.len(), 1);
        assert_eq!(testing_only[0].items[0].activity_type, "Testing");

        let no_matching_project = activity_repository
            .list(ListActivityInput {
                from: "2026-05-18".to_string(),
                to: "2026-05-20".to_string(),
                activity_type: None,
                project_ids: Some(vec!["missing_project".to_string()]),
            })
            .await
            .expect("list filtered activity");

        assert!(no_matching_project.is_empty());
    }

    #[tokio::test]
    async fn manual_log_create_update_delete_works() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let repository = ManualLogRepository::new(&pool);

        let log = repository
            .create(CreateManualLogInput {
                project_id: Some(project.id),
                date: "2026-05-19".to_string(),
                activity_type: ActivityType::Meeting,
                summary: "Sprint planning".to_string(),
                outcome: Some("Aligned on priorities".to_string()),
                duration_minutes: Some(60),
                follow_up: None,
                included_in_report: Some(true),
            })
            .await
            .expect("create manual log");

        let updated = repository
            .update(
                &log.id,
                UpdateManualLogInput {
                    project_id: None,
                    date: None,
                    activity_type: Some(ActivityType::Planning),
                    summary: Some("Planning session".to_string()),
                    outcome: None,
                    duration_minutes: Some(90),
                    follow_up: None,
                    included_in_report: Some(false),
                },
            )
            .await
            .expect("update manual log")
            .expect("log exists");

        assert_eq!(updated.summary, "Planning session");
        assert!(!updated.included_in_report);
        assert_eq!(
            repository
                .list_by_date_range("2026-05-18", "2026-05-20")
                .await
                .expect("list logs")
                .len(),
            1
        );
        assert!(repository.delete(&log.id).await.expect("delete log"));
    }

    #[tokio::test]
    async fn report_save_list_get_and_items_work() {
        let pool = test_pool().await;
        let report_repository = ReportRepository::new(&pool);
        let item_repository = ReportItemRepository::new(&pool);
        let project = create_project(&pool).await;

        let report = report_repository
            .save(SaveReportInput {
                title: "Weekly Update".to_string(),
                start_date: "2026-05-18".to_string(),
                end_date: "2026-05-22".to_string(),
                recipient_name: Some("Manager".to_string()),
                content: "# Weekly Update".to_string(),
            })
            .await
            .expect("save report");

        assert_eq!(
            report_repository.list().await.expect("list reports").len(),
            1
        );
        assert_eq!(
            report_repository
                .get(&report.id)
                .await
                .expect("get report")
                .expect("report exists")
                .content,
            "# Weekly Update"
        );

        let item = item_repository
            .insert(CreateReportItemInput {
                report_id: report.id.clone(),
                project_id: Some(project.id),
                source_type: "commit".to_string(),
                source_id: Some("abc123".to_string()),
                summary: Some("Implemented persistence".to_string()),
            })
            .await
            .expect("insert report item");

        assert_eq!(item.report_id, report.id);
        assert_eq!(
            item_repository
                .list_by_report(&report.id)
                .await
                .expect("list report items")
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn report_note_create_update_delete_works() {
        let pool = test_pool().await;
        let repository = ReportNoteRepository::new(&pool);
        let note = repository
            .create(CreateReportNoteInput {
                project_id: None,
                note_type: "blocker".to_string(),
                date: "2026-05-19".to_string(),
                content: "Waiting on API credentials".to_string(),
                included_in_report: Some(true),
            })
            .await
            .expect("create report note");

        let updated = repository
            .update(
                &note.id,
                UpdateReportNoteInput {
                    project_id: None,
                    note_type: Some("next_week_plan".to_string()),
                    date: None,
                    content: Some("Finalize API credential setup".to_string()),
                    included_in_report: Some(false),
                },
            )
            .await
            .expect("update report note")
            .expect("note exists");

        assert_eq!(updated.note_type, "next_week_plan");
        assert!(!updated.included_in_report);
        assert_eq!(
            repository
                .list_by_date_range("2026-05-18", "2026-05-20")
                .await
                .expect("list notes")
                .len(),
            1
        );
        assert!(repository.delete(&note.id).await.expect("delete note"));
    }

    #[tokio::test]
    async fn weekly_task_create_update_delete_and_carry_forward_work() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let repository = WeeklyTaskRepository::new(&pool);

        let old_open_task = repository
            .create(CreateWeeklyTaskInput {
                project_id: Some(project.id.clone()),
                task_type: WeeklyTaskType::PlannedWork,
                status: Some(WeeklyTaskStatus::Todo),
                title: "Carry unfinished work".to_string(),
                details: None,
                week_start_date: "2026-05-11".to_string(),
                target_date: None,
                completed_at: None,
                priority: Some(WeeklyTaskPriority::Normal),
                included_in_report: Some(false),
            })
            .await
            .expect("create old task");
        let current_blocker = repository
            .create(CreateWeeklyTaskInput {
                project_id: None,
                task_type: WeeklyTaskType::Blocker,
                status: Some(WeeklyTaskStatus::Blocked),
                title: "Waiting on credentials".to_string(),
                details: Some("Access request is pending".to_string()),
                week_start_date: "2026-05-18".to_string(),
                target_date: None,
                completed_at: None,
                priority: Some(WeeklyTaskPriority::High),
                included_in_report: None,
            })
            .await
            .expect("create blocker");
        repository
            .create(CreateWeeklyTaskInput {
                project_id: None,
                task_type: WeeklyTaskType::PlannedWork,
                status: Some(WeeklyTaskStatus::Completed),
                title: "Old completed task".to_string(),
                details: None,
                week_start_date: "2026-05-11".to_string(),
                target_date: None,
                completed_at: Some("2026-05-12".to_string()),
                priority: Some(WeeklyTaskPriority::Low),
                included_in_report: Some(true),
            })
            .await
            .expect("create old completed task");

        let listed = repository
            .list(ListWeeklyTasksInput {
                week_start_date: "2026-05-18".to_string(),
                week_end_date: "2026-05-22".to_string(),
                project_ids: None,
                task_type: None,
                status: None,
                included_in_report: None,
            })
            .await
            .expect("list tasks");

        assert!(listed.iter().any(|task| task.id == old_open_task.id));
        assert!(listed.iter().any(|task| task.id == current_blocker.id));
        assert_eq!(listed.len(), 2);
        assert!(current_blocker.included_in_report);

        let updated = repository
            .update(
                &old_open_task.id,
                UpdateWeeklyTaskInput {
                    project_id: None,
                    task_type: None,
                    status: Some(WeeklyTaskStatus::Completed),
                    title: Some("Finished carryover".to_string()),
                    details: None,
                    week_start_date: None,
                    target_date: None,
                    completed_at: Some("2026-05-20".to_string()),
                    priority: None,
                    included_in_report: Some(true),
                },
            )
            .await
            .expect("update task")
            .expect("task exists");

        assert_eq!(updated.status, WeeklyTaskStatus::Completed);
        assert!(repository
            .delete(&current_blocker.id)
            .await
            .expect("delete task"));
    }

    #[tokio::test]
    async fn settings_defaults_and_update_work() {
        let pool = test_pool().await;
        let repository = SettingsRepository::new(&pool);

        assert_eq!(
            repository.get().await.expect("default settings").theme,
            "dark"
        );

        let updated = repository
            .update(UpdateSettingsInput {
                name: Some("Joseph".to_string()),
                email: Some("joseph@example.com".to_string()),
                default_manager_name: Some("Manager".to_string()),
                git_author_email: Some("git@example.com".to_string()),
                default_report_template: Some("project_based".to_string()),
                working_days: Some(vec!["monday".to_string(), "tuesday".to_string()]),
                theme: Some("system".to_string()),
            })
            .await
            .expect("update settings");

        assert_eq!(updated.name, "Joseph");
        assert_eq!(
            repository.get().await.expect("get settings").theme,
            "system"
        );
    }
}
