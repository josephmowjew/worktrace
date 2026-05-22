use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Utc;
use sqlx::{Row, SqlitePool};

use crate::application::repositories::{
    CommitStore, FocusSessionStore, ManualLogStore, NudgeDismissalStore, ProjectStore,
    ReportItemStore, ReportNoteStore, ReportStore, SettingsStore, WeeklyTaskStore, WorkspaceStore,
};
use crate::domain::activity::{
    ActivityDay, ActivityItem, HeatmapCell, HeatmapData, HeatmapInput, KeyHighlight,
    ListActivityInput, TopProject, WeekSummary, WeekSummaryInput,
};
use crate::domain::commit::Commit;
use crate::domain::focus_session::{
    CreateFocusSessionInput, FocusSession, FocusSessionStatus, ListFocusSessionsInput,
    StopFocusSessionInput,
};
use crate::domain::manual_log::{
    ActivityType, CreateManualLogInput, ManualLog, UpdateManualLogInput,
};
use crate::domain::nudge::{DismissNudgeInput, ListNudgeDismissalsInput, NudgeDismissal};
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
use crate::domain::workspace::{
    CreateWorkspaceInput, ImportWorkspaceRepositoriesInput, UpdateWorkspaceInput, Workspace,
    WorkspaceRepoDiscovery, WorkspaceRepositoryActionInput,
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
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, status, created_at, updated_at
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
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, status, created_at, updated_at
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
            description: normalize_optional(input.description),
            repo_path: normalize_optional(input.repo_path),
            github_url: normalize_optional(input.github_url),
            project_type: normalize_optional(input.project_type),
            workspace_id: None,
            workspace_relative_path: None,
            status: "active".to_string(),
            created_at: now.clone(),
            updated_at: now,
        };

        sqlx::query(
            r#"
            INSERT INTO projects (id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, status, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
        )
        .bind(&project.id)
        .bind(&project.name)
        .bind(&project.description)
        .bind(&project.repo_path)
        .bind(&project.github_url)
        .bind(&project.project_type)
        .bind(&project.workspace_id)
        .bind(&project.workspace_relative_path)
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

        if input.description.is_some() {
            project.description = normalize_optional(input.description);
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

        if input.workspace_id.is_some() {
            project.workspace_id = normalize_optional(input.workspace_id);
        }

        if input.workspace_relative_path.is_some() {
            project.workspace_relative_path = normalize_optional(input.workspace_relative_path);
        }

        if let Some(status) = input.status {
            project.status = status;
        }

        project.updated_at = current_timestamp();

        sqlx::query(
            r#"
            UPDATE projects
            SET name = ?2,
                description = ?3,
                repo_path = ?4,
                github_url = ?5,
                type = ?6,
                workspace_id = ?7,
                workspace_relative_path = ?8,
                status = ?9,
                updated_at = ?10
            WHERE id = ?1
            "#,
        )
        .bind(&project.id)
        .bind(&project.name)
        .bind(&project.description)
        .bind(&project.repo_path)
        .bind(&project.github_url)
        .bind(&project.project_type)
        .bind(&project.workspace_id)
        .bind(&project.workspace_relative_path)
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
                description: None,
                repo_path: None,
                github_url: None,
                project_type: None,
                workspace_id: None,
                workspace_relative_path: None,
                status: Some("archived".to_string()),
            },
        )
        .await
    }

    pub async fn find(&self, id: &str) -> Result<Option<Project>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, status, created_at, updated_at
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

pub struct WorkspaceRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> WorkspaceRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<Workspace>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, name, root_path, status, last_scanned_at, created_at, updated_at
            FROM workspaces
            ORDER BY status ASC, updated_at DESC, name ASC
            "#,
        )
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(workspace_from_row).collect())
    }

    pub async fn create(&self, input: CreateWorkspaceInput) -> Result<Workspace, sqlx::Error> {
        let now = current_timestamp();
        let workspace = Workspace {
            id: generate_id("workspace"),
            name: input.name.trim().to_string(),
            root_path: input.root_path.trim().to_string(),
            status: "active".to_string(),
            last_scanned_at: None,
            created_at: now.clone(),
            updated_at: now,
        };

        sqlx::query(
            r#"
            INSERT INTO workspaces (id, name, root_path, status, last_scanned_at, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
        )
        .bind(&workspace.id)
        .bind(&workspace.name)
        .bind(&workspace.root_path)
        .bind(&workspace.status)
        .bind(&workspace.last_scanned_at)
        .bind(&workspace.created_at)
        .bind(&workspace.updated_at)
        .execute(self.pool)
        .await?;

        Ok(workspace)
    }

    pub async fn update(
        &self,
        id: &str,
        input: UpdateWorkspaceInput,
    ) -> Result<Option<Workspace>, sqlx::Error> {
        let Some(mut workspace) = self.find(id).await? else {
            return Ok(None);
        };

        if let Some(name) = input.name {
            workspace.name = name.trim().to_string();
        }
        if let Some(root_path) = input.root_path {
            workspace.root_path = root_path.trim().to_string();
        }
        if let Some(status) = input.status {
            workspace.status = status;
        }
        workspace.updated_at = current_timestamp();

        sqlx::query(
            r#"
            UPDATE workspaces
            SET name = ?2,
                root_path = ?3,
                status = ?4,
                last_scanned_at = ?5,
                updated_at = ?6
            WHERE id = ?1
            "#,
        )
        .bind(&workspace.id)
        .bind(&workspace.name)
        .bind(&workspace.root_path)
        .bind(&workspace.status)
        .bind(&workspace.last_scanned_at)
        .bind(&workspace.updated_at)
        .execute(self.pool)
        .await?;

        Ok(Some(workspace))
    }

    pub async fn archive(&self, id: &str) -> Result<Option<Workspace>, sqlx::Error> {
        self.update(
            id,
            UpdateWorkspaceInput {
                name: None,
                root_path: None,
                status: Some("archived".to_string()),
            },
        )
        .await
    }

    pub async fn find(&self, id: &str) -> Result<Option<Workspace>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, name, root_path, status, last_scanned_at, created_at, updated_at
            FROM workspaces
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(workspace_from_row))
    }

    pub async fn mark_scanned(&self, id: &str) -> Result<(), sqlx::Error> {
        let now = current_timestamp();
        sqlx::query(
            r#"
            UPDATE workspaces
            SET last_scanned_at = ?2,
                updated_at = ?2
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn classify_discoveries(
        &self,
        workspace_id: &str,
        mut discovered: Vec<WorkspaceRepoDiscovery>,
    ) -> Result<Vec<WorkspaceRepoDiscovery>, sqlx::Error> {
        for discovery in &mut discovered {
            if let Some((project_id, project_name, project_status)) =
                self.project_for_repo_path(&discovery.repo_path).await?
            {
                discovery.status = if project_status == "archived" {
                    "archived".to_string()
                } else {
                    "imported".to_string()
                };
                discovery.project_id = Some(project_id);
                discovery.project_name = Some(project_name);
            } else if self.is_ignored(workspace_id, &discovery.repo_path).await? {
                discovery.status = "ignored".to_string();
            }
        }

        self.mark_scanned(workspace_id).await?;
        Ok(discovered)
    }

    pub async fn import_repositories(
        &self,
        input: ImportWorkspaceRepositoriesInput,
    ) -> Result<Vec<Project>, sqlx::Error> {
        let Some(workspace) = self.find(&input.workspace_id).await? else {
            return Ok(Vec::new());
        };

        let mut imported = Vec::new();

        for repo in input.repositories {
            let repo_path = repo.repo_path.trim().to_string();
            let relative = relative_path(&workspace.root_path, &repo_path);

            if let Some(project) = self.find_project_by_repo_path(&repo_path).await? {
                let attached = self
                    .attach_project_to_workspace(&project.id, &workspace.id, &relative)
                    .await?;
                imported.push(attached.unwrap_or(project));
                continue;
            }

            let now = current_timestamp();
            let project = Project {
                id: generate_id("project"),
                name: repo
                    .name
                    .and_then(|name| normalize_optional(Some(name)))
                    .unwrap_or_else(|| suggested_name_from_path(&repo_path)),
                description: None,
                repo_path: Some(repo_path),
                github_url: None,
                project_type: normalize_optional(repo.project_type),
                workspace_id: Some(workspace.id.clone()),
                workspace_relative_path: Some(relative),
                status: "active".to_string(),
                created_at: now.clone(),
                updated_at: now,
            };

            sqlx::query(
                r#"
                INSERT INTO projects (id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, status, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                "#,
            )
            .bind(&project.id)
            .bind(&project.name)
            .bind(&project.description)
            .bind(&project.repo_path)
            .bind(&project.github_url)
            .bind(&project.project_type)
            .bind(&project.workspace_id)
            .bind(&project.workspace_relative_path)
            .bind(&project.status)
            .bind(&project.created_at)
            .bind(&project.updated_at)
            .execute(self.pool)
            .await?;

            imported.push(project);
        }

        Ok(imported)
    }

    pub async fn ignore_repository(
        &self,
        input: WorkspaceRepositoryActionInput,
    ) -> Result<(), sqlx::Error> {
        let Some(workspace) = self.find(&input.workspace_id).await? else {
            return Ok(());
        };
        let now = current_timestamp();
        let relative = relative_path(&workspace.root_path, &input.repo_path);

        sqlx::query(
            r#"
            INSERT OR IGNORE INTO workspace_repo_ignores (id, workspace_id, repo_path, relative_path, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
        )
        .bind(generate_id("ignore"))
        .bind(&input.workspace_id)
        .bind(input.repo_path.trim())
        .bind(relative)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn unignore_repository(
        &self,
        input: WorkspaceRepositoryActionInput,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            DELETE FROM workspace_repo_ignores
            WHERE workspace_id = ?1 AND repo_path = ?2
            "#,
        )
        .bind(&input.workspace_id)
        .bind(input.repo_path.trim())
        .execute(self.pool)
        .await?;

        Ok(())
    }

    async fn project_for_repo_path(
        &self,
        repo_path: &str,
    ) -> Result<Option<(String, String, String)>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, name, status
            FROM projects
            "#,
        )
        .fetch_all(self.pool)
        .await?;

        for row in rows {
            let project_id: String = row.get("id");
            let project_name: String = row.get("name");
            let project_status: String = row.get("status");
            let project = self.find_project_by_id(&project_id).await?;
            if project
                .and_then(|project| project.repo_path)
                .map(|path| paths_match(&path, repo_path))
                .unwrap_or(false)
            {
                return Ok(Some((project_id, project_name, project_status)));
            }
        }

        Ok(None)
    }

    async fn find_project_by_repo_path(
        &self,
        repo_path: &str,
    ) -> Result<Option<Project>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, status, created_at, updated_at
            FROM projects
            "#,
        )
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(project_from_row).find(|project| {
            project
                .repo_path
                .as_deref()
                .map(|path| paths_match(path, repo_path))
                .unwrap_or(false)
        }))
    }

    async fn find_project_by_id(&self, project_id: &str) -> Result<Option<Project>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, status, created_at, updated_at
            FROM projects
            WHERE id = ?1
            "#,
        )
        .bind(project_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(project_from_row))
    }

    async fn attach_project_to_workspace(
        &self,
        project_id: &str,
        workspace_id: &str,
        workspace_relative_path: &str,
    ) -> Result<Option<Project>, sqlx::Error> {
        let now = current_timestamp();
        sqlx::query(
            r#"
            UPDATE projects
            SET workspace_id = ?2,
                workspace_relative_path = ?3,
                status = 'active',
                updated_at = ?4
            WHERE id = ?1
            "#,
        )
        .bind(project_id)
        .bind(workspace_id)
        .bind(workspace_relative_path)
        .bind(now)
        .execute(self.pool)
        .await?;

        let row = sqlx::query(
            r#"
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, status, created_at, updated_at
            FROM projects
            WHERE id = ?1
            "#,
        )
        .bind(project_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(project_from_row))
    }

    async fn is_ignored(&self, workspace_id: &str, repo_path: &str) -> Result<bool, sqlx::Error> {
        let exists: Option<i64> = sqlx::query_scalar(
            r#"
            SELECT 1
            FROM workspace_repo_ignores
            WHERE workspace_id = ?1 AND repo_path = ?2
            LIMIT 1
            "#,
        )
        .bind(workspace_id)
        .bind(repo_path)
        .fetch_optional(self.pool)
        .await?;

        Ok(exists.is_some())
    }
}

#[async_trait::async_trait]
impl WorkspaceStore for WorkspaceRepository<'_> {
    async fn list(&self) -> Result<Vec<Workspace>, sqlx::Error> {
        WorkspaceRepository::list(self).await
    }

    async fn create(&self, input: CreateWorkspaceInput) -> Result<Workspace, sqlx::Error> {
        WorkspaceRepository::create(self, input).await
    }

    async fn update(
        &self,
        id: &str,
        input: UpdateWorkspaceInput,
    ) -> Result<Option<Workspace>, sqlx::Error> {
        WorkspaceRepository::update(self, id, input).await
    }

    async fn archive(&self, id: &str) -> Result<Option<Workspace>, sqlx::Error> {
        WorkspaceRepository::archive(self, id).await
    }

    async fn scan(
        &self,
        workspace_id: &str,
        discovered: Vec<WorkspaceRepoDiscovery>,
    ) -> Result<Vec<WorkspaceRepoDiscovery>, sqlx::Error> {
        WorkspaceRepository::classify_discoveries(self, workspace_id, discovered).await
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
                JOIN projects ON projects.id = commits.project_id
                WHERE projects.status = 'active'
                  AND substr(commits.committed_at, 1, 10) >= ?1
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
                  AND (
                    manual_logs.project_id IS NULL
                    OR projects.status = 'active'
                  )
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

    pub async fn get_heatmap_data(&self, input: HeatmapInput) -> Result<HeatmapData, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
                (CAST(strftime('%w', commits.committed_at) AS INTEGER) + 6) % 7 AS day,
                CAST(strftime('%H', commits.committed_at) AS INTEGER) AS hour,
                COUNT(*) AS count
            FROM commits
            JOIN projects ON projects.id = commits.project_id
            WHERE projects.status = 'active'
              AND substr(commits.committed_at, 1, 10) >= ?1
              AND substr(commits.committed_at, 1, 10) <= ?2
            GROUP BY day, hour
            ORDER BY day, hour
            "#,
        )
        .bind(&input.from)
        .bind(&input.to)
        .fetch_all(self.pool)
        .await?;

        let mut cells = Vec::new();
        let mut max_count: i64 = 0;

        for row in rows {
            let day: i64 = row.get("day");
            let hour: i64 = row.get("hour");
            let count: i64 = row.get("count");

            if day >= 1 && day <= 5 {
                if count > max_count {
                    max_count = count;
                }
                cells.push(HeatmapCell { day, hour, count });
            }
        }

        Ok(HeatmapData { cells, max_count })
    }

    pub async fn get_week_summary(
        &self,
        input: WeekSummaryInput,
    ) -> Result<WeekSummary, sqlx::Error> {
        let current_stats = self
            .get_week_stats(&input.from, &input.to, &input.project_ids)
            .await?;

        let from_date = chrono::NaiveDate::parse_from_str(&input.from, "%Y-%m-%d")
            .unwrap_or(chrono::NaiveDate::from_ymd_opt(2024, 1, 1).unwrap());
        let prev_from = from_date
            .pred_opt()
            .unwrap()
            .pred_opt()
            .unwrap()
            .pred_opt()
            .unwrap()
            .pred_opt()
            .unwrap()
            .pred_opt()
            .unwrap()
            .pred_opt()
            .unwrap()
            .format("%Y-%m-%d")
            .to_string();
        let prev_to = from_date.pred_opt().unwrap().format("%Y-%m-%d").to_string();

        let prev_stats = self
            .get_week_stats(&prev_from, &prev_to, &input.project_ids)
            .await?;

        let calc_trend = |current: i64, previous: i64| -> f64 {
            if previous == 0 {
                if current > 0 {
                    100.0
                } else {
                    0.0
                }
            } else {
                ((current as f64 - previous as f64) / previous as f64) * 100.0
            }
        };

        let top_project = self
            .get_top_project(&input.from, &input.to, &input.project_ids)
            .await?;

        Ok(WeekSummary {
            total_activities: current_stats.total,
            total_activities_trend: calc_trend(current_stats.total, prev_stats.total),
            coding_time_minutes: current_stats.commits * 30,
            coding_time_trend: calc_trend(current_stats.commits * 30, prev_stats.commits * 30),
            meeting_count: current_stats.meetings,
            meeting_trend: calc_trend(current_stats.meetings, prev_stats.meetings),
            deployment_count: current_stats.deployments,
            deployment_trend: calc_trend(current_stats.deployments, prev_stats.deployments),
            top_project,
            focus_time_minutes: current_stats.commits * 30,
        })
    }

    pub async fn get_key_highlights(
        &self,
        input: WeekSummaryInput,
    ) -> Result<Vec<KeyHighlight>, sqlx::Error> {
        let stats = self
            .get_week_stats(&input.from, &input.to, &input.project_ids)
            .await?;

        let from_date = chrono::NaiveDate::parse_from_str(&input.from, "%Y-%m-%d")
            .unwrap_or(chrono::NaiveDate::from_ymd_opt(2024, 1, 1).unwrap());
        let prev_from = from_date
            .pred_opt()
            .unwrap()
            .pred_opt()
            .unwrap()
            .pred_opt()
            .unwrap()
            .pred_opt()
            .unwrap()
            .pred_opt()
            .unwrap()
            .pred_opt()
            .unwrap()
            .format("%Y-%m-%d")
            .to_string();
        let prev_to = from_date.pred_opt().unwrap().format("%Y-%m-%d").to_string();

        let prev_stats = self
            .get_week_stats(&prev_from, &prev_to, &input.project_ids)
            .await?;

        let calc_trend = |current: i64, previous: i64| -> f64 {
            if previous == 0 {
                if current > 0 {
                    100.0
                } else {
                    0.0
                }
            } else {
                ((current as f64 - previous as f64) / previous as f64) * 100.0
            }
        };

        let mut highlights = Vec::new();

        if stats.commits > 0 {
            let projects = self
                .get_project_count(&input.from, &input.to, &input.project_ids)
                .await?;
            highlights.push(KeyHighlight {
                title: "Most Code Committed".to_string(),
                description: format!("{} commits across {} repositories", stats.commits, projects),
                trend: calc_trend(stats.commits, prev_stats.commits),
                icon: "code".to_string(),
            });
        }

        if stats.deployments > 0 {
            highlights.push(KeyHighlight {
                title: "Shipped Improvement".to_string(),
                description: format!("{} production deployments", stats.deployments),
                trend: calc_trend(stats.deployments, prev_stats.deployments),
                icon: "rocket".to_string(),
            });
        }

        let testing_count = stats.testing;
        if testing_count > 0 {
            highlights.push(KeyHighlight {
                title: "Quality Focus".to_string(),
                description: format!("{} test cases executed", testing_count),
                trend: calc_trend(testing_count, prev_stats.testing),
                icon: "flask".to_string(),
            });
        }

        if stats.meetings > 0 {
            highlights.push(KeyHighlight {
                title: "Strong Collaboration".to_string(),
                description: format!("{} meetings held", stats.meetings),
                trend: calc_trend(stats.meetings, prev_stats.meetings),
                icon: "users".to_string(),
            });
        }

        Ok(highlights)
    }

    async fn get_week_stats(
        &self,
        from: &str,
        to: &str,
        _project_ids: &Option<Vec<String>>,
    ) -> Result<WeekStats, sqlx::Error> {
        let commit_rows = sqlx::query(
            r#"
            SELECT COUNT(*) AS count
            FROM commits
            JOIN projects ON projects.id = commits.project_id
            WHERE projects.status = 'active'
              AND substr(commits.committed_at, 1, 10) >= ?1
              AND substr(commits.committed_at, 1, 10) <= ?2
            "#,
        )
        .bind(from)
        .bind(to)
        .fetch_one(self.pool)
        .await?;

        let commits: i64 = commit_rows.get("count");

        let manual_rows = sqlx::query(
            r#"
            SELECT activity_type, COUNT(*) AS count
            FROM manual_logs
            LEFT JOIN projects ON projects.id = manual_logs.project_id
            WHERE manual_logs.date >= ?1
              AND manual_logs.date <= ?2
              AND (
                manual_logs.project_id IS NULL
                OR projects.status = 'active'
              )
            GROUP BY manual_logs.activity_type
            "#,
        )
        .bind(from)
        .bind(to)
        .fetch_all(self.pool)
        .await?;

        let mut meetings: i64 = 0;
        let mut deployments: i64 = 0;
        let mut testing: i64 = 0;

        for row in manual_rows {
            let activity_type: String = row.get("activity_type");
            let count: i64 = row.get("count");
            match activity_type.as_str() {
                "Meeting" => meetings += count,
                "Deployment" => deployments += count,
                "Testing" => testing += count,
                _ => {}
            }
        }

        let total = commits
            + meetings
            + deployments
            + testing
            + sqlx::query_scalar::<_, i64>(
                r#"
                SELECT COUNT(*)
                FROM manual_logs
                LEFT JOIN projects ON projects.id = manual_logs.project_id
                WHERE manual_logs.date >= ?1
                  AND manual_logs.date <= ?2
                  AND manual_logs.activity_type NOT IN ('Meeting', 'Deployment', 'Testing')
                  AND (
                    manual_logs.project_id IS NULL
                    OR projects.status = 'active'
                  )
                "#,
            )
            .bind(from)
            .bind(to)
            .fetch_one(self.pool)
            .await?;

        Ok(WeekStats {
            total,
            commits,
            meetings,
            deployments,
            testing,
        })
    }

    async fn get_top_project(
        &self,
        from: &str,
        to: &str,
        _project_ids: &Option<Vec<String>>,
    ) -> Result<TopProject, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT projects.name, COUNT(*) AS count
            FROM commits
            JOIN projects ON projects.id = commits.project_id
            WHERE projects.status = 'active'
              AND substr(commits.committed_at, 1, 10) >= ?1
              AND substr(commits.committed_at, 1, 10) <= ?2
            GROUP BY commits.project_id
            ORDER BY count DESC
            LIMIT 1
            "#,
        )
        .bind(from)
        .bind(to)
        .fetch_optional(self.pool)
        .await?;

        match row {
            Some(row) => Ok(TopProject {
                name: row.get("name"),
                count: row.get("count"),
            }),
            None => Ok(TopProject {
                name: "No projects".to_string(),
                count: 0,
            }),
        }
    }

    async fn get_project_count(
        &self,
        from: &str,
        to: &str,
        _project_ids: &Option<Vec<String>>,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT COUNT(DISTINCT project_id) AS count
            FROM commits
            JOIN projects ON projects.id = commits.project_id
            WHERE projects.status = 'active'
              AND substr(commits.committed_at, 1, 10) >= ?1
              AND substr(commits.committed_at, 1, 10) <= ?2
            "#,
        )
        .bind(from)
        .bind(to)
        .fetch_one(self.pool)
        .await?;

        Ok(row.get("count"))
    }
}

struct WeekStats {
    total: i64,
    commits: i64,
    meetings: i64,
    deployments: i64,
    testing: i64,
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
            SELECT manual_logs.id,
                   manual_logs.project_id,
                   manual_logs.date,
                   manual_logs.activity_type,
                   manual_logs.summary,
                   manual_logs.outcome,
                   manual_logs.duration_minutes,
                   manual_logs.follow_up,
                   manual_logs.included_in_report
            FROM manual_logs
            LEFT JOIN projects ON projects.id = manual_logs.project_id
            WHERE manual_logs.date >= ?1
              AND manual_logs.date <= ?2
              AND (
                manual_logs.project_id IS NULL
                OR projects.status = 'active'
              )
            ORDER BY manual_logs.date ASC, manual_logs.created_at ASC
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

    pub async fn find_daily_review_by_date(
        &self,
        date: &str,
    ) -> Result<Option<ReportNote>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, project_id, note_type, date, content, included_in_report, created_at, updated_at
            FROM report_notes
            WHERE date = ?1 AND note_type = 'daily_review'
            ORDER BY updated_at DESC
            LIMIT 1
            "#,
        )
        .bind(date)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(report_note_from_row))
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
                   weekly_tasks.progress_percent,
                   weekly_tasks.created_at,
                   weekly_tasks.updated_at
            FROM weekly_tasks
            LEFT JOIN projects ON projects.id = weekly_tasks.project_id
            WHERE (
                (
                  weekly_tasks.week_start_date >= ?1
                  AND weekly_tasks.week_start_date <= ?2
                )
                OR (
                  weekly_tasks.week_start_date < ?1
                  AND weekly_tasks.status IN ('todo', 'in_progress', 'blocked')
                )
              )
              AND (
                weekly_tasks.project_id IS NULL
                OR projects.status = 'active'
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
        let progress_percent = input.progress_percent;
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
            progress_percent,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        sqlx::query(
            r#"
            INSERT INTO weekly_tasks (
              id, project_id, task_type, status, title, details, week_start_date,
              target_date, completed_at, priority, included_in_report, progress_percent, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
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
        .bind(task.progress_percent)
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
        if input.progress_percent.is_some() {
            task.progress_percent = input.progress_percent;
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
                progress_percent = ?12,
                updated_at = ?13
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
        .bind(task.progress_percent)
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
                   weekly_tasks.progress_percent,
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

pub struct FocusSessionRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> FocusSessionRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn active(&self) -> Result<Option<FocusSession>, sqlx::Error> {
        let sql = focus_session_select_sql("WHERE focus_sessions.status = 'active' LIMIT 1");
        let row = sqlx::query(&sql).fetch_optional(self.pool).await?;

        Ok(row.map(focus_session_from_row))
    }

    pub async fn list(
        &self,
        input: ListFocusSessionsInput,
    ) -> Result<Vec<FocusSession>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT focus_sessions.id,
                   focus_sessions.project_id,
                   projects.name AS project_name,
                   focus_sessions.task_id,
                   weekly_tasks.title AS task_title,
                   focus_sessions.title,
                   focus_sessions.notes,
                   focus_sessions.status,
                   focus_sessions.started_at,
                   focus_sessions.ended_at,
                   focus_sessions.duration_minutes,
                   focus_sessions.manual_log_id,
                   focus_sessions.created_at,
                   focus_sessions.updated_at
            FROM focus_sessions
            LEFT JOIN projects ON projects.id = focus_sessions.project_id
            LEFT JOIN weekly_tasks ON weekly_tasks.id = focus_sessions.task_id
            WHERE (?1 IS NULL OR substr(focus_sessions.started_at, 1, 10) >= ?1)
              AND (?2 IS NULL OR substr(focus_sessions.started_at, 1, 10) <= ?2)
            ORDER BY focus_sessions.started_at DESC
            "#,
        )
        .bind(&input.from)
        .bind(&input.to)
        .fetch_all(self.pool)
        .await?;

        let mut sessions = Vec::new();
        for row in rows {
            let session = focus_session_from_row(row);
            if input
                .status
                .as_ref()
                .map(|status| session.status != *status)
                .unwrap_or(false)
            {
                continue;
            }
            if let Some(project_ids) = &input.project_ids {
                match &session.project_id {
                    Some(project_id) if project_ids.iter().any(|id| id == project_id) => {}
                    _ => continue,
                }
            }
            sessions.push(session);
        }

        Ok(sessions)
    }

    pub async fn create(
        &self,
        input: CreateFocusSessionInput,
    ) -> Result<FocusSession, sqlx::Error> {
        let now = current_timestamp();
        let title = input
            .title
            .and_then(|title| normalize_optional(Some(title)))
            .unwrap_or_else(|| "Focus session".to_string());
        let session = FocusSession {
            id: generate_id("focus_session"),
            project_id: normalize_optional(input.project_id),
            project_name: None,
            task_id: normalize_optional(input.task_id),
            task_title: None,
            title,
            notes: normalize_optional(input.notes),
            status: FocusSessionStatus::Active,
            started_at: now.clone(),
            ended_at: None,
            duration_minutes: None,
            manual_log_id: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        sqlx::query(
            r#"
            INSERT INTO focus_sessions (
              id, project_id, task_id, title, notes, status, started_at, ended_at,
              duration_minutes, manual_log_id, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
        )
        .bind(&session.id)
        .bind(&session.project_id)
        .bind(&session.task_id)
        .bind(&session.title)
        .bind(&session.notes)
        .bind(session.status.as_storage_value())
        .bind(&session.started_at)
        .bind(&session.ended_at)
        .bind(session.duration_minutes)
        .bind(&session.manual_log_id)
        .bind(&session.created_at)
        .bind(&session.updated_at)
        .execute(self.pool)
        .await?;

        Ok(session)
    }

    pub async fn stop(
        &self,
        id: &str,
        input: StopFocusSessionInput,
    ) -> Result<Option<FocusSession>, sqlx::Error> {
        let Some(mut session) = self.find(id).await? else {
            return Ok(None);
        };
        if session.status != FocusSessionStatus::Active {
            return Ok(Some(session));
        }

        let now = current_timestamp();
        session.status = FocusSessionStatus::Completed;
        session.ended_at = Some(now.clone());
        session.duration_minutes = Some(minutes_between(&session.started_at, &now).max(1));
        if input.notes.is_some() {
            session.notes = normalize_optional(input.notes);
        }
        session.updated_at = now;
        self.persist(&session).await?;
        self.find(id).await
    }

    pub async fn cancel(&self, id: &str) -> Result<Option<FocusSession>, sqlx::Error> {
        self.set_status(id, FocusSessionStatus::Cancelled).await
    }

    pub async fn set_status(
        &self,
        id: &str,
        status: FocusSessionStatus,
    ) -> Result<Option<FocusSession>, sqlx::Error> {
        let Some(mut session) = self.find(id).await? else {
            return Ok(None);
        };
        session.status = status;
        session.ended_at = Some(current_timestamp());
        session.updated_at = session.ended_at.clone().unwrap_or_else(current_timestamp);
        self.persist(&session).await?;
        self.find(id).await
    }

    pub async fn set_manual_log(
        &self,
        id: &str,
        manual_log_id: &str,
    ) -> Result<Option<FocusSession>, sqlx::Error> {
        let Some(mut session) = self.find(id).await? else {
            return Ok(None);
        };
        session.manual_log_id = Some(manual_log_id.to_string());
        session.updated_at = current_timestamp();
        self.persist(&session).await?;
        self.find(id).await
    }

    async fn find(&self, id: &str) -> Result<Option<FocusSession>, sqlx::Error> {
        let sql = focus_session_select_sql("WHERE focus_sessions.id = ?1");
        let row = sqlx::query(&sql).bind(id).fetch_optional(self.pool).await?;

        Ok(row.map(focus_session_from_row))
    }

    async fn persist(&self, session: &FocusSession) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE focus_sessions
            SET project_id = ?2,
                task_id = ?3,
                title = ?4,
                notes = ?5,
                status = ?6,
                started_at = ?7,
                ended_at = ?8,
                duration_minutes = ?9,
                manual_log_id = ?10,
                updated_at = ?11
            WHERE id = ?1
            "#,
        )
        .bind(&session.id)
        .bind(&session.project_id)
        .bind(&session.task_id)
        .bind(&session.title)
        .bind(&session.notes)
        .bind(session.status.as_storage_value())
        .bind(&session.started_at)
        .bind(&session.ended_at)
        .bind(session.duration_minutes)
        .bind(&session.manual_log_id)
        .bind(&session.updated_at)
        .execute(self.pool)
        .await?;

        Ok(())
    }
}

#[async_trait::async_trait]
impl FocusSessionStore for FocusSessionRepository<'_> {
    async fn active(&self) -> Result<Option<FocusSession>, sqlx::Error> {
        FocusSessionRepository::active(self).await
    }

    async fn list(&self, input: ListFocusSessionsInput) -> Result<Vec<FocusSession>, sqlx::Error> {
        FocusSessionRepository::list(self, input).await
    }

    async fn create(&self, input: CreateFocusSessionInput) -> Result<FocusSession, sqlx::Error> {
        FocusSessionRepository::create(self, input).await
    }

    async fn stop(
        &self,
        id: &str,
        input: StopFocusSessionInput,
    ) -> Result<Option<FocusSession>, sqlx::Error> {
        FocusSessionRepository::stop(self, id, input).await
    }

    async fn cancel(&self, id: &str) -> Result<Option<FocusSession>, sqlx::Error> {
        FocusSessionRepository::cancel(self, id).await
    }

    async fn set_status(
        &self,
        id: &str,
        status: FocusSessionStatus,
    ) -> Result<Option<FocusSession>, sqlx::Error> {
        FocusSessionRepository::set_status(self, id, status).await
    }

    async fn set_manual_log(
        &self,
        id: &str,
        manual_log_id: &str,
    ) -> Result<Option<FocusSession>, sqlx::Error> {
        FocusSessionRepository::set_manual_log(self, id, manual_log_id).await
    }
}

pub struct NudgeDismissalRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> NudgeDismissalRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(
        &self,
        input: ListNudgeDismissalsInput,
    ) -> Result<Vec<NudgeDismissal>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, nudge_key, scope, dismissed_for_date, created_at
            FROM nudge_dismissals
            WHERE dismissed_for_date = ?1
              AND (?2 IS NULL OR scope = ?2)
            ORDER BY created_at DESC
            "#,
        )
        .bind(input.dismissed_for_date.trim())
        .bind(normalize_optional(input.scope))
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(nudge_dismissal_from_row).collect())
    }

    pub async fn dismiss(&self, input: DismissNudgeInput) -> Result<NudgeDismissal, sqlx::Error> {
        let now = current_timestamp();
        let nudge_key = input.nudge_key.trim().to_string();
        let scope = normalize_optional(input.scope);
        let dismissed_for_date = input.dismissed_for_date.trim().to_string();

        sqlx::query(
            r#"
            INSERT INTO nudge_dismissals (id, nudge_key, scope, dismissed_for_date, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(nudge_key, dismissed_for_date, scope) DO UPDATE SET
              created_at = excluded.created_at
            "#,
        )
        .bind(generate_id("nudge_dismissal"))
        .bind(&nudge_key)
        .bind(&scope)
        .bind(&dismissed_for_date)
        .bind(&now)
        .execute(self.pool)
        .await?;

        let row = sqlx::query(
            r#"
            SELECT id, nudge_key, scope, dismissed_for_date, created_at
            FROM nudge_dismissals
            WHERE nudge_key = ?1
              AND dismissed_for_date = ?2
              AND (?3 IS NULL OR scope = ?3)
            "#,
        )
        .bind(&nudge_key)
        .bind(&dismissed_for_date)
        .bind(&scope)
        .fetch_one(self.pool)
        .await?;

        Ok(nudge_dismissal_from_row(row))
    }
}

#[async_trait::async_trait]
impl NudgeDismissalStore for NudgeDismissalRepository<'_> {
    async fn list(
        &self,
        input: ListNudgeDismissalsInput,
    ) -> Result<Vec<NudgeDismissal>, sqlx::Error> {
        NudgeDismissalRepository::list(self, input).await
    }

    async fn dismiss(&self, input: DismissNudgeInput) -> Result<NudgeDismissal, sqlx::Error> {
        NudgeDismissalRepository::dismiss(self, input).await
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
        if let Some(value) = input.backup_enabled {
            settings.backup_enabled = value;
        }
        if let Some(value) = input.backup_schedule {
            settings.backup_schedule = value;
        }
        if let Some(value) = input.backup_time {
            settings.backup_time = value;
        }
        if let Some(value) = input.backup_day {
            settings.backup_day = value;
        }
        if let Some(value) = input.backup_storage_mode {
            settings.backup_storage_mode = value;
        }
        if let Some(value) = input.backup_storage_location {
            settings.backup_storage_location = value;
        }
        if let Some(value) = input.online_backup_status {
            settings.online_backup_status = value;
        }
        if let Some(value) = input.online_backup_provider {
            settings.online_backup_provider = value;
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
        self.upsert(
            "backup.enabled",
            if settings.backup_enabled {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert("backup.schedule", &settings.backup_schedule)
            .await?;
        self.upsert("backup.time", &settings.backup_time).await?;
        self.upsert("backup.day", &settings.backup_day).await?;
        self.upsert("backup.storage_mode", &settings.backup_storage_mode)
            .await?;
        self.upsert("backup.storage_location", &settings.backup_storage_location)
            .await?;
        self.upsert("backup.online_status", &settings.online_backup_status)
            .await?;
        self.upsert("backup.online_provider", &settings.online_backup_provider)
            .await?;

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
        progress_percent: row.get("progress_percent"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn focus_session_from_row(row: sqlx::sqlite::SqliteRow) -> FocusSession {
    let status: String = row.get("status");

    FocusSession {
        id: row.get("id"),
        project_id: row.get("project_id"),
        project_name: row.get("project_name"),
        task_id: row.get("task_id"),
        task_title: row.get("task_title"),
        title: row.get("title"),
        notes: row.get("notes"),
        status: FocusSessionStatus::try_from(status).unwrap_or(FocusSessionStatus::Cancelled),
        started_at: row.get("started_at"),
        ended_at: row.get("ended_at"),
        duration_minutes: row.get("duration_minutes"),
        manual_log_id: row.get("manual_log_id"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn nudge_dismissal_from_row(row: sqlx::sqlite::SqliteRow) -> NudgeDismissal {
    NudgeDismissal {
        id: row.get("id"),
        nudge_key: row.get("nudge_key"),
        scope: row.get("scope"),
        dismissed_for_date: row.get("dismissed_for_date"),
        created_at: row.get("created_at"),
    }
}

fn focus_session_select_sql(where_clause: &str) -> String {
    format!(
        r#"
        SELECT focus_sessions.id,
               focus_sessions.project_id,
               projects.name AS project_name,
               focus_sessions.task_id,
               weekly_tasks.title AS task_title,
               focus_sessions.title,
               focus_sessions.notes,
               focus_sessions.status,
               focus_sessions.started_at,
               focus_sessions.ended_at,
               focus_sessions.duration_minutes,
               focus_sessions.manual_log_id,
               focus_sessions.created_at,
               focus_sessions.updated_at
        FROM focus_sessions
        LEFT JOIN projects ON projects.id = focus_sessions.project_id
        LEFT JOIN weekly_tasks ON weekly_tasks.id = focus_sessions.task_id
        {where_clause}
        "#
    )
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
        "backup.enabled" => settings.backup_enabled = value == "true",
        "backup.schedule" => settings.backup_schedule = value,
        "backup.time" => settings.backup_time = value,
        "backup.day" => settings.backup_day = value,
        "backup.storage_mode" => settings.backup_storage_mode = value,
        "backup.storage_location" => settings.backup_storage_location = value,
        "backup.online_status" => settings.online_backup_status = value,
        "backup.online_provider" => settings.online_backup_provider = value,
        _ => {}
    }
}

fn project_from_row(row: sqlx::sqlite::SqliteRow) -> Project {
    Project {
        id: row.get("id"),
        name: row.get("name"),
        description: row.get("description"),
        repo_path: row.get("repo_path"),
        github_url: row.get("github_url"),
        project_type: row.get("type"),
        workspace_id: row.get("workspace_id"),
        workspace_relative_path: row.get("workspace_relative_path"),
        status: row.get("status"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn workspace_from_row(row: sqlx::sqlite::SqliteRow) -> Workspace {
    Workspace {
        id: row.get("id"),
        name: row.get("name"),
        root_path: row.get("root_path"),
        status: row.get("status"),
        last_scanned_at: row.get("last_scanned_at"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn relative_path(root_path: &str, repo_path: &str) -> String {
    let root = std::path::Path::new(root_path);
    let repo = std::path::Path::new(repo_path);

    repo.strip_prefix(root)
        .ok()
        .filter(|path| !path.as_os_str().is_empty())
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string())
}

fn suggested_name_from_path(repo_path: &str) -> String {
    std::path::Path::new(repo_path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "Repository".to_string())
}

fn paths_match(left: &str, right: &str) -> bool {
    canonical_or_original(left).eq_ignore_ascii_case(&canonical_or_original(right))
}

fn canonical_or_original(path: &str) -> String {
    std::path::Path::new(path)
        .canonicalize()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|_| path.trim().replace('/', "\\"))
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

fn minutes_between(started_at: &str, ended_at: &str) -> i64 {
    let started = chrono::DateTime::parse_from_rfc3339(started_at);
    let ended = chrono::DateTime::parse_from_rfc3339(ended_at);

    match (started, ended) {
        (Ok(started), Ok(ended)) => (ended - started).num_minutes(),
        _ => 0,
    }
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
    use crate::application::focus_sessions::FocusSessionService;
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
                description: None,
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

        let workspace_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'",
        )
        .fetch_one(&pool)
        .await
        .expect("query workspace table");

        let project_workspace_column: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pragma_table_info('projects') WHERE name = 'workspace_id'",
        )
        .fetch_one(&pool)
        .await
        .expect("query project workspace column");

        assert_eq!(workspace_count, 1);
        assert_eq!(project_workspace_column, 1);
    }

    #[tokio::test]
    async fn project_create_list_update_archive_works() {
        let pool = test_pool().await;
        let repository = ProjectRepository::new(&pool);
        let project = repository
            .create(CreateProjectInput {
                name: "Sparc Website".to_string(),
                description: None,
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
                    description: None,
                    repo_path: None,
                    github_url: None,
                    project_type: None,
                    workspace_id: None,
                    workspace_relative_path: None,
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
    async fn workspace_create_scan_import_and_ignore_work() {
        let pool = test_pool().await;
        let repository = WorkspaceRepository::new(&pool);
        let workspace = repository
            .create(CreateWorkspaceInput {
                name: "Documents Projects".to_string(),
                root_path: "C:\\Users\\Sparc\\Documents\\projects".to_string(),
            })
            .await
            .expect("create workspace");

        let ignored_repo = "C:\\Users\\Sparc\\Documents\\projects\\Ignored";
        repository
            .ignore_repository(WorkspaceRepositoryActionInput {
                workspace_id: workspace.id.clone(),
                repo_path: ignored_repo.to_string(),
            })
            .await
            .expect("ignore repo");

        let discoveries = repository
            .classify_discoveries(
                &workspace.id,
                vec![
                    WorkspaceRepoDiscovery {
                        repo_path: "C:\\Users\\Sparc\\Documents\\projects\\API".to_string(),
                        relative_path: "API".to_string(),
                        suggested_name: "API".to_string(),
                        status: "new".to_string(),
                        project_id: None,
                        project_name: None,
                    },
                    WorkspaceRepoDiscovery {
                        repo_path: ignored_repo.to_string(),
                        relative_path: "Ignored".to_string(),
                        suggested_name: "Ignored".to_string(),
                        status: "new".to_string(),
                        project_id: None,
                        project_name: None,
                    },
                ],
            )
            .await
            .expect("classify discoveries");

        assert_eq!(discoveries[0].status, "new");
        assert_eq!(discoveries[1].status, "ignored");

        let imported = repository
            .import_repositories(ImportWorkspaceRepositoriesInput {
                workspace_id: workspace.id.clone(),
                repositories: vec![crate::domain::workspace::ImportWorkspaceRepositoryInput {
                    repo_path: "C:\\Users\\Sparc\\Documents\\projects\\API".to_string(),
                    name: Some("API".to_string()),
                    project_type: Some("Workspace".to_string()),
                }],
            })
            .await
            .expect("import repositories");

        assert_eq!(imported.len(), 1);
        assert_eq!(
            imported[0].workspace_id.as_deref(),
            Some(workspace.id.as_str())
        );

        let after_import = repository
            .classify_discoveries(
                &workspace.id,
                vec![WorkspaceRepoDiscovery {
                    repo_path: "C:\\Users\\Sparc\\Documents\\projects\\API".to_string(),
                    relative_path: "API".to_string(),
                    suggested_name: "API".to_string(),
                    status: "new".to_string(),
                    project_id: None,
                    project_name: None,
                }],
            )
            .await
            .expect("classify imported");

        assert_eq!(after_import[0].status, "imported");
        assert_eq!(after_import[0].project_name.as_deref(), Some("API"));
    }

    #[tokio::test]
    async fn workspace_import_attaches_existing_project_without_duplicate() {
        let pool = test_pool().await;
        let project_repository = ProjectRepository::new(&pool);
        let workspace_repository = WorkspaceRepository::new(&pool);

        project_repository
            .create(CreateProjectInput {
                name: "Existing API".to_string(),
                description: None,
                repo_path: Some("C:\\repo\\existing-api".to_string()),
                github_url: None,
                project_type: Some("Backend".to_string()),
            })
            .await
            .expect("create existing project");

        let workspace = workspace_repository
            .create(CreateWorkspaceInput {
                name: "Repo Root".to_string(),
                root_path: "C:\\repo".to_string(),
            })
            .await
            .expect("create workspace");

        let imported = workspace_repository
            .import_repositories(ImportWorkspaceRepositoriesInput {
                workspace_id: workspace.id.clone(),
                repositories: vec![crate::domain::workspace::ImportWorkspaceRepositoryInput {
                    repo_path: "C:\\repo\\existing-api".to_string(),
                    name: Some("Existing API".to_string()),
                    project_type: Some("Workspace".to_string()),
                }],
            })
            .await
            .expect("import existing repository");

        let projects = project_repository.list().await.expect("list projects");

        assert_eq!(projects.len(), 1);
        assert_eq!(imported.len(), 1);
        assert_eq!(
            imported[0].workspace_id.as_deref(),
            Some(workspace.id.as_str())
        );
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
    async fn archived_project_activity_is_hidden_from_operational_lists() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let project_repository = ProjectRepository::new(&pool);
        let commit_repository = CommitRepository::new(&pool);
        let manual_log_repository = ManualLogRepository::new(&pool);
        let activity_repository = ActivityRepository::new(&pool);

        commit_repository
            .upsert(&Commit {
                id: "commit_archived_project".to_string(),
                project_id: project.id.clone(),
                commit_hash: "archived123".to_string(),
                message: "feat: archived project work".to_string(),
                author_name: Some("Joseph".to_string()),
                author_email: Some("joseph@example.com".to_string()),
                branch: Some("main".to_string()),
                committed_at: "2026-05-19T11:00:00Z".to_string(),
                files_changed: Some(1),
                insertions: Some(8),
                deletions: Some(1),
                included_in_report: true,
            })
            .await
            .expect("insert archived project commit");

        manual_log_repository
            .create(CreateManualLogInput {
                project_id: Some(project.id.clone()),
                date: "2026-05-19".to_string(),
                activity_type: ActivityType::Testing,
                summary: "Archived project manual log".to_string(),
                outcome: None,
                duration_minutes: Some(15),
                follow_up: None,
                included_in_report: Some(true),
            })
            .await
            .expect("create archived project manual log");

        manual_log_repository
            .create(CreateManualLogInput {
                project_id: None,
                date: "2026-05-19".to_string(),
                activity_type: ActivityType::Meeting,
                summary: "General meeting".to_string(),
                outcome: None,
                duration_minutes: Some(30),
                follow_up: None,
                included_in_report: Some(true),
            })
            .await
            .expect("create general manual log");

        assert!(project_repository
            .archive(&project.id)
            .await
            .expect("archive project")
            .is_some());

        let logs = manual_log_repository
            .list_by_date_range("2026-05-18", "2026-05-20")
            .await
            .expect("list manual logs");

        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].summary, "General meeting");

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
        assert_eq!(days[0].items.len(), 1);
        assert_eq!(days[0].items[0].summary, "General meeting");
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
                progress_percent: None,
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
                progress_percent: None,
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
                progress_percent: None,
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
                    progress_percent: None,
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
    async fn weekly_tasks_for_archived_projects_are_hidden() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let project_repository = ProjectRepository::new(&pool);
        let repository = WeeklyTaskRepository::new(&pool);

        repository
            .create(CreateWeeklyTaskInput {
                project_id: Some(project.id.clone()),
                task_type: WeeklyTaskType::PlannedWork,
                status: Some(WeeklyTaskStatus::Todo),
                title: "Archived project task".to_string(),
                details: None,
                week_start_date: "2026-05-18".to_string(),
                target_date: None,
                completed_at: None,
                priority: Some(WeeklyTaskPriority::Normal),
                included_in_report: Some(true),
                progress_percent: None,
            })
            .await
            .expect("create archived project task");

        repository
            .create(CreateWeeklyTaskInput {
                project_id: None,
                task_type: WeeklyTaskType::FollowUp,
                status: Some(WeeklyTaskStatus::Todo),
                title: "General follow-up".to_string(),
                details: None,
                week_start_date: "2026-05-18".to_string(),
                target_date: None,
                completed_at: None,
                priority: Some(WeeklyTaskPriority::Normal),
                included_in_report: Some(true),
                progress_percent: None,
            })
            .await
            .expect("create general task");

        assert!(project_repository
            .archive(&project.id)
            .await
            .expect("archive project")
            .is_some());

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
            .expect("list weekly tasks");

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "General follow-up");
    }

    #[tokio::test]
    async fn focus_session_create_guard_stop_cancel_and_list_work() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let repository = FocusSessionRepository::new(&pool);

        let session = repository
            .create(CreateFocusSessionInput {
                project_id: Some(project.id),
                task_id: None,
                title: Some("Implement focus mode".to_string()),
                notes: None,
            })
            .await
            .expect("create focus session");

        assert_eq!(session.status, FocusSessionStatus::Active);
        assert!(repository.active().await.expect("active").is_some());

        let listed = repository
            .list(ListFocusSessionsInput {
                from: Some("2020-01-01".to_string()),
                to: Some("2099-12-31".to_string()),
                status: Some(FocusSessionStatus::Active),
                project_ids: None,
            })
            .await
            .expect("list sessions");

        assert_eq!(listed.len(), 1);

        let stopped = repository
            .stop(
                &session.id,
                StopFocusSessionInput {
                    notes: Some("Shipped the first pass".to_string()),
                    create_manual_log: None,
                    manual_log_summary: None,
                    complete_task: None,
                    progress_percent: None,
                },
            )
            .await
            .expect("stop session")
            .expect("session exists");

        assert_eq!(stopped.status, FocusSessionStatus::Completed);
        assert!(stopped.duration_minutes.unwrap_or_default() >= 1);
        assert!(repository
            .active()
            .await
            .expect("active after stop")
            .is_none());

        let cancelled = repository
            .create(CreateFocusSessionInput {
                project_id: None,
                task_id: None,
                title: Some("Discard this block".to_string()),
                notes: None,
            })
            .await
            .expect("create second focus session");

        assert_eq!(
            repository
                .cancel(&cancelled.id)
                .await
                .expect("cancel session")
                .expect("session exists")
                .status,
            FocusSessionStatus::Cancelled
        );
    }

    #[tokio::test]
    async fn focus_session_service_blocks_second_active_session() {
        let pool = test_pool().await;
        let repository = FocusSessionRepository::new(&pool);
        let weekly_tasks = WeeklyTaskRepository::new(&pool);

        FocusSessionService::create(
            &repository,
            &weekly_tasks,
            CreateFocusSessionInput {
                project_id: None,
                task_id: None,
                title: Some("First focus".to_string()),
                notes: None,
            },
        )
        .await
        .expect("create first focus");

        let duplicate = FocusSessionService::create(
            &repository,
            &weekly_tasks,
            CreateFocusSessionInput {
                project_id: None,
                task_id: None,
                title: Some("Second focus".to_string()),
                notes: None,
            },
        )
        .await;

        assert!(matches!(
            duplicate,
            Err(crate::application::focus_sessions::FocusSessionServiceError::Validation(_))
        ));
    }

    #[tokio::test]
    async fn nudge_dismissals_create_list_and_upsert_work() {
        let pool = test_pool().await;
        let repository = NudgeDismissalRepository::new(&pool);

        let dismissal = repository
            .dismiss(DismissNudgeInput {
                nudge_key: "missing_activity".to_string(),
                scope: Some("today".to_string()),
                dismissed_for_date: "2026-05-21".to_string(),
            })
            .await
            .expect("dismiss nudge");

        assert_eq!(dismissal.nudge_key, "missing_activity");
        assert_eq!(dismissal.scope.as_deref(), Some("today"));

        repository
            .dismiss(DismissNudgeInput {
                nudge_key: "missing_activity".to_string(),
                scope: Some("today".to_string()),
                dismissed_for_date: "2026-05-21".to_string(),
            })
            .await
            .expect("upsert dismissal");

        repository
            .dismiss(DismissNudgeInput {
                nudge_key: "open_blockers".to_string(),
                scope: Some("today".to_string()),
                dismissed_for_date: "2026-05-22".to_string(),
            })
            .await
            .expect("dismiss other date");

        let listed = repository
            .list(ListNudgeDismissalsInput {
                dismissed_for_date: "2026-05-21".to_string(),
                scope: Some("today".to_string()),
            })
            .await
            .expect("list dismissals");

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].nudge_key, "missing_activity");
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
                backup_enabled: Some(true),
                backup_schedule: Some("weekly".to_string()),
                backup_time: Some("17:30".to_string()),
                backup_day: Some("friday".to_string()),
                backup_storage_mode: Some("local".to_string()),
                backup_storage_location: Some("C:\\Backups".to_string()),
                online_backup_status: Some("research".to_string()),
                online_backup_provider: Some(String::new()),
            })
            .await
            .expect("update settings");

        assert_eq!(updated.name, "Joseph");
        assert!(updated.backup_enabled);
        assert_eq!(updated.backup_time, "17:30");
        assert_eq!(
            repository.get().await.expect("get settings").theme,
            "system"
        );
        assert_eq!(
            repository
                .get()
                .await
                .expect("get settings")
                .backup_storage_location,
            "C:\\Backups"
        );
    }
}
