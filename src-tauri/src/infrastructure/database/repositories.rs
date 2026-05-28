use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{Datelike, NaiveDate, Utc};
use sqlx::{Row, SqlitePool};

use crate::application::repositories::{
    CalendarEventStore, CalendarSourceStore, CommitStore, DailyPlanStore, FocusSessionStore,
    ManualLogStore, NudgeDismissalStore, ProjectStore, ReportItemStore, ReportNoteStore,
    ReportStore, SettingsStore, WeeklyTaskStore, WorkspaceStore,
};
use crate::domain::activity::{
    ActivityDay, ActivityItem, HeatmapCell, HeatmapData, HeatmapInput, KeyHighlight,
    ListActivityInput, TopProject, WeekSummary, WeekSummaryInput,
};
use crate::domain::activity_group::{
    ActivityGroup, ActivityGroupItem, ActivityGroupNarrative, ActivityGroupProject,
    ActivityGroupTitleMemory,
    CreateActivityGroupInput, GroupingDiffSnippet, GroupingEvidence, ListActivityGroupsInput,
    RecordActivityGroupTitleFeedbackInput, ReplaceActivityGroupItemsInput,
    SelectActivityGroupTitleCandidateInput, TitleCandidateDto, UpdateActivityGroupInput,
};
use crate::domain::calendar::{
    CalendarEvent, CalendarSource, DayCapacity, GetWeekCapacityInput, ListCalendarEventsInput,
    WeekCapacity,
};
use crate::domain::commit::Commit;
use crate::domain::daily_plan::{
    DailyPlan, DailyPlanItem, DailyPlanItemStatus, GetDailyPlanInput, ReplaceDailyPlanItemInput,
    UpdateDailyPlanItemInput, UpsertDailyPlanInput,
};
use crate::domain::embedding::{
    ActivityEmbeddingRecord, BackgroundJobRecord, BackgroundJobStatus, UpsertActivityEmbeddingInput,
};
use crate::domain::focus_session::{
    CreateFocusSessionInput, FocusSession, FocusSessionStatus, ListFocusSessionsInput,
    StopFocusSessionInput,
};
use crate::domain::git_metadata::{
    CommitDiffSnippet, CommitFileChange, CommitRef, CommitRefSummary, CommitWorktreeRef,
    CommitWorktreeSummary, GitRef, GitRefFilter, GitRefKind, GitWorktree, ProjectGitFocus,
    ProjectGitSyncCursor, ProjectGitSyncState, SaveProjectGitFocusInput,
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
use crate::domain::sparc_force::{
    ListSparcForceRecordsInput, SparcForceCacheRecord, SparcForceConnection,
    SparcForceImportCounts, SparcForceImportedData, SparcForceImportedItem, SparcForceRecordBucket,
    SparcForceRecordCounts, SparcForceRecordQueryResult,
};
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
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, classification, status, created_at, updated_at
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
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, classification, status, created_at, updated_at
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
            classification: normalize_classification(input.classification),
            status: "active".to_string(),
            created_at: now.clone(),
            updated_at: now,
        };

        sqlx::query(
            r#"
            INSERT INTO projects (id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, classification, status, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
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
        .bind(&project.classification)
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

        if input.classification.is_some() {
            project.classification = normalize_classification(input.classification);
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
                classification = ?9,
                status = ?10,
                updated_at = ?11
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
        .bind(&project.classification)
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
                classification: None,
                status: Some("archived".to_string()),
            },
        )
        .await
    }

    pub async fn find(&self, id: &str) -> Result<Option<Project>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, classification, status, created_at, updated_at
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
            SELECT id, name, root_path, classification, status, last_scanned_at, created_at, updated_at
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
            classification: normalize_classification(input.classification),
            status: "active".to_string(),
            last_scanned_at: None,
            created_at: now.clone(),
            updated_at: now,
        };

        sqlx::query(
            r#"
            INSERT INTO workspaces (id, name, root_path, classification, status, last_scanned_at, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
        )
        .bind(&workspace.id)
        .bind(&workspace.name)
        .bind(&workspace.root_path)
        .bind(&workspace.classification)
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
        if input.classification.is_some() {
            workspace.classification = normalize_classification(input.classification);
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
                classification = ?4,
                status = ?5,
                last_scanned_at = ?6,
                updated_at = ?7
            WHERE id = ?1
            "#,
        )
        .bind(&workspace.id)
        .bind(&workspace.name)
        .bind(&workspace.root_path)
        .bind(&workspace.classification)
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
                classification: None,
                status: Some("archived".to_string()),
            },
        )
        .await
    }

    pub async fn find(&self, id: &str) -> Result<Option<Workspace>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, name, root_path, classification, status, last_scanned_at, created_at, updated_at
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
                    .attach_project_to_workspace(
                        &project.id,
                        &workspace.id,
                        &relative,
                        &workspace.classification,
                    )
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
                classification: workspace.classification.clone(),
                status: "active".to_string(),
                created_at: now.clone(),
                updated_at: now,
            };

            sqlx::query(
                r#"
                INSERT INTO projects (id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, classification, status, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
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
            .bind(&project.classification)
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
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, classification, status, created_at, updated_at
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
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, classification, status, created_at, updated_at
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
        workspace_classification: &str,
    ) -> Result<Option<Project>, sqlx::Error> {
        let now = current_timestamp();
        sqlx::query(
            r#"
            UPDATE projects
            SET workspace_id = ?2,
                workspace_relative_path = ?3,
                status = 'active',
                classification = CASE
                  WHEN classification = 'unclassified' THEN ?4
                  ELSE classification
                END,
                updated_at = ?5
            WHERE id = ?1
            "#,
        )
        .bind(project_id)
        .bind(workspace_id)
        .bind(workspace_relative_path)
        .bind(workspace_classification)
        .bind(now)
        .execute(self.pool)
        .await?;

        let row = sqlx::query(
            r#"
            SELECT id, name, description, repo_path, github_url, type, workspace_id, workspace_relative_path, classification, status, created_at, updated_at
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
        let now = current_timestamp();

        let inserted = sqlx::query(
            r#"
            INSERT OR IGNORE INTO commits (
              id, project_id, commit_hash, message, author_name, author_email, branch,
              committed_at, files_changed, insertions, deletions, included_in_report,
              created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
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
        .await?
        .rows_affected()
            == 1;

        if inserted {
            return Ok(CommitUpsertResult::Inserted);
        }

        sqlx::query(
            r#"
            UPDATE commits
            SET message = ?3,
                author_name = ?4,
                author_email = ?5,
                branch = ?6,
                committed_at = ?7,
                files_changed = COALESCE(?8, files_changed),
                insertions = COALESCE(?9, insertions),
                deletions = COALESCE(?10, deletions),
                updated_at = ?11
            WHERE project_id = ?1 AND commit_hash = ?2
            "#,
        )
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
        .bind(&now)
        .execute(self.pool)
        .await?;

        Ok(CommitUpsertResult::Updated)
    }

    pub async fn upsert_many(&self, commits: &[Commit]) -> Result<(i64, i64), sqlx::Error> {
        let now = current_timestamp();
        let mut tx = self.pool.begin().await?;
        let mut inserted_count = 0;
        let mut updated_count = 0;

        for commit in commits {
            let inserted = sqlx::query(
                r#"
                INSERT OR IGNORE INTO commits (
                  id, project_id, commit_hash, message, author_name, author_email, branch,
                  committed_at, files_changed, insertions, deletions, included_in_report,
                  created_at, updated_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
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
            .execute(&mut *tx)
            .await?
            .rows_affected()
                == 1;

            if inserted {
                inserted_count += 1;
                continue;
            }

            sqlx::query(
                r#"
                UPDATE commits
                SET message = ?3,
                    author_name = ?4,
                    author_email = ?5,
                    branch = ?6,
                    committed_at = ?7,
                    files_changed = COALESCE(?8, files_changed),
                    insertions = COALESCE(?9, insertions),
                    deletions = COALESCE(?10, deletions),
                    updated_at = ?11
                WHERE project_id = ?1 AND commit_hash = ?2
                "#,
            )
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
            .bind(&now)
            .execute(&mut *tx)
            .await?;
            updated_count += 1;
        }

        tx.commit().await?;
        Ok((inserted_count, updated_count))
    }
}

#[async_trait::async_trait]
impl CommitStore for CommitRepository<'_> {
    async fn upsert(&self, commit: &Commit) -> Result<CommitUpsertResult, sqlx::Error> {
        CommitRepository::upsert(self, commit).await
    }
}

pub struct GitMetadataRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> GitMetadataRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn replace_refs(&self, project_id: &str, refs: &[GitRef]) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM git_refs WHERE project_id = ?1")
            .bind(project_id)
            .execute(&mut *tx)
            .await?;

        for git_ref in refs {
            sqlx::query(
                r#"
                INSERT INTO git_refs (
                  project_id, name, full_name, kind, is_current, is_head,
                  last_seen_commit, last_scanned_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
            )
            .bind(&git_ref.project_id)
            .bind(&git_ref.name)
            .bind(&git_ref.full_name)
            .bind(git_ref.kind.as_storage_value())
            .bind(bool_to_i64(git_ref.is_current))
            .bind(bool_to_i64(git_ref.is_head))
            .bind(&git_ref.last_seen_commit)
            .bind(&git_ref.last_scanned_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await
    }

    pub async fn replace_commit_refs(
        &self,
        project_id: &str,
        refs: &[CommitRef],
    ) -> Result<(), sqlx::Error> {
        let now = current_timestamp();
        let commit_hashes = refs
            .iter()
            .map(|commit_ref| commit_ref.commit_hash.clone())
            .collect::<std::collections::HashSet<_>>();
        let existing_rows = sqlx::query(
            r#"
            SELECT commit_hash, ref_name, ref_kind, first_seen_at
            FROM commit_refs
            WHERE project_id = ?1
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;
        let existing_first_seen = existing_rows
            .into_iter()
            .map(|row| {
                let key = format!(
                    "{}\u{1f}{}\u{1f}{}",
                    row.get::<String, _>("commit_hash"),
                    row.get::<String, _>("ref_name"),
                    row.get::<String, _>("ref_kind")
                );
                (key, row.get::<String, _>("first_seen_at"))
            })
            .collect::<HashMap<_, _>>();
        let mut tx = self.pool.begin().await?;
        for commit_hash in commit_hashes {
            sqlx::query("DELETE FROM commit_refs WHERE project_id = ?1 AND commit_hash = ?2")
                .bind(project_id)
                .bind(commit_hash)
                .execute(&mut *tx)
                .await?;
        }

        for commit_ref in refs {
            sqlx::query(
                r#"
                INSERT INTO commit_refs (
                  project_id, commit_hash, ref_name, ref_kind, first_seen_at, last_seen_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
            )
            .bind(&commit_ref.project_id)
            .bind(&commit_ref.commit_hash)
            .bind(&commit_ref.ref_name)
            .bind(commit_ref.ref_kind.as_storage_value())
            .bind(
                existing_first_seen
                    .get(&format!(
                        "{}\u{1f}{}\u{1f}{}",
                        commit_ref.commit_hash,
                        commit_ref.ref_name,
                        commit_ref.ref_kind.as_storage_value()
                    ))
                    .unwrap_or(&now),
            )
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await
    }

    pub async fn replace_commit_worktree_refs(
        &self,
        project_id: &str,
        refs: &[CommitWorktreeRef],
    ) -> Result<(), sqlx::Error> {
        let now = current_timestamp();
        let commit_hashes = refs
            .iter()
            .map(|commit_ref| commit_ref.commit_hash.clone())
            .collect::<std::collections::HashSet<_>>();
        let existing_rows = sqlx::query(
            r#"
            SELECT commit_hash, worktree_path, first_seen_at
            FROM commit_worktree_refs
            WHERE project_id = ?1
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;
        let existing_first_seen = existing_rows
            .into_iter()
            .map(|row| {
                let key = format!(
                    "{}\u{1f}{}",
                    row.get::<String, _>("commit_hash"),
                    row.get::<String, _>("worktree_path")
                );
                (key, row.get::<String, _>("first_seen_at"))
            })
            .collect::<HashMap<_, _>>();
        let mut tx = self.pool.begin().await?;
        for commit_hash in commit_hashes {
            sqlx::query(
                "DELETE FROM commit_worktree_refs WHERE project_id = ?1 AND commit_hash = ?2",
            )
            .bind(project_id)
            .bind(commit_hash)
            .execute(&mut *tx)
            .await?;
        }

        for commit_ref in refs {
            sqlx::query(
                r#"
                INSERT INTO commit_worktree_refs (
                  project_id, commit_hash, worktree_path, branch, first_seen_at, last_seen_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
            )
            .bind(&commit_ref.project_id)
            .bind(&commit_ref.commit_hash)
            .bind(&commit_ref.worktree_path)
            .bind(&commit_ref.branch)
            .bind(
                existing_first_seen
                    .get(&format!(
                        "{}\u{1f}{}",
                        commit_ref.commit_hash, commit_ref.worktree_path
                    ))
                    .unwrap_or(&now),
            )
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await
    }

    pub async fn replace_worktrees(
        &self,
        project_id: &str,
        worktrees: &[GitWorktree],
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM git_worktrees WHERE project_id = ?1")
            .bind(project_id)
            .execute(&mut *tx)
            .await?;

        for worktree in worktrees {
            sqlx::query(
                r#"
                INSERT INTO git_worktrees (
                  project_id, path, branch, head_commit, is_clean,
                  is_prunable, is_locked, last_scanned_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
            )
            .bind(&worktree.project_id)
            .bind(&worktree.path)
            .bind(&worktree.branch)
            .bind(&worktree.head_commit)
            .bind(worktree.is_clean.map(bool_to_i64))
            .bind(bool_to_i64(worktree.is_prunable))
            .bind(bool_to_i64(worktree.is_locked))
            .bind(&worktree.last_scanned_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await
    }

    pub async fn replace_commit_file_changes(
        &self,
        project_id: &str,
        changes: &[CommitFileChange],
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM commit_file_changes WHERE project_id = ?1")
            .bind(project_id)
            .execute(&mut *tx)
            .await?;

        for change in changes {
            sqlx::query(
                r#"
                INSERT OR REPLACE INTO commit_file_changes (
                  project_id, commit_hash, path, old_path, change_kind, additions, deletions,
                  is_binary, language, top_level_dir, is_test, is_docs, is_config,
                  is_migration, is_generated, collected_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
                "#,
            )
            .bind(&change.project_id)
            .bind(&change.commit_hash)
            .bind(&change.path)
            .bind(&change.old_path)
            .bind(&change.change_kind)
            .bind(change.additions)
            .bind(change.deletions)
            .bind(bool_to_i64(change.is_binary))
            .bind(&change.language)
            .bind(&change.top_level_dir)
            .bind(bool_to_i64(change.is_test))
            .bind(bool_to_i64(change.is_docs))
            .bind(bool_to_i64(change.is_config))
            .bind(bool_to_i64(change.is_migration))
            .bind(bool_to_i64(change.is_generated))
            .bind(&change.collected_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await
    }

    pub async fn replace_commit_file_changes_for_hashes(
        &self,
        project_id: &str,
        commit_hashes: &[String],
        changes: &[CommitFileChange],
    ) -> Result<(), sqlx::Error> {
        let hashes = commit_hashes
            .iter()
            .filter(|hash| is_full_commit_hash(hash))
            .collect::<std::collections::HashSet<_>>();
        if hashes.is_empty() {
            return Ok(());
        }

        let mut tx = self.pool.begin().await?;
        for commit_hash in &hashes {
            sqlx::query(
                "DELETE FROM commit_file_changes WHERE project_id = ?1 AND commit_hash = ?2",
            )
            .bind(project_id)
            .bind(*commit_hash)
            .execute(&mut *tx)
            .await?;
        }

        for change in changes
            .iter()
            .filter(|change| hashes.contains(&change.commit_hash))
        {
            sqlx::query(
                r#"
                INSERT OR REPLACE INTO commit_file_changes (
                  project_id, commit_hash, path, old_path, change_kind, additions, deletions,
                  is_binary, language, top_level_dir, is_test, is_docs, is_config,
                  is_migration, is_generated, collected_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
                "#,
            )
            .bind(&change.project_id)
            .bind(&change.commit_hash)
            .bind(&change.path)
            .bind(&change.old_path)
            .bind(&change.change_kind)
            .bind(change.additions)
            .bind(change.deletions)
            .bind(bool_to_i64(change.is_binary))
            .bind(&change.language)
            .bind(&change.top_level_dir)
            .bind(bool_to_i64(change.is_test))
            .bind(bool_to_i64(change.is_docs))
            .bind(bool_to_i64(change.is_config))
            .bind(bool_to_i64(change.is_migration))
            .bind(bool_to_i64(change.is_generated))
            .bind(&change.collected_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await
    }

    pub async fn replace_commit_diff_snippets(
        &self,
        project_id: &str,
        snippets: &[CommitDiffSnippet],
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM commit_diff_snippets WHERE project_id = ?1")
            .bind(project_id)
            .execute(&mut *tx)
            .await?;

        for snippet in snippets {
            sqlx::query(
                r#"
                INSERT INTO commit_diff_snippets (
                  id, project_id, commit_hash, path, snippet, collected_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
            )
            .bind(generate_id("commit_diff_snippet"))
            .bind(&snippet.project_id)
            .bind(&snippet.commit_hash)
            .bind(&snippet.path)
            .bind(&snippet.snippet)
            .bind(&snippet.collected_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await
    }

    pub async fn replace_commit_diff_snippets_for_hashes(
        &self,
        project_id: &str,
        commit_hashes: &[String],
        snippets: &[CommitDiffSnippet],
    ) -> Result<(), sqlx::Error> {
        let hashes = commit_hashes
            .iter()
            .filter(|hash| is_full_commit_hash(hash))
            .collect::<std::collections::HashSet<_>>();
        if hashes.is_empty() {
            return Ok(());
        }

        let mut tx = self.pool.begin().await?;
        for commit_hash in &hashes {
            sqlx::query(
                "DELETE FROM commit_diff_snippets WHERE project_id = ?1 AND commit_hash = ?2",
            )
            .bind(project_id)
            .bind(*commit_hash)
            .execute(&mut *tx)
            .await?;
        }

        for snippet in snippets
            .iter()
            .filter(|snippet| hashes.contains(&snippet.commit_hash))
        {
            sqlx::query(
                r#"
                INSERT INTO commit_diff_snippets (
                  id, project_id, commit_hash, path, snippet, collected_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
            )
            .bind(generate_id("commit_diff_snippet"))
            .bind(&snippet.project_id)
            .bind(&snippet.commit_hash)
            .bind(&snippet.path)
            .bind(&snippet.snippet)
            .bind(&snippet.collected_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await
    }

    pub async fn missing_file_evidence_commit_hashes(
        &self,
        project_id: &str,
        commit_hashes: &[String],
    ) -> Result<Vec<String>, sqlx::Error> {
        if commit_hashes.is_empty() {
            return Ok(Vec::new());
        }
        let rows = sqlx::query(
            r#"
            SELECT DISTINCT commit_hash
            FROM commit_file_changes
            WHERE project_id = ?1
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;
        let present = rows
            .into_iter()
            .map(|row| row.get::<String, _>("commit_hash"))
            .filter(|hash| is_full_commit_hash(hash))
            .collect::<std::collections::HashSet<_>>();
        Ok(commit_hashes
            .iter()
            .filter(|hash| is_full_commit_hash(hash) && !present.contains(*hash))
            .cloned()
            .collect())
    }

    pub async fn list_file_changes_for_commits(
        &self,
        project_id: &str,
        commit_hashes: &[String],
    ) -> Result<Vec<CommitFileChange>, sqlx::Error> {
        if commit_hashes.is_empty() {
            return Ok(Vec::new());
        }
        let rows = sqlx::query(
            r#"
            SELECT project_id, commit_hash, path, old_path, change_kind, additions, deletions,
                   is_binary, language, top_level_dir, is_test, is_docs, is_config,
                   is_migration, is_generated, collected_at
            FROM commit_file_changes
            WHERE project_id = ?1
            ORDER BY commit_hash ASC, path ASC
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;

        let wanted = commit_hashes
            .iter()
            .collect::<std::collections::HashSet<_>>();
        Ok(rows
            .into_iter()
            .filter(|row| wanted.contains(&row.get::<String, _>("commit_hash")))
            .map(commit_file_change_from_row)
            .collect())
    }

    pub async fn list_diff_snippets_for_commits(
        &self,
        project_id: &str,
        commit_hashes: &[String],
    ) -> Result<Vec<CommitDiffSnippet>, sqlx::Error> {
        if commit_hashes.is_empty() {
            return Ok(Vec::new());
        }
        let rows = sqlx::query(
            r#"
            SELECT project_id, commit_hash, path, snippet, collected_at
            FROM commit_diff_snippets
            WHERE project_id = ?1
            ORDER BY commit_hash ASC, path ASC
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;

        let wanted = commit_hashes
            .iter()
            .collect::<std::collections::HashSet<_>>();
        Ok(rows
            .into_iter()
            .filter(|row| wanted.contains(&row.get::<String, _>("commit_hash")))
            .map(commit_diff_snippet_from_row)
            .collect())
    }

    pub async fn list_refs(&self, project_id: &str) -> Result<Vec<GitRef>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT project_id, name, full_name, kind, is_current, is_head,
                   last_seen_commit, last_scanned_at
            FROM git_refs
            WHERE project_id = ?1
            ORDER BY kind ASC, name ASC
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(git_ref_from_row).collect())
    }

    pub async fn list_worktrees(&self, project_id: &str) -> Result<Vec<GitWorktree>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT project_id, path, branch, head_commit, is_clean,
                   is_prunable, is_locked, last_scanned_at
            FROM git_worktrees
            WHERE project_id = ?1
            ORDER BY branch IS NULL ASC, branch ASC, path ASC
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(git_worktree_from_row).collect())
    }

    pub async fn refs_for_commit(
        &self,
        project_id: &str,
        commit_hash: &str,
    ) -> Result<Vec<CommitRefSummary>, sqlx::Error> {
        refs_for_commit(self.pool, project_id, commit_hash).await
    }

    pub async fn worktree_for_commit(
        &self,
        project_id: &str,
        commit_hash: &str,
    ) -> Result<Option<CommitWorktreeSummary>, sqlx::Error> {
        worktree_for_commit(self.pool, project_id, commit_hash).await
    }

    pub async fn get_project_focus(
        &self,
        project_id: &str,
    ) -> Result<ProjectGitFocus, sqlx::Error> {
        let ref_rows = sqlx::query(
            r#"
            SELECT ref_name, ref_kind
            FROM project_git_focus_refs
            WHERE project_id = ?1
              AND enabled = 1
            ORDER BY ref_kind ASC, ref_name ASC
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;
        let worktree_rows = sqlx::query(
            r#"
            SELECT worktree_path
            FROM project_git_focus_worktrees
            WHERE project_id = ?1
              AND enabled = 1
            ORDER BY worktree_path ASC
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;

        Ok(ProjectGitFocus {
            project_id: project_id.to_string(),
            refs: ref_rows
                .into_iter()
                .map(|row| {
                    let kind: String = row.get("ref_kind");
                    GitRefFilter {
                        project_id: Some(project_id.to_string()),
                        name: row.get("ref_name"),
                        kind: GitRefKind::try_from(kind).unwrap_or(GitRefKind::Local),
                    }
                })
                .collect(),
            worktree_paths: worktree_rows
                .into_iter()
                .map(|row| row.get("worktree_path"))
                .collect(),
        })
    }

    pub async fn save_project_focus(
        &self,
        input: SaveProjectGitFocusInput,
    ) -> Result<ProjectGitFocus, sqlx::Error> {
        let now = current_timestamp();
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM project_git_focus_refs WHERE project_id = ?1")
            .bind(&input.project_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM project_git_focus_worktrees WHERE project_id = ?1")
            .bind(&input.project_id)
            .execute(&mut *tx)
            .await?;

        for git_ref in &input.refs {
            if git_ref.name.trim().is_empty() {
                continue;
            }
            sqlx::query(
                r#"
                INSERT INTO project_git_focus_refs (
                  project_id, ref_name, ref_kind, enabled, created_at, updated_at
                )
                VALUES (?1, ?2, ?3, 1, ?4, ?5)
                "#,
            )
            .bind(&input.project_id)
            .bind(git_ref.name.trim())
            .bind(git_ref.kind.as_storage_value())
            .bind(&now)
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }

        for worktree_path in &input.worktree_paths {
            if worktree_path.trim().is_empty() {
                continue;
            }
            sqlx::query(
                r#"
                INSERT INTO project_git_focus_worktrees (
                  project_id, worktree_path, enabled, created_at, updated_at
                )
                VALUES (?1, ?2, 1, ?3, ?4)
                "#,
            )
            .bind(&input.project_id)
            .bind(worktree_path.trim())
            .bind(&now)
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        self.get_project_focus(&input.project_id).await
    }

    pub async fn get_sync_state(
        &self,
        project_id: &str,
        range_from: Option<&str>,
        range_to: Option<&str>,
        author_email: Option<&str>,
    ) -> Result<Option<ProjectGitSyncState>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT project_id, range_from, range_to, author_email, ref_fingerprint,
                   evidence_version, last_scanned_at, last_full_scanned_at, last_error
            FROM project_git_sync_state
            WHERE project_id = ?1
              AND COALESCE(range_from, '') = COALESCE(?2, '')
              AND COALESCE(range_to, '') = COALESCE(?3, '')
              AND COALESCE(author_email, '') = COALESCE(?4, '')
            "#,
        )
        .bind(project_id)
        .bind(range_from.unwrap_or(""))
        .bind(range_to.unwrap_or(""))
        .bind(author_email.unwrap_or(""))
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(project_git_sync_state_from_row))
    }

    pub async fn upsert_sync_state(&self, state: &ProjectGitSyncState) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO project_git_sync_state (
              project_id, range_from, range_to, author_email, ref_fingerprint,
              evidence_version, last_scanned_at, last_full_scanned_at, last_error
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(project_id, range_from, range_to, author_email)
            DO UPDATE SET
              ref_fingerprint = excluded.ref_fingerprint,
              evidence_version = excluded.evidence_version,
              last_scanned_at = excluded.last_scanned_at,
              last_full_scanned_at = COALESCE(excluded.last_full_scanned_at, project_git_sync_state.last_full_scanned_at),
              last_error = excluded.last_error
            "#,
        )
        .bind(&state.project_id)
        .bind(state.range_from.as_deref().unwrap_or(""))
        .bind(state.range_to.as_deref().unwrap_or(""))
        .bind(state.author_email.as_deref().unwrap_or(""))
        .bind(&state.ref_fingerprint)
        .bind(&state.evidence_version)
        .bind(&state.last_scanned_at)
        .bind(&state.last_full_scanned_at)
        .bind(&state.last_error)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_sync_cursors(
        &self,
        project_id: &str,
    ) -> Result<Vec<ProjectGitSyncCursor>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT project_id, source_kind, source_name, previous_head_commit, latest_head_commit,
                   last_synced_at, last_full_synced_at, last_error, is_stale
            FROM project_git_sync_cursors
            WHERE project_id = ?1
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(project_git_sync_cursor_from_row)
            .collect())
    }

    pub async fn upsert_sync_cursors(
        &self,
        cursors: &[ProjectGitSyncCursor],
    ) -> Result<(), sqlx::Error> {
        if cursors.is_empty() {
            return Ok(());
        }
        let mut tx = self.pool.begin().await?;
        for cursor in cursors {
            sqlx::query(
                r#"
                INSERT INTO project_git_sync_cursors (
                  project_id, source_kind, source_name, previous_head_commit, latest_head_commit,
                  last_synced_at, last_full_synced_at, last_error, is_stale
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                ON CONFLICT(project_id, source_kind, source_name)
                DO UPDATE SET
                  previous_head_commit = excluded.previous_head_commit,
                  latest_head_commit = excluded.latest_head_commit,
                  last_synced_at = excluded.last_synced_at,
                  last_full_synced_at = COALESCE(excluded.last_full_synced_at, project_git_sync_cursors.last_full_synced_at),
                  last_error = excluded.last_error,
                  is_stale = excluded.is_stale
                "#,
            )
            .bind(&cursor.project_id)
            .bind(&cursor.source_kind)
            .bind(&cursor.source_name)
            .bind(&cursor.previous_head_commit)
            .bind(&cursor.latest_head_commit)
            .bind(&cursor.last_synced_at)
            .bind(&cursor.last_full_synced_at)
            .bind(&cursor.last_error)
            .bind(bool_to_i64(cursor.is_stale))
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await
    }

    pub async fn focus_for_projects(
        &self,
        project_ids: Option<&[String]>,
    ) -> Result<(Vec<GitRefFilter>, Vec<String>), sqlx::Error> {
        let focuses = if let Some(project_ids) = project_ids {
            let mut focuses = Vec::new();
            for project_id in project_ids {
                focuses.push(self.get_project_focus(project_id).await?);
            }
            focuses
        } else {
            let rows = sqlx::query(
                r#"
                SELECT id
                FROM projects
                WHERE status = 'active'
                ORDER BY name ASC
                "#,
            )
            .fetch_all(self.pool)
            .await?;
            let mut focuses = Vec::new();
            for row in rows {
                let project_id: String = row.get("id");
                focuses.push(self.get_project_focus(&project_id).await?);
            }
            focuses
        };

        Ok((
            focuses
                .iter()
                .flat_map(|focus| focus.refs.iter().cloned())
                .collect(),
            focuses
                .into_iter()
                .flat_map(|focus| focus.worktree_paths.into_iter())
                .collect(),
        ))
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
                       projects.workspace_id AS workspace_id,
                       workspaces.name AS workspace_name,
                       projects.workspace_relative_path AS workspace_relative_path,
                       projects.classification AS project_classification,
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
                LEFT JOIN workspaces ON workspaces.id = projects.workspace_id
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
                let workspace_id: Option<String> = row.get("workspace_id");
                if !workspace_filter_matches(&input.workspace_ids, workspace_id.as_deref()) {
                    continue;
                }
                let project_classification: String = row.get("project_classification");
                if !classification_filter_matches(
                    &input.classification,
                    Some(&project_classification),
                ) {
                    continue;
                }
                let commit_hash: String = row.get("commit_hash");
                let refs = refs_for_commit(self.pool, &project_id, &commit_hash).await?;
                let worktree = worktree_for_commit(self.pool, &project_id, &commit_hash).await?;
                if !commit_matches_git_filters(
                    self.pool,
                    &input.git_refs,
                    &input.worktree_paths,
                    &project_id,
                    &commit_hash,
                    &refs,
                )
                .await?
                {
                    continue;
                }

                items.push(ActivityItem {
                    id: row.get("id"),
                    project_id: Some(project_id),
                    project_name: row.get("project_name"),
                    workspace_id,
                    workspace_name: row.get("workspace_name"),
                    workspace_relative_path: row.get("workspace_relative_path"),
                    activity_type: "commit".to_string(),
                    summary: row.get("message"),
                    occurred_at: row.get("committed_at"),
                    included_in_report: i64_to_bool(row.get("included_in_report")),
                    commit_hash: Some(commit_hash),
                    author_name: row.get("author_name"),
                    author_email: row.get("author_email"),
                    branch: row.get("branch"),
                    files_changed: row.get("files_changed"),
                    insertions: row.get("insertions"),
                    deletions: row.get("deletions"),
                    refs,
                    worktree,
                });
            }
        }

        if include_manual {
            let rows = sqlx::query(
                r#"
                SELECT manual_logs.id,
                       manual_logs.project_id,
                       projects.name AS project_name,
                       projects.workspace_id AS workspace_id,
                       workspaces.name AS workspace_name,
                       projects.workspace_relative_path AS workspace_relative_path,
                       projects.classification AS project_classification,
                       manual_logs.activity_type,
                       manual_logs.summary,
                       manual_logs.date,
                       manual_logs.included_in_report
                FROM manual_logs
                LEFT JOIN projects ON projects.id = manual_logs.project_id
                LEFT JOIN workspaces ON workspaces.id = projects.workspace_id
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
                    let workspace_id: Option<String> = row.get("workspace_id");
                    if !workspace_filter_matches(&input.workspace_ids, workspace_id.as_deref()) {
                        continue;
                    }
                    let project_classification: Option<String> = row.get("project_classification");
                    if !classification_filter_matches(
                        &input.classification,
                        project_classification.as_deref(),
                    ) {
                        continue;
                    }
                } else if input.project_ids.is_some() {
                    continue;
                } else if input.workspace_ids.is_some() {
                    continue;
                } else if input.classification.is_some() {
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
                    workspace_id: row.get("workspace_id"),
                    workspace_name: row.get("workspace_name"),
                    workspace_relative_path: row.get("workspace_relative_path"),
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
                    refs: Vec::new(),
                    worktree: None,
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

pub struct ActivityGroupRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ActivityGroupRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(
        &self,
        input: ListActivityGroupsInput,
    ) -> Result<Vec<ActivityGroup>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT activity_groups.id,
                   activity_groups.project_id,
                   activity_groups.workspace_id,
                   workspaces.name AS workspace_name,
                   projects.name AS project_name,
                   projects.classification AS project_classification,
                   activity_groups.title,
                   activity_groups.summary,
                   activity_groups.start_date,
                   activity_groups.end_date,
                   activity_groups.source,
                   activity_groups.confidence,
                   activity_groups.included_in_report,
                   activity_groups.fingerprint,
                   activity_groups.algorithm_version,
                   activity_groups.confidence_label,
                   activity_groups.rationale_json,
                   activity_groups.report_summary,
                   activity_groups.locked,
                   activity_groups.user_edited_at,
                   activity_groups.review_status,
                   activity_groups.created_at,
                   activity_groups.updated_at
            FROM activity_groups
            LEFT JOIN projects ON projects.id = activity_groups.project_id
            LEFT JOIN workspaces ON workspaces.id = activity_groups.workspace_id
            WHERE activity_groups.start_date <= ?2
              AND activity_groups.end_date >= ?1
              AND (
                activity_groups.project_id IS NULL
                OR projects.status = 'active'
              )
            ORDER BY activity_groups.start_date DESC, activity_groups.updated_at DESC
            "#,
        )
        .bind(&input.from)
        .bind(&input.to)
        .fetch_all(self.pool)
        .await?;

        let mut groups = Vec::new();
        for row in rows {
            let project_id: Option<String> = row.get("project_id");
            let workspace_id: Option<String> = row.get("workspace_id");
            let items = self.list_items(row.get("id")).await?;
            let projects = group_projects(&items);
            if !group_matches_project_filter(&input.project_ids, project_id.as_deref(), &projects)
            {
                continue;
            }
            if !group_matches_workspace_filter(&input.workspace_ids, workspace_id.as_deref(), &items)
            {
                continue;
            }
            if let Some(_project_id) = &project_id {
                let classification: Option<String> = row.get("project_classification");
                if !classification_filter_matches(&input.classification, classification.as_deref())
                {
                    continue;
                }
            } else if input.classification.is_some() {
                continue;
            }

            let included_in_report = i64_to_bool(row.get("included_in_report"));
            if !input.include_hidden.unwrap_or(false) && !included_in_report {
                continue;
            }

            if !group_matches_git_filters(self.pool, &input.git_refs, &input.worktree_paths, &items)
                .await?
            {
                continue;
            }

            let mut group = ActivityGroup {
                id: row.get("id"),
                project_id,
                project_name: row.get("project_name"),
                workspace_id,
                workspace_name: row.get("workspace_name"),
                project_count: projects.len() as i64,
                projects,
                title: row.get("title"),
                summary: row.get("summary"),
                start_date: row.get("start_date"),
                end_date: row.get("end_date"),
                source: row.get("source"),
                confidence: row.get("confidence"),
                included_in_report,
                fingerprint: row.get("fingerprint"),
                algorithm_version: row.get("algorithm_version"),
                confidence_label: row.get("confidence_label"),
                rationale_json: row.get("rationale_json"),
                report_summary: row.get("report_summary"),
                locked: i64_to_bool(row.get("locked")),
                user_edited_at: row.get("user_edited_at"),
                review_status: row.get("review_status"),
                title_confidence: None,
                title_confidence_label: None,
                title_quality_label: None,
                title_strategy: None,
                title_rationale_json: None,
                title_candidates_json: None,
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                items,
            };
            self.apply_narrative_metadata(&mut group).await?;
            groups.push(group);
        }

        Ok(groups)
    }

    pub async fn create(
        &self,
        input: CreateActivityGroupInput,
    ) -> Result<ActivityGroup, sqlx::Error> {
        let now = current_timestamp();
        let id = generate_id("activity_group");
        sqlx::query(
            r#"
            INSERT INTO activity_groups (
                id, project_id, workspace_id, title, summary, start_date, end_date, source,
                confidence, included_in_report, fingerprint, algorithm_version, confidence_label,
                rationale_json, report_summary, locked, review_status, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
            "#,
        )
        .bind(&id)
        .bind(&input.project_id)
        .bind(&input.workspace_id)
        .bind(input.title.trim())
        .bind(input.summary.as_deref().map(str::trim))
        .bind(&input.start_date)
        .bind(&input.end_date)
        .bind(
            input
                .source
                .clone()
                .unwrap_or_else(|| "local_rule".to_string()),
        )
        .bind(input.confidence.unwrap_or(0.7))
        .bind(if input.included_in_report.unwrap_or(true) {
            1
        } else {
            0
        })
        .bind(&input.fingerprint)
        .bind(input.algorithm_version.as_deref().unwrap_or("graph-v1"))
        .bind(input.confidence_label.as_deref().unwrap_or("likely"))
        .bind(&input.rationale_json)
        .bind(&input.report_summary)
        .bind(if input.locked.unwrap_or(false) { 1 } else { 0 })
        .bind(input.review_status.as_deref().unwrap_or("draft"))
        .bind(&now)
        .bind(&now)
        .execute(self.pool)
        .await?;

        self.upsert_narrative_from_input(&id, &input).await?;
        self.replace_items(&id, ReplaceActivityGroupItemsInput { items: input.items })
            .await?;
        self.get(&id).await?.ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn update(
        &self,
        id: &str,
        input: UpdateActivityGroupInput,
    ) -> Result<Option<ActivityGroup>, sqlx::Error> {
        let Some(mut group) = self.get(id).await? else {
            return Ok(None);
        };
        let original_group = group.clone();

        if let Some(title) = input.title {
            group.title = title.trim().to_string();
        }
        if input.summary.is_some() {
            group.summary = input.summary.map(|value| value.trim().to_string());
        }
        if let Some(start_date) = input.start_date {
            group.start_date = start_date;
        }
        if let Some(end_date) = input.end_date {
            group.end_date = end_date;
        }
        if let Some(source) = input.source {
            group.source = source;
        }
        if let Some(confidence) = input.confidence {
            group.confidence = confidence;
        }
        if let Some(included) = input.included_in_report {
            group.included_in_report = included;
        }
        if input.report_summary.is_some() {
            group.report_summary = input.report_summary.map(|value| value.trim().to_string());
        }
        if let Some(locked) = input.locked {
            group.locked = locked;
        }
        if let Some(review_status) = input.review_status {
            group.review_status = review_status;
        }
        group.updated_at = current_timestamp();
        group.user_edited_at = Some(group.updated_at.clone());

        sqlx::query(
            r#"
            UPDATE activity_groups
            SET title = ?2,
                summary = ?3,
                start_date = ?4,
                end_date = ?5,
                source = ?6,
                confidence = ?7,
                included_in_report = ?8,
                report_summary = ?9,
                locked = ?10,
                user_edited_at = ?11,
                review_status = ?12,
                updated_at = ?13
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .bind(&group.title)
        .bind(&group.summary)
        .bind(&group.start_date)
        .bind(&group.end_date)
        .bind(&group.source)
        .bind(group.confidence)
        .bind(if group.included_in_report { 1 } else { 0 })
        .bind(&group.report_summary)
        .bind(if group.locked { 1 } else { 0 })
        .bind(&group.user_edited_at)
        .bind(&group.review_status)
        .bind(&group.updated_at)
        .execute(self.pool)
        .await?;

        self.remember_title_correction(&original_group, &group)
            .await?;

        self.get(id).await
    }

    pub async fn delete(&self, id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM activity_groups WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn replace_items(
        &self,
        group_id: &str,
        input: ReplaceActivityGroupItemsInput,
    ) -> Result<Vec<ActivityGroupItem>, sqlx::Error> {
        sqlx::query("DELETE FROM activity_group_items WHERE group_id = ?1")
            .bind(group_id)
            .execute(self.pool)
            .await?;

        let now = current_timestamp();
        for item in input.items {
            sqlx::query(
                r#"
                INSERT INTO activity_group_items (
                    id, group_id, source_type, source_id, occurred_at, summary_snapshot, created_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
            )
            .bind(generate_id("activity_group_item"))
            .bind(group_id)
            .bind(item.source_type)
            .bind(item.source_id)
            .bind(item.occurred_at)
            .bind(item.summary_snapshot)
            .bind(&now)
            .execute(self.pool)
            .await?;
        }

        self.list_items(group_id).await
    }

    pub async fn get(&self, id: &str) -> Result<Option<ActivityGroup>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT activity_groups.id,
                   activity_groups.project_id,
                   activity_groups.workspace_id,
                   workspaces.name AS workspace_name,
                   projects.name AS project_name,
                   activity_groups.title,
                   activity_groups.summary,
                   activity_groups.start_date,
                   activity_groups.end_date,
                   activity_groups.source,
                   activity_groups.confidence,
                   activity_groups.included_in_report,
                   activity_groups.fingerprint,
                   activity_groups.algorithm_version,
                   activity_groups.confidence_label,
                   activity_groups.rationale_json,
                   activity_groups.report_summary,
                   activity_groups.locked,
                   activity_groups.user_edited_at,
                   activity_groups.review_status,
                   activity_groups.created_at,
                   activity_groups.updated_at
            FROM activity_groups
            LEFT JOIN projects ON projects.id = activity_groups.project_id
            LEFT JOIN workspaces ON workspaces.id = activity_groups.workspace_id
            WHERE activity_groups.id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;

        if let Some(row) = row {
            let mut group = ActivityGroup {
                id: row.get("id"),
                project_id: row.get("project_id"),
                project_name: row.get("project_name"),
                workspace_id: row.get("workspace_id"),
                workspace_name: row.get("workspace_name"),
                project_count: 0,
                projects: Vec::new(),
                title: row.get("title"),
                summary: row.get("summary"),
                start_date: row.get("start_date"),
                end_date: row.get("end_date"),
                source: row.get("source"),
                confidence: row.get("confidence"),
                included_in_report: i64_to_bool(row.get("included_in_report")),
                fingerprint: row.get("fingerprint"),
                algorithm_version: row.get("algorithm_version"),
                confidence_label: row.get("confidence_label"),
                rationale_json: row.get("rationale_json"),
                report_summary: row.get("report_summary"),
                locked: i64_to_bool(row.get("locked")),
                user_edited_at: row.get("user_edited_at"),
                review_status: row.get("review_status"),
                title_confidence: None,
                title_confidence_label: None,
                title_quality_label: None,
                title_strategy: None,
                title_rationale_json: None,
                title_candidates_json: None,
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                items: self.list_items(id).await?,
            };
            group.projects = group_projects(&group.items);
            group.project_count = group.projects.len() as i64;
            self.apply_narrative_metadata(&mut group).await?;
            Ok(Some(group))
        } else {
            Ok(None)
        }
    }

    pub async fn find_by_fingerprint(
        &self,
        fingerprint: &str,
    ) -> Result<Option<ActivityGroup>, sqlx::Error> {
        let row = sqlx::query("SELECT id FROM activity_groups WHERE fingerprint = ?1")
            .bind(fingerprint)
            .fetch_optional(self.pool)
            .await?;

        if let Some(row) = row {
            let id: String = row.get("id");
            self.get(&id).await
        } else {
            Ok(None)
        }
    }

    async fn apply_narrative_metadata(&self, group: &mut ActivityGroup) -> Result<(), sqlx::Error> {
        if let Some(narrative) = self.get_narrative(&group.id).await? {
            group.title_confidence = Some(narrative.title_confidence);
            group.title_confidence_label = Some(narrative.title_confidence_label);
            group.title_quality_label = Some(narrative.title_quality_label);
            group.title_strategy = Some(narrative.naming_strategy);
            group.title_rationale_json = Some(narrative.rationale_json);
            group.title_candidates_json = Some(narrative.candidates_json);
        }
        Ok(())
    }

    async fn upsert_narrative_from_input(
        &self,
        group_id: &str,
        input: &CreateActivityGroupInput,
    ) -> Result<(), sqlx::Error> {
        let Some(title_confidence) = input.title_confidence else {
            return Ok(());
        };
        let now = current_timestamp();
        sqlx::query(
            r#"
            INSERT INTO activity_group_narratives (
                group_id, title, summary, report_summary, title_confidence,
                title_confidence_label, title_quality_label, naming_strategy,
                classification_json, candidates_json, rationale_json, rejected_terms_json,
                algorithm_version, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
            ON CONFLICT(group_id) DO UPDATE SET
                title = excluded.title,
                summary = excluded.summary,
                report_summary = excluded.report_summary,
                title_confidence = excluded.title_confidence,
                title_confidence_label = excluded.title_confidence_label,
                title_quality_label = excluded.title_quality_label,
                naming_strategy = excluded.naming_strategy,
                classification_json = excluded.classification_json,
                candidates_json = excluded.candidates_json,
                rationale_json = excluded.rationale_json,
                rejected_terms_json = excluded.rejected_terms_json,
                algorithm_version = excluded.algorithm_version,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(group_id)
        .bind(input.title.trim())
        .bind(input.summary.as_deref().map(str::trim))
        .bind(input.report_summary.as_deref().map(str::trim))
        .bind(title_confidence)
        .bind(input.title_confidence_label.as_deref().unwrap_or("likely"))
        .bind(input.title_quality_label.as_deref().unwrap_or("acceptable"))
        .bind(input.title_strategy.as_deref().unwrap_or("domain_phrase"))
        .bind(input.title_classification_json.as_deref().unwrap_or("{}"))
        .bind(input.title_candidates_json.as_deref().unwrap_or("[]"))
        .bind(input.title_rationale_json.as_deref().unwrap_or("{}"))
        .bind(&input.title_rejected_terms_json)
        .bind(input.algorithm_version.as_deref().unwrap_or("graph-v1"))
        .bind(&now)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_narrative(
        &self,
        group_id: &str,
    ) -> Result<Option<ActivityGroupNarrative>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT group_id, title, summary, report_summary, title_confidence,
                   title_confidence_label, title_quality_label, naming_strategy,
                   classification_json, candidates_json, rationale_json, rejected_terms_json,
                   algorithm_version, created_at, updated_at
            FROM activity_group_narratives
            WHERE group_id = ?1
            "#,
        )
        .bind(group_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(|row| ActivityGroupNarrative {
            group_id: row.get("group_id"),
            title: row.get("title"),
            summary: row.get("summary"),
            report_summary: row.get("report_summary"),
            title_confidence: row.get("title_confidence"),
            title_confidence_label: row.get("title_confidence_label"),
            title_quality_label: row.get("title_quality_label"),
            naming_strategy: row.get("naming_strategy"),
            classification_json: row.get("classification_json"),
            candidates_json: row.get("candidates_json"),
            rationale_json: row.get("rationale_json"),
            rejected_terms_json: row.get("rejected_terms_json"),
            algorithm_version: row.get("algorithm_version"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }))
    }

    pub async fn select_title_candidate(
        &self,
        input: SelectActivityGroupTitleCandidateInput,
    ) -> Result<Option<ActivityGroup>, sqlx::Error> {
        let Some(group) = self.get(&input.group_id).await? else {
            return Ok(None);
        };
        let Some(narrative) = self.get_narrative(&input.group_id).await? else {
            return Ok(Some(group));
        };
        let candidates = serde_json::from_str::<Vec<TitleCandidateDto>>(&narrative.candidates_json)
            .unwrap_or_default();
        let selected = candidates.iter().find(|candidate| {
            input
                .candidate_id
                .as_deref()
                .is_some_and(|id| candidate.id == id)
                || candidate.title == input.candidate_title
        });
        let Some(selected) = selected else {
            return Ok(Some(group));
        };

        self.update(
            &input.group_id,
            UpdateActivityGroupInput {
                title: Some(selected.title.clone()),
                summary: Some(selected.summary.clone()),
                start_date: None,
                end_date: None,
                source: None,
                confidence: None,
                included_in_report: None,
                report_summary: Some(selected.report_summary.clone()),
                locked: None,
                review_status: Some("reviewed".to_string()),
            },
        )
        .await?;

        let now = current_timestamp();
        sqlx::query(
            r#"
            UPDATE activity_group_narratives
            SET title = ?2,
                summary = ?3,
                report_summary = ?4,
                naming_strategy = ?5,
                title_confidence = ?6,
                title_confidence_label = ?7,
                title_quality_label = ?8,
                updated_at = ?9
            WHERE group_id = ?1
            "#,
        )
        .bind(&input.group_id)
        .bind(&selected.title)
        .bind(&selected.summary)
        .bind(&selected.report_summary)
        .bind(&selected.strategy)
        .bind(selected.score)
        .bind(if selected.score >= 0.78 {
            "strong"
        } else if selected.score >= 0.58 {
            "likely"
        } else {
            "needs_review"
        })
        .bind(&selected.quality_label)
        .bind(&now)
        .execute(self.pool)
        .await?;

        self.record_title_event(RecordActivityGroupTitleFeedbackInput {
            group_id: input.group_id.clone(),
            event_type: "candidate_selected".to_string(),
            previous_title: Some(group.title),
            new_title: Some(selected.title.clone()),
            previous_summary: group.report_summary,
            new_summary: Some(selected.report_summary.clone()),
            metadata_json: serde_json::to_string(selected).ok(),
        })
        .await?;

        self.get(&input.group_id).await
    }

    pub async fn record_title_event(
        &self,
        input: RecordActivityGroupTitleFeedbackInput,
    ) -> Result<(), sqlx::Error> {
        let group = self.get(&input.group_id).await?;
        let now = current_timestamp();
        sqlx::query(
            r#"
            INSERT INTO activity_group_title_events (
                id, group_id, project_id, event_type, previous_title, new_title,
                previous_summary, new_summary, selected_candidate_json,
                evidence_fingerprint, evidence_terms_json, created_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
        )
        .bind(generate_id("activity_group_title_event"))
        .bind(&input.group_id)
        .bind(group.as_ref().and_then(|group| group.project_id.clone()))
        .bind(&input.event_type)
        .bind(&input.previous_title)
        .bind(&input.new_title)
        .bind(&input.previous_summary)
        .bind(&input.new_summary)
        .bind(&input.metadata_json)
        .bind(group.as_ref().and_then(|group| group.fingerprint.clone()))
        .bind(
            group
                .as_ref()
                .map(group_memory_terms)
                .map(|(_, json)| json)
                .flatten(),
        )
        .bind(&now)
        .execute(self.pool)
        .await?;

        if matches!(
            input.event_type.as_str(),
            "title_renamed" | "candidate_selected" | "title_accepted"
        ) {
            if let Some(new_title) = input.new_title {
                self.upsert_title_vocabulary(
                    group.as_ref(),
                    &new_title,
                    input.metadata_json.as_deref(),
                )
                .await?;
            }
        }
        Ok(())
    }

    async fn upsert_title_vocabulary(
        &self,
        group: Option<&ActivityGroup>,
        title: &str,
        evidence_terms_json: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let normalized = title.split(" - ").nth(1).unwrap_or(title).to_lowercase();
        let now = current_timestamp();
        sqlx::query(
            r#"
            INSERT INTO activity_group_title_vocabulary (
                id, project_id, project_name, project_family, preferred_term,
                normalized_term, evidence_terms_json, source, confidence, use_count,
                last_used_at, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'feedback', 0.75, 1, ?8, ?8, ?8)
            "#,
        )
        .bind(generate_id("activity_group_title_vocabulary"))
        .bind(group.and_then(|group| group.project_id.clone()))
        .bind(group.and_then(|group| group.project_name.clone()))
        .bind(group.and_then(|group| group.project_name.clone()))
        .bind(title)
        .bind(normalized)
        .bind(evidence_terms_json)
        .bind(&now)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_title_memories(
        &self,
        project_ids: Option<&[String]>,
    ) -> Result<Vec<ActivityGroupTitleMemory>, sqlx::Error> {
        let rows = if let Some(project_ids) = project_ids {
            if project_ids.is_empty() {
                Vec::new()
            } else {
                let placeholders = std::iter::repeat("?")
                    .take(project_ids.len())
                    .collect::<Vec<_>>()
                    .join(", ");
                let sql = format!(
                    r#"
                    SELECT edited_title, edited_summary, project_id, evidence_terms, evidence_terms_json
                    FROM activity_group_title_memory
                    WHERE project_id IN ({placeholders}) OR project_id IS NULL
                    ORDER BY updated_at DESC
                    LIMIT 200
                    "#
                );
                let mut query = sqlx::query(&sql);
                for id in project_ids {
                    query = query.bind(id);
                }
                query.fetch_all(self.pool).await?
            }
        } else {
            sqlx::query(
                r#"
                SELECT edited_title, edited_summary, project_id, evidence_terms, evidence_terms_json
                FROM activity_group_title_memory
                ORDER BY updated_at DESC
                LIMIT 200
                "#,
            )
            .fetch_all(self.pool)
            .await?
        };

        let mut memories = rows
            .into_iter()
            .map(|row| ActivityGroupTitleMemory {
                edited_title: row.get("edited_title"),
                edited_summary: row.get("edited_summary"),
                project_id: row.get("project_id"),
                evidence_terms: row.get("evidence_terms"),
                evidence_terms_json: row.get("evidence_terms_json"),
            })
            .collect::<Vec<_>>();

        memories.extend(self.list_title_vocabulary_as_memories(project_ids).await?);
        Ok(memories)
    }

    async fn list_title_vocabulary_as_memories(
        &self,
        project_ids: Option<&[String]>,
    ) -> Result<Vec<ActivityGroupTitleMemory>, sqlx::Error> {
        let rows = if let Some(project_ids) = project_ids {
            if project_ids.is_empty() {
                Vec::new()
            } else {
                let placeholders = std::iter::repeat("?")
                    .take(project_ids.len())
                    .collect::<Vec<_>>()
                    .join(", ");
                let sql = format!(
                    r#"
                    SELECT preferred_term, project_id, normalized_term, evidence_terms_json
                    FROM activity_group_title_vocabulary
                    WHERE project_id IN ({placeholders}) OR project_id IS NULL
                    ORDER BY confidence DESC, use_count DESC, updated_at DESC
                    LIMIT 100
                    "#
                );
                let mut query = sqlx::query(&sql);
                for id in project_ids {
                    query = query.bind(id);
                }
                query.fetch_all(self.pool).await?
            }
        } else {
            sqlx::query(
                r#"
                SELECT preferred_term, project_id, normalized_term, evidence_terms_json
                FROM activity_group_title_vocabulary
                ORDER BY confidence DESC, use_count DESC, updated_at DESC
                LIMIT 100
                "#,
            )
            .fetch_all(self.pool)
            .await?
        };

        Ok(rows
            .into_iter()
            .map(|row| ActivityGroupTitleMemory {
                edited_title: row.get("preferred_term"),
                edited_summary: None,
                project_id: row.get("project_id"),
                evidence_terms: row.get("normalized_term"),
                evidence_terms_json: row.get("evidence_terms_json"),
            })
            .collect())
    }

    async fn remember_title_correction(
        &self,
        original: &ActivityGroup,
        updated: &ActivityGroup,
    ) -> Result<(), sqlx::Error> {
        let title_changed = original.title.trim() != updated.title.trim();
        let summary_changed = original.report_summary.as_deref().map(str::trim)
            != updated.report_summary.as_deref().map(str::trim);
        if !title_changed && !summary_changed {
            return Ok(());
        }

        let (terms, terms_json) = group_memory_terms(original);
        if terms.is_empty() {
            return Ok(());
        }
        let now = current_timestamp();
        sqlx::query(
            r#"
            INSERT INTO activity_group_title_memory (
              id, original_title, edited_title, edited_summary, project_id, project_name,
              evidence_fingerprint, evidence_terms, evidence_terms_json, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
            "#,
        )
        .bind(generate_id("activity_group_title_memory"))
        .bind(&original.title)
        .bind(&updated.title)
        .bind(&updated.report_summary)
        .bind(&updated.project_id)
        .bind(&updated.project_name)
        .bind(&original.fingerprint)
        .bind(terms)
        .bind(terms_json)
        .bind(&now)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_generated_group(
        &self,
        id: &str,
        input: CreateActivityGroupInput,
    ) -> Result<Option<ActivityGroup>, sqlx::Error> {
        let Some(group) = self.get(id).await? else {
            return Ok(None);
        };
        if group.locked || group.user_edited_at.is_some() {
            return Ok(Some(group));
        }

        let now = current_timestamp();
        sqlx::query(
            r#"
            UPDATE activity_groups
            SET project_id = ?2,
                workspace_id = ?3,
                title = ?4,
                summary = ?5,
                start_date = ?6,
                end_date = ?7,
                source = ?8,
                confidence = ?9,
                included_in_report = ?10,
                algorithm_version = ?11,
                confidence_label = ?12,
                rationale_json = ?13,
                report_summary = ?14,
                review_status = ?15,
                updated_at = ?16
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .bind(&input.project_id)
        .bind(&input.workspace_id)
        .bind(input.title.trim())
        .bind(input.summary.as_deref().map(str::trim))
        .bind(&input.start_date)
        .bind(&input.end_date)
        .bind(
            input
                .source
                .clone()
                .unwrap_or_else(|| "local_rule".to_string()),
        )
        .bind(input.confidence.unwrap_or(0.7))
        .bind(if input.included_in_report.unwrap_or(true) {
            1
        } else {
            0
        })
        .bind(input.algorithm_version.as_deref().unwrap_or("graph-v1"))
        .bind(input.confidence_label.as_deref().unwrap_or("likely"))
        .bind(&input.rationale_json)
        .bind(&input.report_summary)
        .bind(input.review_status.as_deref().unwrap_or("draft"))
        .bind(&now)
        .execute(self.pool)
        .await?;

        self.upsert_narrative_from_input(id, &input).await?;
        self.replace_items(id, ReplaceActivityGroupItemsInput { items: input.items })
            .await?;
        self.get(id).await
    }

    pub async fn move_item(
        &self,
        item_id: &str,
        target_group_id: &str,
    ) -> Result<Option<ActivityGroup>, sqlx::Error> {
        let now = current_timestamp();
        sqlx::query(
            r#"
            UPDATE activity_group_items
            SET group_id = ?2
            WHERE id = ?1
            "#,
        )
        .bind(item_id)
        .bind(target_group_id)
        .execute(self.pool)
        .await?;
        sqlx::query(
            "UPDATE activity_groups SET user_edited_at = ?2, updated_at = ?2 WHERE id = ?1",
        )
        .bind(target_group_id)
        .bind(&now)
        .execute(self.pool)
        .await?;
        self.get(target_group_id).await
    }

    pub async fn set_lock(
        &self,
        id: &str,
        locked: bool,
    ) -> Result<Option<ActivityGroup>, sqlx::Error> {
        let now = current_timestamp();
        sqlx::query(
            r#"
            UPDATE activity_groups
            SET locked = ?2,
                review_status = CASE WHEN ?2 = 1 THEN 'reviewed' ELSE review_status END,
                user_edited_at = ?3,
                updated_at = ?3
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .bind(if locked { 1 } else { 0 })
        .bind(&now)
        .execute(self.pool)
        .await?;
        self.get(id).await
    }

    pub async fn evidence_for_group(
        &self,
        id: &str,
    ) -> Result<Option<GroupingEvidence>, sqlx::Error> {
        let Some(group) = self.get(id).await? else {
            return Ok(None);
        };
        let commit_hashes = group
            .items
            .iter()
            .filter(|item| item.source_type == "commit")
            .filter_map(|item| {
                item.activity
                    .as_ref()
                    .and_then(|activity| activity.commit_hash.clone())
            })
            .collect::<Vec<_>>();

        let project_id = group.project_id.clone().or_else(|| {
            group.items.iter().find_map(|item| {
                item.activity
                    .as_ref()
                    .and_then(|activity| activity.project_id.clone())
            })
        });
        let mut changed_paths = Vec::new();
        let mut diff_snippets = Vec::new();
        if let Some(project_id) = project_id {
            for change in self
                .list_file_changes_for_project_commits(&project_id, &commit_hashes)
                .await?
            {
                changed_paths.push(change.path);
            }
            for snippet in self
                .list_diff_snippets_for_project_commits(&project_id, &commit_hashes)
                .await?
            {
                diff_snippets.push(GroupingDiffSnippet {
                    commit_hash: snippet.commit_hash,
                    path: snippet.path,
                    snippet: snippet.snippet,
                });
            }
        }

        let reasons = group
            .rationale_json
            .as_deref()
            .and_then(|json| serde_json::from_str::<Vec<String>>(json).ok())
            .unwrap_or_else(|| vec!["Grouped by local evidence graph".to_string()]);

        Ok(Some(GroupingEvidence {
            group,
            reasons,
            changed_paths,
            diff_snippets,
        }))
    }

    async fn list_items(&self, group_id: &str) -> Result<Vec<ActivityGroupItem>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, group_id, source_type, source_id, occurred_at, summary_snapshot, created_at
            FROM activity_group_items
            WHERE group_id = ?1
            ORDER BY occurred_at ASC
            "#,
        )
        .bind(group_id)
        .fetch_all(self.pool)
        .await?;

        let mut items = Vec::new();
        for row in rows {
            let source_type: String = row.get("source_type");
            let source_id: String = row.get("source_id");
            items.push(ActivityGroupItem {
                id: row.get("id"),
                group_id: row.get("group_id"),
                source_type: source_type.clone(),
                source_id: source_id.clone(),
                occurred_at: row.get("occurred_at"),
                summary_snapshot: row.get("summary_snapshot"),
                activity: activity_item_for_source(self.pool, &source_type, &source_id).await?,
                created_at: row.get("created_at"),
            });
        }

        Ok(items)
    }

    pub async fn list_file_changes_for_project_commits(
        &self,
        project_id: &str,
        commit_hashes: &[String],
    ) -> Result<Vec<CommitFileChange>, sqlx::Error> {
        if commit_hashes.is_empty() {
            return Ok(Vec::new());
        }
        let wanted = commit_hashes
            .iter()
            .collect::<std::collections::HashSet<_>>();
        let rows = sqlx::query(
            r#"
            SELECT project_id, commit_hash, path, old_path, change_kind, additions, deletions,
                   is_binary, language, top_level_dir, is_test, is_docs, is_config,
                   is_migration, is_generated, collected_at
            FROM commit_file_changes
            WHERE project_id = ?1
            ORDER BY path ASC
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .filter(|row| wanted.contains(&row.get::<String, _>("commit_hash")))
            .map(commit_file_change_from_row)
            .collect())
    }

    pub async fn list_diff_snippets_for_project_commits(
        &self,
        project_id: &str,
        commit_hashes: &[String],
    ) -> Result<Vec<CommitDiffSnippet>, sqlx::Error> {
        if commit_hashes.is_empty() {
            return Ok(Vec::new());
        }
        let wanted = commit_hashes
            .iter()
            .collect::<std::collections::HashSet<_>>();
        let rows = sqlx::query(
            r#"
            SELECT project_id, commit_hash, path, snippet, collected_at
            FROM commit_diff_snippets
            WHERE project_id = ?1
            ORDER BY path ASC
            "#,
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .filter(|row| wanted.contains(&row.get::<String, _>("commit_hash")))
            .map(commit_diff_snippet_from_row)
            .collect())
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

    pub async fn list_for_report(
        &self,
        from: &str,
        to: &str,
        project_ids: &Option<Vec<String>>,
        classification: &Option<String>,
    ) -> Result<Vec<ReportNote>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT report_notes.id,
                   report_notes.project_id,
                   projects.classification AS project_classification,
                   report_notes.note_type,
                   report_notes.date,
                   report_notes.content,
                   report_notes.included_in_report,
                   report_notes.created_at,
                   report_notes.updated_at
            FROM report_notes
            LEFT JOIN projects ON projects.id = report_notes.project_id
            WHERE report_notes.date >= ?1
              AND report_notes.date <= ?2
              AND (
                report_notes.project_id IS NULL
                OR projects.status = 'active'
              )
            ORDER BY report_notes.date ASC, report_notes.created_at ASC
            "#,
        )
        .bind(from)
        .bind(to)
        .fetch_all(self.pool)
        .await?;

        let mut notes = Vec::new();
        for row in rows {
            let project_id: Option<String> = row.get("project_id");
            if let Some(project_id) = &project_id {
                if !project_filter_matches(project_ids, project_id) {
                    continue;
                }
                let project_classification: Option<String> = row.get("project_classification");
                if !classification_filter_matches(classification, project_classification.as_deref())
                {
                    continue;
                }
            } else if project_ids.is_some() || classification.is_some() {
                continue;
            }

            notes.push(report_note_from_row(row));
        }

        Ok(notes)
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

pub struct ActivityEmbeddingRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ActivityEmbeddingRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(
        &self,
        input: UpsertActivityEmbeddingInput,
    ) -> Result<ActivityEmbeddingRecord, sqlx::Error> {
        let now = current_timestamp();
        let id = generate_id("activity_embedding");
        sqlx::query(
            r#"
            INSERT INTO activity_embeddings (
              id, source_type, source_id, evidence_kind, model, provider,
              text_hash, vector_path, dimensions, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
            ON CONFLICT(source_type, source_id, evidence_kind, model, provider) DO UPDATE SET
              text_hash = excluded.text_hash,
              vector_path = excluded.vector_path,
              dimensions = excluded.dimensions,
              updated_at = excluded.updated_at
            "#,
        )
        .bind(id)
        .bind(&input.source_type)
        .bind(&input.source_id)
        .bind(&input.evidence_kind)
        .bind(&input.model)
        .bind(&input.provider)
        .bind(&input.text_hash)
        .bind(&input.vector_path)
        .bind(input.dimensions)
        .bind(&now)
        .execute(self.pool)
        .await?;

        self.find(
            &input.source_type,
            &input.source_id,
            &input.evidence_kind,
            &input.model,
            &input.provider,
        )
        .await?
        .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn find(
        &self,
        source_type: &str,
        source_id: &str,
        evidence_kind: &str,
        model: &str,
        provider: &str,
    ) -> Result<Option<ActivityEmbeddingRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, source_type, source_id, evidence_kind, model, provider,
                   text_hash, vector_path, dimensions, created_at, updated_at
            FROM activity_embeddings
            WHERE source_type = ?1 AND source_id = ?2 AND evidence_kind = ?3
              AND model = ?4 AND provider = ?5
            "#,
        )
        .bind(source_type)
        .bind(source_id)
        .bind(evidence_kind)
        .bind(model)
        .bind(provider)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(activity_embedding_from_row))
    }

    pub async fn list_by_sources(
        &self,
        sources: &[(String, String)],
        evidence_kind: &str,
        model: &str,
        provider: &str,
    ) -> Result<Vec<ActivityEmbeddingRecord>, sqlx::Error> {
        if sources.is_empty() {
            return Ok(Vec::new());
        }
        let wanted = sources
            .iter()
            .map(|(source_type, source_id)| format!("{source_type}\u{1f}{source_id}"))
            .collect::<std::collections::HashSet<_>>();
        let rows = sqlx::query(
            r#"
            SELECT id, source_type, source_id, evidence_kind, model, provider,
                   text_hash, vector_path, dimensions, created_at, updated_at
            FROM activity_embeddings
            WHERE evidence_kind = ?1 AND model = ?2 AND provider = ?3
            "#,
        )
        .bind(evidence_kind)
        .bind(model)
        .bind(provider)
        .fetch_all(self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .filter(|row| {
                wanted.contains(&format!(
                    "{}\u{1f}{}",
                    row.get::<String, _>("source_type"),
                    row.get::<String, _>("source_id")
                ))
            })
            .map(activity_embedding_from_row)
            .collect())
    }
}

pub struct BackgroundJobRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> BackgroundJobRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn enqueue_unique(
        &self,
        kind: &str,
        payload_json: &str,
    ) -> Result<Option<BackgroundJobRecord>, sqlx::Error> {
        let existing = sqlx::query(
            r#"
            SELECT id, kind, payload_json, status, attempts, last_error, created_at, updated_at
            FROM background_jobs
            WHERE kind = ?1 AND payload_json = ?2 AND status IN ('queued', 'running')
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(kind)
        .bind(payload_json)
        .fetch_optional(self.pool)
        .await?;
        if let Some(row) = existing {
            return Ok(Some(background_job_from_row(row)));
        }

        let now = current_timestamp();
        let id = generate_id("background_job");
        sqlx::query(
            r#"
            INSERT INTO background_jobs (
              id, kind, payload_json, status, attempts, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, 'queued', 0, ?4, ?4)
            "#,
        )
        .bind(&id)
        .bind(kind)
        .bind(payload_json)
        .bind(&now)
        .execute(self.pool)
        .await?;
        self.get(&id).await
    }

    pub async fn get(&self, id: &str) -> Result<Option<BackgroundJobRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, kind, payload_json, status, attempts, last_error, created_at, updated_at
            FROM background_jobs
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;
        Ok(row.map(background_job_from_row))
    }

    pub async fn next_queued(
        &self,
        kind: Option<&str>,
    ) -> Result<Option<BackgroundJobRecord>, sqlx::Error> {
        let row = if let Some(kind) = kind {
            sqlx::query(
                r#"
                SELECT id, kind, payload_json, status, attempts, last_error, created_at, updated_at
                FROM background_jobs
                WHERE status = 'queued' AND kind = ?1
                ORDER BY created_at ASC
                LIMIT 1
                "#,
            )
            .bind(kind)
            .fetch_optional(self.pool)
            .await?
        } else {
            sqlx::query(
                r#"
                SELECT id, kind, payload_json, status, attempts, last_error, created_at, updated_at
                FROM background_jobs
                WHERE status = 'queued'
                ORDER BY created_at ASC
                LIMIT 1
                "#,
            )
            .fetch_optional(self.pool)
            .await?
        };
        Ok(row.map(background_job_from_row))
    }

    pub async fn mark_running(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE background_jobs SET status = 'running', attempts = attempts + 1, updated_at = ?2 WHERE id = ?1",
        )
        .bind(id)
        .bind(current_timestamp())
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn mark_completed(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE background_jobs SET status = 'completed', last_error = NULL, updated_at = ?2 WHERE id = ?1",
        )
        .bind(id)
        .bind(current_timestamp())
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn mark_failed(&self, id: &str, error: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE background_jobs SET status = 'failed', last_error = ?2, updated_at = ?3 WHERE id = ?1",
        )
        .bind(id)
        .bind(error)
        .bind(current_timestamp())
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn status(&self, kind: Option<&str>) -> Result<BackgroundJobStatus, sqlx::Error> {
        let rows = if let Some(kind) = kind {
            sqlx::query(
                "SELECT status, COUNT(*) AS count FROM background_jobs WHERE kind = ?1 GROUP BY status",
            )
            .bind(kind)
            .fetch_all(self.pool)
            .await?
        } else {
            sqlx::query("SELECT status, COUNT(*) AS count FROM background_jobs GROUP BY status")
                .fetch_all(self.pool)
                .await?
        };
        let mut status = BackgroundJobStatus {
            queued: 0,
            running: 0,
            failed: 0,
            completed: 0,
        };
        for row in rows {
            match row.get::<String, _>("status").as_str() {
                "queued" => status.queued = row.get("count"),
                "running" => status.running = row.get("count"),
                "failed" => status.failed = row.get("count"),
                "completed" => status.completed = row.get("count"),
                _ => {}
            }
        }
        Ok(status)
    }
}

pub struct SparcForceConnectionRepository<'a> {
    pool: &'a SqlitePool,
}

impl<'a> SparcForceConnectionRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get(&self) -> Result<Option<SparcForceConnection>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, base_url, status, account_email, remote_user_id, remote_username,
                   masked_email, access_token_ref, refresh_token_ref, otp_session_ref,
                   access_expires_at, otp_expires_at, connected_at, last_validated_at,
                   last_synced_at, last_error, created_at, updated_at
            FROM sparc_force_connections
            ORDER BY updated_at DESC
            LIMIT 1
            "#,
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(sparc_force_connection_from_row))
    }

    pub async fn save(&self, connection: &SparcForceConnection) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO sparc_force_connections (
              id, base_url, status, account_email, remote_user_id, remote_username,
              masked_email, access_token_ref, refresh_token_ref, otp_session_ref,
              access_expires_at, otp_expires_at, connected_at, last_validated_at,
              last_synced_at, last_error, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
            ON CONFLICT(id) DO UPDATE SET
              base_url = excluded.base_url,
              status = excluded.status,
              account_email = excluded.account_email,
              remote_user_id = excluded.remote_user_id,
              remote_username = excluded.remote_username,
              masked_email = excluded.masked_email,
              access_token_ref = excluded.access_token_ref,
              refresh_token_ref = excluded.refresh_token_ref,
              otp_session_ref = excluded.otp_session_ref,
              access_expires_at = excluded.access_expires_at,
              otp_expires_at = excluded.otp_expires_at,
              connected_at = excluded.connected_at,
              last_validated_at = excluded.last_validated_at,
              last_synced_at = excluded.last_synced_at,
              last_error = excluded.last_error,
              updated_at = excluded.updated_at
            "#,
        )
        .bind(&connection.id)
        .bind(&connection.base_url)
        .bind(&connection.status)
        .bind(&connection.account_email)
        .bind(connection.remote_user_id)
        .bind(&connection.remote_username)
        .bind(&connection.masked_email)
        .bind(&connection.access_token_ref)
        .bind(&connection.refresh_token_ref)
        .bind(&connection.otp_session_ref)
        .bind(&connection.access_expires_at)
        .bind(&connection.otp_expires_at)
        .bind(&connection.connected_at)
        .bind(&connection.last_validated_at)
        .bind(&connection.last_synced_at)
        .bind(&connection.last_error)
        .bind(&connection.created_at)
        .bind(&connection.updated_at)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn new_connection(
        &self,
        base_url: String,
        account_email: String,
    ) -> SparcForceConnection {
        let now = current_timestamp();
        let id = generate_id("sparc_force");

        SparcForceConnection {
            access_token_ref: Some(format!("sparc_force:{id}:access_token")),
            refresh_token_ref: Some(format!("sparc_force:{id}:refresh_token")),
            id,
            base_url,
            status: "disconnected".to_string(),
            account_email,
            remote_user_id: None,
            remote_username: None,
            masked_email: None,
            otp_session_ref: None,
            access_expires_at: None,
            otp_expires_at: None,
            connected_at: None,
            last_validated_at: None,
            last_synced_at: None,
            last_error: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    pub async fn import_counts(
        &self,
        connection_id: &str,
    ) -> Result<SparcForceImportCounts, sqlx::Error> {
        let cases = count_table(self.pool, "sparc_force_cases", connection_id).await?;
        let projects = count_table(self.pool, "sparc_force_projects", connection_id).await?;
        let tasks = count_table(self.pool, "sparc_force_tasks", connection_id).await?;

        Ok(SparcForceImportCounts {
            cases,
            projects,
            tasks,
        })
    }

    pub async fn upsert_case(
        &self,
        connection_id: &str,
        record: &SparcForceCacheRecord,
    ) -> Result<(), sqlx::Error> {
        let now = current_timestamp();
        sqlx::query(
            r#"
            INSERT INTO sparc_force_cases (
              connection_id, external_id, case_number, title, status, priority,
              assigned_to, project_external_id, updated_at_remote, created_at_remote, raw_json, imported_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(connection_id, external_id) DO UPDATE SET
              case_number = excluded.case_number,
              title = excluded.title,
              status = excluded.status,
              priority = excluded.priority,
              assigned_to = excluded.assigned_to,
              project_external_id = excluded.project_external_id,
              updated_at_remote = excluded.updated_at_remote,
              created_at_remote = excluded.created_at_remote,
              raw_json = excluded.raw_json,
              imported_at = excluded.imported_at
            "#,
        )
        .bind(connection_id)
        .bind(&record.external_id)
        .bind(None::<String>)
        .bind(&record.title)
        .bind(&record.status)
        .bind(&record.priority)
        .bind(record.assigned_to)
        .bind(&record.project_external_id)
        .bind(&record.updated_at_remote)
        .bind(&record.created_at_remote)
        .bind(&record.raw_json)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_case_record(
        &self,
        external_id: &str,
    ) -> Result<Option<SparcForceImportedItem>, sqlx::Error> {
        let Some(connection) = self.get().await? else {
            return Ok(None);
        };

        let row = sqlx::query(
            r#"
            SELECT external_id, title, status, priority, assigned_to, project_external_id,
                   updated_at_remote, created_at_remote, imported_at, raw_json
            FROM sparc_force_cases
            WHERE connection_id = ?1 AND external_id = ?2
            LIMIT 1
            "#,
        )
        .bind(&connection.id)
        .bind(external_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(|row| {
            sparc_force_imported_item_from_row(
                row,
                "case",
                connection.remote_user_id,
                connection.remote_username.as_deref(),
            )
        }))
    }

    pub async fn upsert_project(
        &self,
        connection_id: &str,
        record: &SparcForceCacheRecord,
    ) -> Result<(), sqlx::Error> {
        let now = current_timestamp();
        sqlx::query(
            r#"
            INSERT INTO sparc_force_projects (
              connection_id, external_id, name, status, priority, updated_at_remote, created_at_remote, raw_json, imported_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(connection_id, external_id) DO UPDATE SET
              name = excluded.name,
              status = excluded.status,
              priority = excluded.priority,
              updated_at_remote = excluded.updated_at_remote,
              created_at_remote = excluded.created_at_remote,
              raw_json = excluded.raw_json,
              imported_at = excluded.imported_at
            "#,
        )
        .bind(connection_id)
        .bind(&record.external_id)
        .bind(&record.title)
        .bind(&record.status)
        .bind(&record.priority)
        .bind(&record.updated_at_remote)
        .bind(&record.created_at_remote)
        .bind(&record.raw_json)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn upsert_task(
        &self,
        connection_id: &str,
        source: &str,
        record: &SparcForceCacheRecord,
    ) -> Result<(), sqlx::Error> {
        let now = current_timestamp();
        let external_kind = sparc_force_canonical_task_kind(source);
        sqlx::query(
            r#"
            INSERT INTO sparc_force_tasks (
              connection_id, source, external_kind, external_id, title, status, priority, assigned_to,
              project_external_id, case_external_id, updated_at_remote, created_at_remote, raw_json, imported_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(connection_id, external_kind, external_id) DO UPDATE SET
              source = excluded.source,
              title = excluded.title,
              status = excluded.status,
              priority = excluded.priority,
              assigned_to = excluded.assigned_to,
              project_external_id = excluded.project_external_id,
              case_external_id = excluded.case_external_id,
              updated_at_remote = excluded.updated_at_remote,
              created_at_remote = excluded.created_at_remote,
              raw_json = excluded.raw_json,
              imported_at = excluded.imported_at
            "#,
        )
        .bind(connection_id)
        .bind(source)
        .bind(external_kind)
        .bind(&record.external_id)
        .bind(&record.title)
        .bind(&record.status)
        .bind(&record.priority)
        .bind(record.assigned_to)
        .bind(&record.project_external_id)
        .bind(&record.case_external_id)
        .bind(&record.updated_at_remote)
        .bind(&record.created_at_remote)
        .bind(&record.raw_json)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn imported_data(&self, limit: i64) -> Result<SparcForceImportedData, sqlx::Error> {
        let Some(connection) = self.get().await? else {
            return Ok(SparcForceImportedData {
                cases: Vec::new(),
                projects: Vec::new(),
                tasks: Vec::new(),
            });
        };
        let limit = limit.clamp(1, 100);

        let case_rows = sqlx::query(
            r#"
            SELECT external_id, title, status, priority, assigned_to, project_external_id,
                   updated_at_remote, created_at_remote, imported_at, raw_json
            FROM sparc_force_cases
            WHERE connection_id = ?1
            ORDER BY imported_at DESC
            LIMIT ?2
            "#,
        )
        .bind(&connection.id)
        .bind(limit)
        .fetch_all(self.pool)
        .await?;

        let project_rows = sqlx::query(
            r#"
            SELECT external_id, name AS title, status, priority, updated_at_remote, created_at_remote, imported_at, raw_json
            FROM sparc_force_projects
            WHERE connection_id = ?1
            ORDER BY imported_at DESC
            LIMIT ?2
            "#,
        )
        .bind(&connection.id)
        .bind(limit)
        .fetch_all(self.pool)
        .await?;

        let task_rows = sqlx::query(
            r#"
            SELECT external_id, title, status, priority, source, external_kind, assigned_to, project_external_id,
                   case_external_id, updated_at_remote, created_at_remote, imported_at, raw_json
            FROM sparc_force_tasks
            WHERE connection_id = ?1
            ORDER BY imported_at DESC
            LIMIT ?2
            "#,
        )
        .bind(&connection.id)
        .bind(limit)
        .fetch_all(self.pool)
        .await?;

        Ok(SparcForceImportedData {
            cases: case_rows
                .into_iter()
                .map(|row| {
                    sparc_force_imported_item_from_row(
                        row,
                        "case",
                        connection.remote_user_id,
                        connection.remote_username.as_deref(),
                    )
                })
                .collect(),
            projects: project_rows
                .into_iter()
                .map(|row| {
                    sparc_force_imported_item_from_row(
                        row,
                        "project",
                        connection.remote_user_id,
                        connection.remote_username.as_deref(),
                    )
                })
                .collect(),
            tasks: task_rows
                .into_iter()
                .map(|row| {
                    sparc_force_imported_item_from_row(
                        row,
                        "task",
                        connection.remote_user_id,
                        connection.remote_username.as_deref(),
                    )
                })
                .collect(),
        })
    }

    pub async fn list_records(
        &self,
        input: ListSparcForceRecordsInput,
    ) -> Result<SparcForceRecordQueryResult, sqlx::Error> {
        let Some(connection) = self.get().await? else {
            let limit = input.limit.unwrap_or(50).clamp(1, 100);
            let offset = input.offset.unwrap_or(0).max(0);
            return Ok(SparcForceRecordQueryResult {
                records: Vec::new(),
                total: 0,
                limit,
                offset,
                counts: SparcForceRecordCounts::default(),
            });
        };

        let mut records = Vec::new();
        if input.kind.as_deref().map(normalize_filter_value) != Some("task".to_string())
            && input.kind.as_deref().map(normalize_filter_value) != Some("project".to_string())
        {
            records.extend(
                self.list_case_records(
                    &connection.id,
                    connection.remote_user_id,
                    connection.remote_username.as_deref(),
                )
                .await?,
            );
        }
        if input.kind.as_deref().map(normalize_filter_value) != Some("case".to_string())
            && input.kind.as_deref().map(normalize_filter_value) != Some("task".to_string())
        {
            records.extend(
                self.list_project_records(
                    &connection.id,
                    connection.remote_user_id,
                    connection.remote_username.as_deref(),
                )
                .await?,
            );
        }
        if input.kind.as_deref().map(normalize_filter_value) != Some("case".to_string())
            && input.kind.as_deref().map(normalize_filter_value) != Some("project".to_string())
        {
            records.extend(
                self.list_task_records(
                    &connection.id,
                    connection.remote_user_id,
                    connection.remote_username.as_deref(),
                )
                .await?,
            );
        }

        let counts = sparc_force_record_counts(&records);
        let mut filtered = records
            .into_iter()
            .filter(|record| sparc_force_record_matches(record, &input))
            .collect::<Vec<_>>();

        sort_sparc_force_records(&mut filtered, &input);

        let total = filtered.len() as i64;
        let limit = input.limit.unwrap_or(50).clamp(1, 100);
        let offset = input.offset.unwrap_or(0).max(0);
        let records = filtered
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect();

        Ok(SparcForceRecordQueryResult {
            records,
            total,
            limit,
            offset,
            counts,
        })
    }

    async fn list_case_records(
        &self,
        connection_id: &str,
        remote_user_id: Option<i64>,
        remote_username: Option<&str>,
    ) -> Result<Vec<SparcForceImportedItem>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT external_id, title, status, priority, assigned_to, project_external_id,
                   updated_at_remote, created_at_remote, imported_at, raw_json
            FROM sparc_force_cases
            WHERE connection_id = ?1
            "#,
        )
        .bind(connection_id)
        .fetch_all(self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                sparc_force_imported_item_from_row(row, "case", remote_user_id, remote_username)
            })
            .collect())
    }

    async fn list_project_records(
        &self,
        connection_id: &str,
        remote_user_id: Option<i64>,
        remote_username: Option<&str>,
    ) -> Result<Vec<SparcForceImportedItem>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT external_id, name AS title, status, priority, updated_at_remote, created_at_remote, imported_at, raw_json
            FROM sparc_force_projects
            WHERE connection_id = ?1
            "#,
        )
        .bind(connection_id)
        .fetch_all(self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                sparc_force_imported_item_from_row(row, "project", remote_user_id, remote_username)
            })
            .collect())
    }

    async fn list_task_records(
        &self,
        connection_id: &str,
        remote_user_id: Option<i64>,
        remote_username: Option<&str>,
    ) -> Result<Vec<SparcForceImportedItem>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT external_id, title, status, priority, source, external_kind, assigned_to, project_external_id,
                   case_external_id, updated_at_remote, created_at_remote, imported_at, raw_json
            FROM sparc_force_tasks
            WHERE connection_id = ?1
            "#,
        )
        .bind(connection_id)
        .fetch_all(self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                sparc_force_imported_item_from_row(row, "task", remote_user_id, remote_username)
            })
            .collect())
    }

    pub async fn find_task_record(
        &self,
        source: &str,
        external_id: &str,
    ) -> Result<Option<SparcForceImportedItem>, sqlx::Error> {
        let Some(connection) = self.get().await? else {
            return Ok(None);
        };
        let external_kind = sparc_force_canonical_task_kind(source);

        let row = sqlx::query(
            r#"
            SELECT external_id, title, status, priority, source, external_kind, assigned_to, project_external_id,
                   case_external_id, updated_at_remote, created_at_remote, imported_at, raw_json
            FROM sparc_force_tasks
            WHERE connection_id = ?1 AND external_kind = ?2 AND external_id = ?3
            LIMIT 1
            "#,
        )
        .bind(&connection.id)
        .bind(external_kind)
        .bind(external_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(|row| {
            sparc_force_imported_item_from_row(
                row,
                "task",
                connection.remote_user_id,
                connection.remote_username.as_deref(),
            )
        }))
    }

    pub async fn linked_weekly_task_id(
        &self,
        external_kind: &str,
        external_source: &str,
        external_id: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        let Some(connection) = self.get().await? else {
            return Ok(None);
        };
        let linked_external_id = sparc_force_linked_task_external_id(external_source, external_id);
        sqlx::query_scalar(
            r#"
            SELECT native_id
            FROM sparc_force_native_links
            WHERE connection_id = ?1
              AND external_kind = ?2
              AND external_id = ?3
              AND native_kind = 'weekly_task'
            LIMIT 1
            "#,
        )
        .bind(&connection.id)
        .bind(external_kind)
        .bind(linked_external_id)
        .fetch_optional(self.pool)
        .await
    }

    pub async fn save_weekly_task_link(
        &self,
        external_kind: &str,
        external_source: &str,
        external_id: &str,
        weekly_task_id: &str,
    ) -> Result<(), sqlx::Error> {
        let Some(connection) = self.get().await? else {
            return Ok(());
        };
        let now = current_timestamp();
        let linked_external_id = sparc_force_linked_task_external_id(external_source, external_id);
        sqlx::query(
            r#"
            DELETE FROM sparc_force_native_links
            WHERE connection_id = ?1
              AND external_kind = ?2
              AND external_id = ?3
              AND native_kind = 'weekly_task'
            "#,
        )
        .bind(&connection.id)
        .bind(external_kind)
        .bind(&linked_external_id)
        .execute(self.pool)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO sparc_force_native_links (
              id, connection_id, external_kind, external_id, native_kind, native_id, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, 'weekly_task', ?5, ?6, ?7)
            "#,
        )
        .bind(generate_id("sparc_force_link"))
        .bind(&connection.id)
        .bind(external_kind)
        .bind(linked_external_id)
        .bind(weekly_task_id)
        .bind(&now)
        .bind(&now)
        .execute(self.pool)
        .await?;

        Ok(())
    }
}

pub struct WeeklyTaskRepository<'a> {
    pool: &'a SqlitePool,
}

pub struct CalendarSourceRepository<'a> {
    pool: &'a SqlitePool,
}

pub struct CalendarEventRepository<'a> {
    pool: &'a SqlitePool,
}

pub struct DailyPlanRepository<'a> {
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
                   projects.classification AS project_classification,
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
                   weekly_tasks.estimated_minutes,
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
            if let Some(project_id) = &task.project_id {
                let project_classification: Option<String> =
                    sqlx::query_scalar("SELECT classification FROM projects WHERE id = ?1")
                        .bind(project_id)
                        .fetch_optional(self.pool)
                        .await?;
                if !classification_filter_matches(
                    &input.classification,
                    project_classification.as_deref(),
                ) {
                    continue;
                }
            } else if input.classification.is_some() {
                continue;
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
        let estimated_minutes = input.estimated_minutes.filter(|minutes| *minutes > 0);
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
            estimated_minutes,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        sqlx::query(
            r#"
            INSERT INTO weekly_tasks (
              id, project_id, task_type, status, title, details, week_start_date,
              target_date, completed_at, priority, included_in_report, progress_percent, estimated_minutes, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
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
        .bind(task.estimated_minutes)
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
        if input.estimated_minutes.is_some() {
            task.estimated_minutes = input.estimated_minutes.filter(|minutes| *minutes > 0);
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
                estimated_minutes = ?13,
                updated_at = ?14
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
        .bind(task.estimated_minutes)
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

    pub async fn find(&self, id: &str) -> Result<Option<WeeklyTask>, sqlx::Error> {
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
                   weekly_tasks.estimated_minutes,
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

impl<'a> CalendarSourceRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<CalendarSource>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, provider, account_email, account_name, sync_status, last_synced_at,
                   token_ref, created_at, updated_at
            FROM calendar_sources
            ORDER BY updated_at DESC
            "#,
        )
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(calendar_source_from_row).collect())
    }

    pub async fn upsert_google_source(
        &self,
        account_email: &str,
        account_name: Option<String>,
        token_ref: Option<String>,
    ) -> Result<CalendarSource, sqlx::Error> {
        let now = current_timestamp();
        let existing = sqlx::query(
            r#"
            SELECT id, provider, account_email, account_name, sync_status, last_synced_at,
                   token_ref, created_at, updated_at
            FROM calendar_sources
            WHERE provider = 'google' AND account_email = ?1
            "#,
        )
        .bind(account_email.trim())
        .fetch_optional(self.pool)
        .await?;

        if let Some(row) = existing {
            let mut source = calendar_source_from_row(row);
            source.account_name = account_name;
            source.token_ref = token_ref;
            source.sync_status = "connected".to_string();
            source.updated_at = now;

            sqlx::query(
                r#"
                UPDATE calendar_sources
                SET account_name = ?2,
                    sync_status = ?3,
                    token_ref = ?4,
                    updated_at = ?5
                WHERE id = ?1
                "#,
            )
            .bind(&source.id)
            .bind(&source.account_name)
            .bind(&source.sync_status)
            .bind(&source.token_ref)
            .bind(&source.updated_at)
            .execute(self.pool)
            .await?;

            return Ok(source);
        }

        let source = CalendarSource {
            id: generate_id("calendar_source"),
            provider: "google".to_string(),
            account_email: account_email.trim().to_string(),
            account_name,
            sync_status: "connected".to_string(),
            last_synced_at: None,
            token_ref,
            created_at: now.clone(),
            updated_at: now,
        };

        sqlx::query(
            r#"
            INSERT INTO calendar_sources (
              id, provider, account_email, account_name, sync_status, last_synced_at,
              token_ref, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
        )
        .bind(&source.id)
        .bind(&source.provider)
        .bind(&source.account_email)
        .bind(&source.account_name)
        .bind(&source.sync_status)
        .bind(&source.last_synced_at)
        .bind(&source.token_ref)
        .bind(&source.created_at)
        .bind(&source.updated_at)
        .execute(self.pool)
        .await?;

        Ok(source)
    }

    pub async fn disconnect(&self, source_id: &str) -> Result<bool, sqlx::Error> {
        let now = current_timestamp();
        let result = sqlx::query(
            r#"
            UPDATE calendar_sources
            SET sync_status = 'disconnected',
                token_ref = NULL,
                updated_at = ?2
            WHERE id = ?1
            "#,
        )
        .bind(source_id)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}

#[async_trait::async_trait]
impl CalendarSourceStore for CalendarSourceRepository<'_> {
    async fn list(&self) -> Result<Vec<CalendarSource>, sqlx::Error> {
        CalendarSourceRepository::list(self).await
    }

    async fn upsert_google_source(
        &self,
        account_email: &str,
        account_name: Option<String>,
        token_ref: Option<String>,
    ) -> Result<CalendarSource, sqlx::Error> {
        CalendarSourceRepository::upsert_google_source(self, account_email, account_name, token_ref)
            .await
    }

    async fn disconnect(&self, source_id: &str) -> Result<bool, sqlx::Error> {
        CalendarSourceRepository::disconnect(self, source_id).await
    }
}

impl<'a> CalendarEventRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(
        &self,
        input: ListCalendarEventsInput,
    ) -> Result<Vec<CalendarEvent>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, source_id, external_id, title, description, location, starts_at, ends_at,
                   timezone, all_day, busy_status, is_cancelled, project_id, task_id,
                   created_at, updated_at, imported_at
            FROM calendar_events
            WHERE starts_at <= ?2
              AND ends_at >= ?1
              AND (?3 IS NULL OR source_id = ?3)
            ORDER BY starts_at ASC
            "#,
        )
        .bind(&input.from)
        .bind(&input.to)
        .bind(&input.source_id)
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(calendar_event_from_row).collect())
    }

    pub async fn week_capacity(
        &self,
        input: GetWeekCapacityInput,
    ) -> Result<WeekCapacity, sqlx::Error> {
        let settings = SettingsRepository::new(self.pool).get().await?;
        let tasks = WeeklyTaskRepository::new(self.pool)
            .list(ListWeeklyTasksInput {
                week_start_date: input.week_start_date.clone(),
                week_end_date: input.week_end_date.clone(),
                project_ids: None,
                classification: None,
                task_type: None,
                status: None,
                included_in_report: None,
            })
            .await?;
        let events = self
            .list(ListCalendarEventsInput {
                from: input.week_start_date.clone(),
                to: input.week_end_date.clone(),
                source_id: None,
            })
            .await?;
        let manual_meetings =
            manual_meeting_minutes_by_date(self.pool, &input.week_start_date, &input.week_end_date)
                .await?;
        let actual_work =
            actual_work_minutes(self.pool, &input.week_start_date, &input.week_end_date).await?;
        let dates = dates_between(&input.week_start_date, &input.week_end_date);
        let mut days = Vec::new();

        for date in dates {
            let day_name = day_name_for_date(&date);
            let is_working_day = settings.working_days.iter().any(|day| day == &day_name);
            let gross = if is_working_day {
                settings.daily_work_minutes
            } else {
                0
            };
            let meeting_minutes = meeting_minutes_for_date(&events, &date)
                + manual_meetings
                    .iter()
                    .find(|(meeting_date, _)| meeting_date == &date)
                    .map(|(_, minutes)| *minutes)
                    .unwrap_or(0);
            let planned_task_minutes = tasks
                .iter()
                .filter(|task| {
                    task.status != WeeklyTaskStatus::Completed
                        && task.status != WeeklyTaskStatus::Dropped
                })
                .filter(|task| {
                    task.target_date.as_deref().unwrap_or(&task.week_start_date) == date.as_str()
                })
                .map(|task| task.estimated_minutes.unwrap_or(0).max(0))
                .sum::<i32>();
            let available = (gross - meeting_minutes).max(0);

            days.push(DayCapacity {
                date,
                day_name,
                is_working_day,
                gross_capacity_minutes: gross,
                meeting_minutes,
                planned_task_minutes,
                available_minutes: available,
                remaining_minutes: available - planned_task_minutes,
            });
        }

        let gross_capacity_minutes = days
            .iter()
            .map(|day| day.gross_capacity_minutes)
            .sum::<i32>();
        let meeting_minutes = days.iter().map(|day| day.meeting_minutes).sum::<i32>();
        let planned_task_minutes = days.iter().map(|day| day.planned_task_minutes).sum::<i32>();
        let available_minutes = (gross_capacity_minutes - meeting_minutes).max(0);

        Ok(WeekCapacity {
            week_start_date: input.week_start_date,
            week_end_date: input.week_end_date,
            gross_capacity_minutes,
            meeting_minutes,
            planned_task_minutes,
            available_minutes,
            remaining_minutes: available_minutes - planned_task_minutes,
            actual_work_minutes: actual_work,
            days,
        })
    }
}

#[async_trait::async_trait]
impl CalendarEventStore for CalendarEventRepository<'_> {
    async fn list(
        &self,
        input: ListCalendarEventsInput,
    ) -> Result<Vec<CalendarEvent>, sqlx::Error> {
        CalendarEventRepository::list(self, input).await
    }

    async fn week_capacity(
        &self,
        input: GetWeekCapacityInput,
    ) -> Result<WeekCapacity, sqlx::Error> {
        CalendarEventRepository::week_capacity(self, input).await
    }
}

impl<'a> DailyPlanRepository<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get_by_date(
        &self,
        input: GetDailyPlanInput,
    ) -> Result<Option<DailyPlan>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, date, focus_goal_minutes, current_task_id, suggested_task_id, created_at, updated_at
            FROM daily_plans
            WHERE date = ?1
            LIMIT 1
            "#,
        )
        .bind(input.date)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.map(daily_plan_from_row))
    }

    pub async fn upsert(&self, input: UpsertDailyPlanInput) -> Result<DailyPlan, sqlx::Error> {
        let now = current_timestamp();
        let existing = self
            .get_by_date(GetDailyPlanInput {
                date: input.date.clone(),
            })
            .await?;
        if let Some(mut plan) = existing {
            if let Some(minutes) = input.focus_goal_minutes {
                plan.focus_goal_minutes = minutes;
            }
            if input.current_task_id.is_some() {
                plan.current_task_id = normalize_optional(input.current_task_id);
            }
            if input.suggested_task_id.is_some() {
                plan.suggested_task_id = normalize_optional(input.suggested_task_id);
            }
            plan.updated_at = now.clone();
            sqlx::query(
                r#"
                UPDATE daily_plans
                SET focus_goal_minutes = ?2,
                    current_task_id = ?3,
                    suggested_task_id = ?4,
                    updated_at = ?5
                WHERE id = ?1
                "#,
            )
            .bind(&plan.id)
            .bind(plan.focus_goal_minutes)
            .bind(&plan.current_task_id)
            .bind(&plan.suggested_task_id)
            .bind(&plan.updated_at)
            .execute(self.pool)
            .await?;
            return Ok(plan);
        }

        let plan = DailyPlan {
            id: generate_id("daily_plan"),
            date: input.date,
            focus_goal_minutes: input.focus_goal_minutes.unwrap_or(240),
            current_task_id: normalize_optional(input.current_task_id),
            suggested_task_id: normalize_optional(input.suggested_task_id),
            created_at: now.clone(),
            updated_at: now,
        };

        sqlx::query(
            r#"
            INSERT INTO daily_plans (id, date, focus_goal_minutes, current_task_id, suggested_task_id, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
        )
        .bind(&plan.id)
        .bind(&plan.date)
        .bind(plan.focus_goal_minutes)
        .bind(&plan.current_task_id)
        .bind(&plan.suggested_task_id)
        .bind(&plan.created_at)
        .bind(&plan.updated_at)
        .execute(self.pool)
        .await?;

        Ok(plan)
    }

    pub async fn list_items(&self, daily_plan_id: &str) -> Result<Vec<DailyPlanItem>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, daily_plan_id, rank, title, weekly_task_id, planned_minutes, status, created_at, updated_at
            FROM daily_plan_items
            WHERE daily_plan_id = ?1
            ORDER BY rank ASC, created_at ASC
            "#,
        )
        .bind(daily_plan_id)
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(daily_plan_item_from_row).collect())
    }

    pub async fn replace_items(
        &self,
        daily_plan_id: &str,
        items: Vec<ReplaceDailyPlanItemInput>,
    ) -> Result<Vec<DailyPlanItem>, sqlx::Error> {
        sqlx::query("DELETE FROM daily_plan_items WHERE daily_plan_id = ?1")
            .bind(daily_plan_id)
            .execute(self.pool)
            .await?;
        let now = current_timestamp();
        for item in items {
            sqlx::query(
                r#"
                INSERT INTO daily_plan_items (
                  id, daily_plan_id, rank, title, weekly_task_id, planned_minutes, status, created_at, updated_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'todo', ?7, ?8)
                "#,
            )
            .bind(generate_id("daily_plan_item"))
            .bind(daily_plan_id)
            .bind(item.rank)
            .bind(item.title.trim())
            .bind(normalize_optional(item.weekly_task_id))
            .bind(item.planned_minutes)
            .bind(&now)
            .bind(&now)
            .execute(self.pool)
            .await?;
        }
        self.list_items(daily_plan_id).await
    }

    pub async fn update_item(
        &self,
        id: &str,
        input: UpdateDailyPlanItemInput,
    ) -> Result<Option<DailyPlanItem>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, daily_plan_id, rank, title, weekly_task_id, planned_minutes, status, created_at, updated_at
            FROM daily_plan_items
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let mut item = daily_plan_item_from_row(row);
        if let Some(status) = input.status {
            item.status = status;
        }
        if let Some(title) = input.title {
            item.title = title.trim().to_string();
        }
        if input.weekly_task_id.is_some() {
            item.weekly_task_id = normalize_optional(input.weekly_task_id);
        }
        if input.planned_minutes.is_some() {
            item.planned_minutes = input.planned_minutes;
        }
        item.updated_at = current_timestamp();

        sqlx::query(
            r#"
            UPDATE daily_plan_items
            SET title = ?2,
                weekly_task_id = ?3,
                planned_minutes = ?4,
                status = ?5,
                updated_at = ?6
            WHERE id = ?1
            "#,
        )
        .bind(&item.id)
        .bind(&item.title)
        .bind(&item.weekly_task_id)
        .bind(item.planned_minutes)
        .bind(item.status.as_storage_value())
        .bind(&item.updated_at)
        .execute(self.pool)
        .await?;

        Ok(Some(item))
    }
}

#[async_trait::async_trait]
impl DailyPlanStore for DailyPlanRepository<'_> {
    async fn get_by_date(
        &self,
        input: GetDailyPlanInput,
    ) -> Result<Option<DailyPlan>, sqlx::Error> {
        DailyPlanRepository::get_by_date(self, input).await
    }

    async fn upsert(&self, input: UpsertDailyPlanInput) -> Result<DailyPlan, sqlx::Error> {
        DailyPlanRepository::upsert(self, input).await
    }

    async fn list_items(&self, daily_plan_id: &str) -> Result<Vec<DailyPlanItem>, sqlx::Error> {
        DailyPlanRepository::list_items(self, daily_plan_id).await
    }

    async fn replace_items(
        &self,
        daily_plan_id: &str,
        items: Vec<ReplaceDailyPlanItemInput>,
    ) -> Result<Vec<DailyPlanItem>, sqlx::Error> {
        DailyPlanRepository::replace_items(self, daily_plan_id, items).await
    }

    async fn update_item(
        &self,
        id: &str,
        input: UpdateDailyPlanItemInput,
    ) -> Result<Option<DailyPlanItem>, sqlx::Error> {
        DailyPlanRepository::update_item(self, id, input).await
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
        if let Some(value) = input.use_gravatar_profile_image {
            settings.use_gravatar_profile_image = value;
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
        if let Some(value) = input.daily_work_minutes {
            settings.daily_work_minutes = value;
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
        if let Some(value) = input.github_connected {
            settings.github_connected = value;
        }
        if let Some(value) = input.github_username {
            settings.github_username = value;
        }
        if let Some(value) = input.github_connected_at {
            settings.github_connected_at = value;
        }
        if let Some(value) = input.github_last_validated_at {
            settings.github_last_validated_at = value;
        }
        if let Some(value) = input.announcements_enabled {
            settings.announcements_enabled = value;
        }
        if let Some(value) = input.announcement_volume {
            settings.announcement_volume = value;
        }
        if let Some(value) = input.announcement_voice {
            settings.announcement_voice = value;
        }
        if let Some(value) = input.announce_focus_events {
            settings.announce_focus_events = value;
        }
        if let Some(value) = input.announce_nudges {
            settings.announce_nudges = value;
        }
        if let Some(value) = input.announce_sync_results {
            settings.announce_sync_results = value;
        }
        if let Some(value) = input.announce_task_changes {
            settings.announce_task_changes = value;
        }
        if let Some(value) = input.voice_commands_enabled {
            settings.voice_commands_enabled = value;
        }
        if let Some(value) = input.voice_command_mode {
            settings.voice_command_mode = value;
        }
        if let Some(value) = input.voice_command_confirm_before_action {
            settings.voice_command_confirm_before_action = value;
        }
        if let Some(value) = input.voice_transcription_provider {
            settings.voice_transcription_provider = value;
        }
        if let Some(value) = input.voice_online_allowed {
            settings.voice_online_allowed = value;
        }
        if let Some(value) = input.voice_privacy_acknowledged {
            settings.voice_privacy_acknowledged = value;
        }
        if let Some(value) = input.voice_groq_model {
            settings.voice_groq_model = value;
        }
        if let Some(value) = input.voice_openrouter_model {
            settings.voice_openrouter_model = value;
        }
        if let Some(value) = input.report_ai_enabled {
            settings.report_ai_enabled = value;
        }
        if let Some(value) = input.report_ai_provider {
            settings.report_ai_provider = value;
        }
        if let Some(value) = input.report_ai_online_allowed {
            settings.report_ai_online_allowed = value;
        }
        if let Some(value) = input.report_ai_privacy_acknowledged {
            settings.report_ai_privacy_acknowledged = value;
        }
        if let Some(value) = input.report_ai_local_model_path {
            settings.report_ai_local_model_path = value;
        }
        if let Some(value) = input.report_ai_groq_model {
            settings.report_ai_groq_model = value;
        }
        if let Some(value) = input.report_ai_nvidia_model {
            settings.report_ai_nvidia_model = value;
        }
        if let Some(value) = input.embeddings_enabled {
            settings.embeddings_enabled = value;
        }
        if let Some(value) = input.embedding_provider {
            settings.embedding_provider = value;
        }
        if let Some(value) = input.embedding_local_endpoint {
            settings.embedding_local_endpoint = value;
        }
        if let Some(value) = input.embedding_online_endpoint {
            settings.embedding_online_endpoint = value;
        }
        if let Some(value) = input.embedding_model {
            settings.embedding_model = value;
        }
        if let Some(value) = input.embedding_online_allowed {
            settings.embedding_online_allowed = value;
        }
        if let Some(value) = input.embedding_privacy_acknowledged {
            settings.embedding_privacy_acknowledged = value;
        }
        if let Some(value) = input.sparc_force_addon_enabled {
            settings.sparc_force_addon_enabled = value;
        }
        if let Some(value) = input.onboarding_completed {
            settings.onboarding_completed = value;
        }
        if let Some(value) = input.onboarding_dismissed_welcome {
            settings.onboarding_dismissed_welcome = value;
        }
        if let Some(value) = input.onboarding_dismissed_checklist {
            settings.onboarding_dismissed_checklist = value;
        }
        if let Some(value) = input.onboarding_completed_steps {
            settings.onboarding_completed_steps = value;
        }
        if let Some(value) = input.onboarding_completed_at {
            settings.onboarding_completed_at = value;
        }

        self.upsert("profile.name", &settings.name).await?;
        self.upsert("profile.email", &settings.email).await?;
        self.upsert(
            "profile.use_gravatar_profile_image",
            if settings.use_gravatar_profile_image {
                "true"
            } else {
                "false"
            },
        )
        .await?;
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
        self.upsert(
            "capacity.daily_work_minutes",
            &settings.daily_work_minutes.to_string(),
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
        self.upsert(
            "github.connected",
            if settings.github_connected {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert("github.username", &settings.github_username)
            .await?;
        self.upsert("github.connected_at", &settings.github_connected_at)
            .await?;
        self.upsert(
            "github.last_validated_at",
            &settings.github_last_validated_at,
        )
        .await?;
        self.upsert(
            "voice.announcements_enabled",
            if settings.announcements_enabled {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "voice.announcement_volume",
            &settings.announcement_volume.to_string(),
        )
        .await?;
        self.upsert("voice.announcement_voice", &settings.announcement_voice)
            .await?;
        self.upsert(
            "voice.announce_focus_events",
            if settings.announce_focus_events {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "voice.announce_nudges",
            if settings.announce_nudges {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "voice.announce_sync_results",
            if settings.announce_sync_results {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "voice.announce_task_changes",
            if settings.announce_task_changes {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "voice.commands_enabled",
            if settings.voice_commands_enabled {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert("voice.command_mode", &settings.voice_command_mode)
            .await?;
        self.upsert(
            "voice.command_confirm_before_action",
            if settings.voice_command_confirm_before_action {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "voice.transcription_provider",
            &settings.voice_transcription_provider,
        )
        .await?;
        self.upsert(
            "voice.online_allowed",
            if settings.voice_online_allowed {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "voice.privacy_acknowledged",
            if settings.voice_privacy_acknowledged {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert("voice.groq_model", &settings.voice_groq_model)
            .await?;
        self.upsert("voice.openrouter_model", &settings.voice_openrouter_model)
            .await?;
        self.upsert(
            "report_ai.enabled",
            if settings.report_ai_enabled {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert("report_ai.provider", &settings.report_ai_provider)
            .await?;
        self.upsert(
            "report_ai.online_allowed",
            if settings.report_ai_online_allowed {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "report_ai.privacy_acknowledged",
            if settings.report_ai_privacy_acknowledged {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "report_ai.local_model_path",
            &settings.report_ai_local_model_path,
        )
        .await?;
        self.upsert("report_ai.groq_model", &settings.report_ai_groq_model)
            .await?;
        self.upsert("report_ai.nvidia_model", &settings.report_ai_nvidia_model)
            .await?;
        self.upsert(
            "embeddings.enabled",
            if settings.embeddings_enabled {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert("embeddings.provider", &settings.embedding_provider)
            .await?;
        self.upsert(
            "embeddings.local_endpoint",
            &settings.embedding_local_endpoint,
        )
        .await?;
        self.upsert(
            "embeddings.online_endpoint",
            &settings.embedding_online_endpoint,
        )
        .await?;
        self.upsert("embeddings.model", &settings.embedding_model)
            .await?;
        self.upsert(
            "embeddings.online_allowed",
            if settings.embedding_online_allowed {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "embeddings.privacy_acknowledged",
            if settings.embedding_privacy_acknowledged {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "sparc_force.addon_enabled",
            if settings.sparc_force_addon_enabled {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "onboarding.completed",
            if settings.onboarding_completed {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "onboarding.dismissed_welcome",
            if settings.onboarding_dismissed_welcome {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "onboarding.dismissed_checklist",
            if settings.onboarding_dismissed_checklist {
                "true"
            } else {
                "false"
            },
        )
        .await?;
        self.upsert(
            "onboarding.completed_steps",
            &serde_json::to_string(&settings.onboarding_completed_steps)
                .unwrap_or_else(|_| "[]".to_string()),
        )
        .await?;
        self.upsert("onboarding.completed_at", &settings.onboarding_completed_at)
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

fn sparc_force_connection_from_row(row: sqlx::sqlite::SqliteRow) -> SparcForceConnection {
    SparcForceConnection {
        id: row.get("id"),
        base_url: row.get("base_url"),
        status: row.get("status"),
        account_email: row.get("account_email"),
        remote_user_id: row.get("remote_user_id"),
        remote_username: row.get("remote_username"),
        masked_email: row.get("masked_email"),
        access_token_ref: row.get("access_token_ref"),
        refresh_token_ref: row.get("refresh_token_ref"),
        otp_session_ref: row.get("otp_session_ref"),
        access_expires_at: row.get("access_expires_at"),
        otp_expires_at: row.get("otp_expires_at"),
        connected_at: row.get("connected_at"),
        last_validated_at: row.get("last_validated_at"),
        last_synced_at: row.get("last_synced_at"),
        last_error: row.get("last_error"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn sparc_force_imported_item_from_row(
    row: sqlx::sqlite::SqliteRow,
    kind: &str,
    remote_user_id: Option<i64>,
    remote_username: Option<&str>,
) -> SparcForceImportedItem {
    let assigned_to = try_get_optional_i64(&row, "assigned_to");
    let raw_json: String = row.get("raw_json");
    SparcForceImportedItem {
        kind: kind.to_string(),
        external_id: row.get("external_id"),
        title: row.get("title"),
        status: row.get("status"),
        priority: row.get("priority"),
        external_kind: try_get_optional_string(&row, "external_kind"),
        source: try_get_optional_string(&row, "source"),
        assigned_to,
        ownership: sparc_force_ownership(kind, assigned_to, remote_user_id),
        created_by: sparc_force_created_by(&raw_json),
        created_ownership: sparc_force_created_ownership(
            &raw_json,
            remote_user_id,
            remote_username,
        ),
        project_external_id: try_get_optional_string(&row, "project_external_id"),
        case_external_id: try_get_optional_string(&row, "case_external_id"),
        updated_at_remote: row.get("updated_at_remote"),
        created_at_remote: try_get_optional_string(&row, "created_at_remote")
            .or_else(|| sparc_force_raw_string(&raw_json, SPARC_FORCE_CREATED_AT_KEYS)),
        imported_at: row.get("imported_at"),
        raw_json,
    }
}

fn sparc_force_record_matches(
    record: &SparcForceImportedItem,
    input: &ListSparcForceRecordsInput,
) -> bool {
    if let Some(kind) = input.kind.as_deref().map(normalize_filter_value) {
        if kind != "all" && normalize_filter_value(&record.kind) != kind {
            return false;
        }
    }

    if !matches_optional_filter(&record.status, input.statuses.as_deref()) {
        return false;
    }
    if !matches_optional_filter(&record.priority, input.priorities.as_deref()) {
        return false;
    }
    if !matches_optional_filter(&record.source, input.sources.as_deref()) {
        return false;
    }

    if let Some(project_external_id) = input.project_external_id.as_deref() {
        if record.project_external_id.as_deref() != Some(project_external_id) {
            return false;
        }
    }
    if let Some(case_external_id) = input.case_external_id.as_deref() {
        if record.case_external_id.as_deref() != Some(case_external_id) {
            return false;
        }
    }

    if let Some(relationship) = input.relationship.as_deref() {
        let relationship = normalize_filter_value(relationship);
        if relationship != "all" && sparc_force_relationship(record) != relationship {
            return false;
        }
    }

    if let Some(ownership) = input.ownership.as_deref() {
        let ownership = normalize_filter_value(ownership);
        if ownership != "all"
            && record
                .ownership
                .as_deref()
                .map(normalize_filter_value)
                .as_deref()
                != Some(ownership.as_str())
        {
            return false;
        }
    }

    if let Some(created_ownership) = input.created_ownership.as_deref() {
        let created_ownership = normalize_filter_value(created_ownership);
        if created_ownership != "all"
            && record
                .created_ownership
                .as_deref()
                .map(normalize_filter_value)
                .as_deref()
                != Some(created_ownership.as_str())
        {
            return false;
        }
    }

    if let Some(date_from) = input.date_from.as_deref().filter(|value| !value.is_empty()) {
        let value = record
            .updated_at_remote
            .as_deref()
            .unwrap_or(&record.imported_at);
        if value < date_from {
            return false;
        }
    }
    if let Some(date_to) = input.date_to.as_deref().filter(|value| !value.is_empty()) {
        let value = record
            .updated_at_remote
            .as_deref()
            .unwrap_or(&record.imported_at);
        if value > date_to {
            return false;
        }
    }

    if let Some(search) = input.search.as_deref().map(str::trim) {
        if !search.is_empty() {
            let assigned_to = record
                .assigned_to
                .map(|value| value.to_string())
                .unwrap_or_default();
            let haystack = [
                record.kind.as_str(),
                record.external_id.as_str(),
                record.title.as_str(),
                record.status.as_deref().unwrap_or(""),
                record.priority.as_deref().unwrap_or(""),
                record.external_kind.as_deref().unwrap_or(""),
                record.source.as_deref().unwrap_or(""),
                assigned_to.as_str(),
                record.ownership.as_deref().unwrap_or(""),
                record.created_by.as_deref().unwrap_or(""),
                record.created_ownership.as_deref().unwrap_or(""),
                record.project_external_id.as_deref().unwrap_or(""),
                record.case_external_id.as_deref().unwrap_or(""),
                record.raw_json.as_str(),
            ]
            .join(" ")
            .to_lowercase();
            if !haystack.contains(&search.to_lowercase()) {
                return false;
            }
        }
    }

    true
}

fn matches_optional_filter(value: &Option<String>, filters: Option<&[String]>) -> bool {
    let Some(filters) = filters else {
        return true;
    };
    let normalized_filters = filters
        .iter()
        .map(|filter| normalize_filter_value(filter))
        .filter(|filter| !filter.is_empty() && filter != "all")
        .collect::<Vec<_>>();
    if normalized_filters.is_empty() {
        return true;
    }

    value
        .as_deref()
        .map(normalize_filter_value)
        .map(|normalized| {
            normalized_filters
                .iter()
                .any(|filter| filter == &normalized)
        })
        .unwrap_or(false)
}

fn sort_sparc_force_records(
    records: &mut [SparcForceImportedItem],
    input: &ListSparcForceRecordsInput,
) {
    let sort_by = input
        .sort_by
        .as_deref()
        .map(normalize_filter_value)
        .unwrap_or_else(|| "updated".to_string());
    let descending = input
        .sort_direction
        .as_deref()
        .map(normalize_filter_value)
        .map(|direction| direction != "asc")
        .unwrap_or(true);

    records.sort_by(|left, right| {
        let ordering = match sort_by.as_str() {
            "title" => left.title.to_lowercase().cmp(&right.title.to_lowercase()),
            "status" => left
                .status
                .as_deref()
                .unwrap_or("")
                .cmp(right.status.as_deref().unwrap_or("")),
            "priority" => left
                .priority
                .as_deref()
                .unwrap_or("")
                .cmp(right.priority.as_deref().unwrap_or("")),
            "created" | "created_at" => left
                .created_at_remote
                .as_deref()
                .unwrap_or(&left.imported_at)
                .cmp(
                    right
                        .created_at_remote
                        .as_deref()
                        .unwrap_or(&right.imported_at),
                ),
            "imported" | "imported_at" => left.imported_at.cmp(&right.imported_at),
            _ => left
                .updated_at_remote
                .as_deref()
                .unwrap_or(&left.imported_at)
                .cmp(
                    right
                        .updated_at_remote
                        .as_deref()
                        .unwrap_or(&right.imported_at),
                ),
        };
        if descending {
            ordering.reverse()
        } else {
            ordering
        }
    });
}

fn sparc_force_record_counts(records: &[SparcForceImportedItem]) -> SparcForceRecordCounts {
    SparcForceRecordCounts {
        total: records.len() as i64,
        cases: records
            .iter()
            .filter(|record| record.kind == "case")
            .count() as i64,
        projects: records
            .iter()
            .filter(|record| record.kind == "project")
            .count() as i64,
        tasks: records
            .iter()
            .filter(|record| record.kind == "task")
            .count() as i64,
        statuses: count_optional_buckets(records.iter().map(|record| record.status.as_deref())),
        priorities: count_optional_buckets(records.iter().map(|record| record.priority.as_deref())),
        sources: count_optional_buckets(records.iter().map(|record| record.source.as_deref())),
        relationships: count_buckets(records.iter().filter_map(|record| {
            (record.kind == "task").then(|| relationship_label(&sparc_force_relationship(record)))
        })),
        ownerships: count_buckets(records.iter().filter_map(|record| {
            (record.kind == "case" || record.kind == "task")
                .then(|| record.ownership.as_deref().map(ownership_label))
                .flatten()
        })),
        created_ownerships: count_buckets(records.iter().filter_map(|record| {
            (record.kind == "case" || record.kind == "task")
                .then(|| {
                    record
                        .created_ownership
                        .as_deref()
                        .map(created_ownership_label)
                })
                .flatten()
        })),
    }
}

fn count_optional_buckets<'a>(
    values: impl Iterator<Item = Option<&'a str>>,
) -> Vec<SparcForceRecordBucket> {
    count_buckets(values.map(|value| value.unwrap_or("Unknown").to_string()))
}

fn count_buckets(values: impl Iterator<Item = String>) -> Vec<SparcForceRecordBucket> {
    let mut counts = HashMap::<String, i64>::new();
    for value in values {
        let label = value.trim();
        if label.is_empty() {
            continue;
        }
        *counts.entry(label.to_string()).or_default() += 1;
    }
    let mut buckets = counts
        .into_iter()
        .map(|(label, count)| SparcForceRecordBucket { label, count })
        .collect::<Vec<_>>();
    buckets.sort_by(|left, right| left.label.cmp(&right.label));
    buckets
}

fn sparc_force_relationship(record: &SparcForceImportedItem) -> String {
    if record
        .case_external_id
        .as_deref()
        .is_some_and(|value| !value.is_empty())
        || json_field_present(
            &record.raw_json,
            &[
                "case_ID",
                "caseId",
                "case_Number",
                "caseTitle",
                "case_Title",
            ],
        )
    {
        return "case_linked".to_string();
    }
    if record
        .project_external_id
        .as_deref()
        .is_some_and(|value| !value.is_empty())
        || json_field_present(
            &record.raw_json,
            &[
                "fk_Project_ID",
                "fkProjectId",
                "project_ID",
                "projectId",
                "project_Name",
            ],
        )
    {
        return "project_task".to_string();
    }
    "standalone".to_string()
}

fn json_field_present(raw_json: &str, keys: &[&str]) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw_json) else {
        return false;
    };
    keys.iter().any(|key| {
        value
            .get(*key)
            .and_then(|field| {
                field
                    .as_str()
                    .map(|text| !text.trim().is_empty())
                    .or_else(|| field.as_i64().map(|number| number > 0))
                    .or_else(|| field.as_bool())
            })
            .unwrap_or(false)
    })
}

fn relationship_label(value: &str) -> String {
    match value {
        "case_linked" => "Case linked".to_string(),
        "project_task" => "Project task".to_string(),
        "standalone" => "Standalone".to_string(),
        _ => humanize_filter_value(value),
    }
}

fn sparc_force_ownership(
    kind: &str,
    assigned_to: Option<i64>,
    remote_user_id: Option<i64>,
) -> Option<String> {
    if kind != "case" && kind != "task" {
        return None;
    }

    match assigned_to {
        None => Some("unassigned".to_string()),
        Some(assigned_to) if Some(assigned_to) == remote_user_id => Some("mine".to_string()),
        Some(_) => Some("other".to_string()),
    }
}

const SPARC_FORCE_CREATED_BY_ID_KEYS: &[&str] = &[
    "created_By",
    "createdBy",
    "created_By_ID",
    "createdById",
    "created_User_ID",
    "createdUserId",
    "created_By_User_ID",
    "createdByUserId",
];
const SPARC_FORCE_CREATED_BY_NAME_KEYS: &[&str] = &[
    "created_By_Name",
    "createdByName",
    "created_User_Name",
    "createdUserName",
    "created_By_Username",
    "createdByUsername",
    "created_By_Email",
    "createdByEmail",
];
const SPARC_FORCE_CREATED_AT_KEYS: &[&str] = &[
    "created_At",
    "createdAt",
    "created_Date",
    "createdDate",
    "created_On",
    "createdOn",
];

fn sparc_force_created_by(raw_json: &str) -> Option<String> {
    sparc_force_raw_string(raw_json, SPARC_FORCE_CREATED_BY_NAME_KEYS).or_else(|| {
        sparc_force_raw_i64(raw_json, SPARC_FORCE_CREATED_BY_ID_KEYS).map(|id| id.to_string())
    })
}

fn sparc_force_created_ownership(
    raw_json: &str,
    remote_user_id: Option<i64>,
    remote_username: Option<&str>,
) -> Option<String> {
    if remote_user_id
        .and_then(|id| {
            sparc_force_raw_i64(raw_json, SPARC_FORCE_CREATED_BY_ID_KEYS)
                .map(|created_by| created_by == id)
        })
        .unwrap_or(false)
    {
        return Some("created_by_me".to_string());
    }

    let created_by = sparc_force_raw_string(raw_json, SPARC_FORCE_CREATED_BY_NAME_KEYS)?;
    let normalized_created_by = normalize_person_value(&created_by);
    let Some(remote_username) = remote_username.map(normalize_person_value) else {
        return Some("created_by_other".to_string());
    };

    if !remote_username.is_empty()
        && (normalized_created_by == remote_username
            || normalized_created_by.contains(&remote_username)
            || remote_username.contains(&normalized_created_by))
    {
        Some("created_by_me".to_string())
    } else {
        Some("created_by_other".to_string())
    }
}

fn sparc_force_raw_string(raw_json: &str, keys: &[&str]) -> Option<String> {
    let value = serde_json::from_str::<serde_json::Value>(raw_json).ok()?;
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|field| {
            field
                .as_str()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
                .or_else(|| field.as_i64().map(|number| number.to_string()))
        })
    })
}

fn sparc_force_raw_i64(raw_json: &str, keys: &[&str]) -> Option<i64> {
    let value = serde_json::from_str::<serde_json::Value>(raw_json).ok()?;
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|field| {
            field.as_i64().or_else(|| {
                field
                    .as_str()
                    .and_then(|text| text.trim().parse::<i64>().ok())
            })
        })
    })
}

fn normalize_person_value(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace(|character: char| !character.is_ascii_alphanumeric(), "")
}

fn sparc_force_canonical_task_kind(source: &str) -> &'static str {
    match source {
        "project_task_user" | "project_task_case" | "project_task" => "project_task",
        "standalone_assigned" | "case_task" | "task" => "task",
        _ => "task",
    }
}

fn sparc_force_linked_task_external_id(external_source: &str, external_id: &str) -> String {
    format!(
        "{}:{external_id}",
        sparc_force_canonical_task_kind(external_source)
    )
}

fn ownership_label(value: &str) -> String {
    match value {
        "mine" => "Assigned to me".to_string(),
        "other" => "Assigned to others".to_string(),
        "unassigned" => "Unassigned".to_string(),
        _ => humanize_filter_value(value),
    }
}

fn created_ownership_label(value: &str) -> String {
    match value {
        "created_by_me" => "Created by me".to_string(),
        "created_by_other" => "Created by others".to_string(),
        _ => humanize_filter_value(value),
    }
}

fn normalize_filter_value(value: &str) -> String {
    value.trim().to_lowercase().replace([' ', '-'], "_")
}

fn humanize_filter_value(value: &str) -> String {
    value
        .split('_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn try_get_optional_string(row: &sqlx::sqlite::SqliteRow, column: &str) -> Option<String> {
    row.try_get(column).ok().flatten()
}

fn try_get_optional_i64(row: &sqlx::sqlite::SqliteRow, column: &str) -> Option<i64> {
    row.try_get(column).ok().flatten()
}

async fn count_table(
    pool: &SqlitePool,
    table: &str,
    connection_id: &str,
) -> Result<i64, sqlx::Error> {
    let sql = format!("SELECT COUNT(*) AS count FROM {table} WHERE connection_id = ?1");
    let row = sqlx::query(&sql)
        .bind(connection_id)
        .fetch_one(pool)
        .await?;
    Ok(row.get("count"))
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

fn calendar_source_from_row(row: sqlx::sqlite::SqliteRow) -> CalendarSource {
    CalendarSource {
        id: row.get("id"),
        provider: row.get("provider"),
        account_email: row.get("account_email"),
        account_name: row.get("account_name"),
        sync_status: row.get("sync_status"),
        last_synced_at: row.get("last_synced_at"),
        token_ref: row.get("token_ref"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn calendar_event_from_row(row: sqlx::sqlite::SqliteRow) -> CalendarEvent {
    CalendarEvent {
        id: row.get("id"),
        source_id: row.get("source_id"),
        external_id: row.get("external_id"),
        title: row.get("title"),
        description: row.get("description"),
        location: row.get("location"),
        starts_at: row.get("starts_at"),
        ends_at: row.get("ends_at"),
        timezone: row.get("timezone"),
        all_day: i64_to_bool(row.get("all_day")),
        busy_status: row.get("busy_status"),
        is_cancelled: i64_to_bool(row.get("is_cancelled")),
        project_id: row.get("project_id"),
        task_id: row.get("task_id"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        imported_at: row.get("imported_at"),
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
        estimated_minutes: row.get("estimated_minutes"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn daily_plan_from_row(row: sqlx::sqlite::SqliteRow) -> DailyPlan {
    DailyPlan {
        id: row.get("id"),
        date: row.get("date"),
        focus_goal_minutes: row.get("focus_goal_minutes"),
        current_task_id: row.get("current_task_id"),
        suggested_task_id: row.get("suggested_task_id"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn daily_plan_item_from_row(row: sqlx::sqlite::SqliteRow) -> DailyPlanItem {
    let status: String = row.get("status");
    DailyPlanItem {
        id: row.get("id"),
        daily_plan_id: row.get("daily_plan_id"),
        rank: row.get("rank"),
        title: row.get("title"),
        weekly_task_id: row.get("weekly_task_id"),
        planned_minutes: row.get("planned_minutes"),
        status: DailyPlanItemStatus::try_from(status).unwrap_or(DailyPlanItemStatus::Todo),
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
        "profile.use_gravatar_profile_image" => {
            settings.use_gravatar_profile_image = value == "true"
        }
        "profile.default_manager_name" => settings.default_manager_name = value,
        "git.author_email" => settings.git_author_email = value,
        "reports.default_template" => settings.default_report_template = value,
        "working_days" => {
            settings.working_days =
                serde_json::from_str(&value).unwrap_or_else(|_| Settings::default().working_days);
        }
        "capacity.daily_work_minutes" => {
            settings.daily_work_minutes = value
                .parse()
                .unwrap_or(Settings::default().daily_work_minutes);
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
        "github.connected" => settings.github_connected = value == "true",
        "github.username" => settings.github_username = value,
        "github.connected_at" => settings.github_connected_at = value,
        "github.last_validated_at" => settings.github_last_validated_at = value,
        "voice.announcements_enabled" => settings.announcements_enabled = value == "true",
        "voice.announcement_volume" => {
            settings.announcement_volume = value
                .parse()
                .unwrap_or(Settings::default().announcement_volume);
        }
        "voice.announcement_voice" => settings.announcement_voice = value,
        "voice.announce_focus_events" => settings.announce_focus_events = value == "true",
        "voice.announce_nudges" => settings.announce_nudges = value == "true",
        "voice.announce_sync_results" => settings.announce_sync_results = value == "true",
        "voice.announce_task_changes" => settings.announce_task_changes = value == "true",
        "voice.commands_enabled" => settings.voice_commands_enabled = value == "true",
        "voice.command_mode" => settings.voice_command_mode = value,
        "voice.command_confirm_before_action" => {
            settings.voice_command_confirm_before_action = value == "true";
        }
        "voice.transcription_provider" => settings.voice_transcription_provider = value,
        "voice.online_allowed" => settings.voice_online_allowed = value == "true",
        "voice.privacy_acknowledged" => settings.voice_privacy_acknowledged = value == "true",
        "voice.groq_model" => settings.voice_groq_model = value,
        "voice.openrouter_model" => settings.voice_openrouter_model = value,
        "report_ai.enabled" => settings.report_ai_enabled = value == "true",
        "report_ai.provider" => settings.report_ai_provider = value,
        "report_ai.online_allowed" => settings.report_ai_online_allowed = value == "true",
        "report_ai.privacy_acknowledged" => {
            settings.report_ai_privacy_acknowledged = value == "true";
        }
        "report_ai.local_model_path" => settings.report_ai_local_model_path = value,
        "report_ai.groq_model" => settings.report_ai_groq_model = value,
        "report_ai.nvidia_model" => settings.report_ai_nvidia_model = value,
        "embeddings.enabled" => settings.embeddings_enabled = value == "true",
        "embeddings.provider" => settings.embedding_provider = value,
        "embeddings.local_endpoint" => settings.embedding_local_endpoint = value,
        "embeddings.online_endpoint" => settings.embedding_online_endpoint = value,
        "embeddings.model" => settings.embedding_model = value,
        "embeddings.online_allowed" => settings.embedding_online_allowed = value == "true",
        "embeddings.privacy_acknowledged" => {
            settings.embedding_privacy_acknowledged = value == "true"
        }
        "sparc_force.addon_enabled" => settings.sparc_force_addon_enabled = value == "true",
        "onboarding.completed" => settings.onboarding_completed = value == "true",
        "onboarding.dismissed_welcome" => settings.onboarding_dismissed_welcome = value == "true",
        "onboarding.dismissed_checklist" => {
            settings.onboarding_dismissed_checklist = value == "true"
        }
        "onboarding.completed_steps" => {
            settings.onboarding_completed_steps = serde_json::from_str(&value).unwrap_or_default();
        }
        "onboarding.completed_at" => settings.onboarding_completed_at = value,
        _ => {}
    }
}

fn dates_between(from: &str, to: &str) -> Vec<String> {
    let Ok(mut current) = NaiveDate::parse_from_str(from, "%Y-%m-%d") else {
        return Vec::new();
    };
    let Ok(end) = NaiveDate::parse_from_str(to, "%Y-%m-%d") else {
        return Vec::new();
    };
    let mut dates = Vec::new();
    while current <= end {
        dates.push(current.format("%Y-%m-%d").to_string());
        current = current.succ_opt().unwrap_or(current);
        if dates.len() > 14 {
            break;
        }
    }
    dates
}

fn day_name_for_date(date: &str) -> String {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|date| match date.weekday().num_days_from_monday() {
            0 => "monday",
            1 => "tuesday",
            2 => "wednesday",
            3 => "thursday",
            4 => "friday",
            5 => "saturday",
            _ => "sunday",
        })
        .unwrap_or("monday")
        .to_string()
}

fn meeting_minutes_for_date(events: &[CalendarEvent], date: &str) -> i32 {
    events
        .iter()
        .filter(|event| {
            !event.is_cancelled
                && event.busy_status == "busy"
                && event.starts_at.get(0..10).unwrap_or("") == date
        })
        .map(|event| calendar_minutes_between(&event.starts_at, &event.ends_at))
        .sum()
}

fn calendar_minutes_between(starts_at: &str, ends_at: &str) -> i32 {
    let Ok(start) = chrono::DateTime::parse_from_rfc3339(starts_at) else {
        return 0;
    };
    let Ok(end) = chrono::DateTime::parse_from_rfc3339(ends_at) else {
        return 0;
    };
    ((end - start).num_minutes().max(0) as i32).min(24 * 60)
}

async fn manual_meeting_minutes_by_date(
    pool: &SqlitePool,
    from: &str,
    to: &str,
) -> Result<Vec<(String, i32)>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT date, COALESCE(SUM(duration_minutes), 0) AS minutes
        FROM manual_logs
        LEFT JOIN projects ON projects.id = manual_logs.project_id
        WHERE date >= ?1
          AND date <= ?2
          AND activity_type = 'Meeting'
          AND (manual_logs.project_id IS NULL OR projects.status = 'active')
        GROUP BY date
        "#,
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let date: String = row.get("date");
            let minutes: i64 = row.get("minutes");
            (date, minutes as i32)
        })
        .collect())
}

async fn actual_work_minutes(pool: &SqlitePool, from: &str, to: &str) -> Result<i32, sqlx::Error> {
    let focus_row = sqlx::query(
        r#"
        SELECT COALESCE(SUM(duration_minutes), 0) AS minutes
        FROM focus_sessions
        WHERE status = 'completed'
          AND substr(started_at, 1, 10) >= ?1
          AND substr(started_at, 1, 10) <= ?2
        "#,
    )
    .bind(from)
    .bind(to)
    .fetch_one(pool)
    .await?;
    let manual_row = sqlx::query(
        r#"
        SELECT COALESCE(SUM(manual_logs.duration_minutes), 0) AS minutes
        FROM manual_logs
        LEFT JOIN focus_sessions ON focus_sessions.manual_log_id = manual_logs.id
        LEFT JOIN projects ON projects.id = manual_logs.project_id
        WHERE manual_logs.date >= ?1
          AND manual_logs.date <= ?2
          AND manual_logs.activity_type != 'Meeting'
          AND focus_sessions.id IS NULL
          AND (manual_logs.project_id IS NULL OR projects.status = 'active')
        "#,
    )
    .bind(from)
    .bind(to)
    .fetch_one(pool)
    .await?;
    let focus_minutes: i64 = focus_row.get("minutes");
    let manual_minutes: i64 = manual_row.get("minutes");

    Ok((focus_minutes + manual_minutes) as i32)
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
        classification: row.get("classification"),
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
        classification: row.get("classification"),
        status: row.get("status"),
        last_scanned_at: row.get("last_scanned_at"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn git_ref_from_row(row: sqlx::sqlite::SqliteRow) -> GitRef {
    let kind: String = row.get("kind");
    GitRef {
        project_id: row.get("project_id"),
        name: row.get("name"),
        full_name: row.get("full_name"),
        kind: GitRefKind::try_from(kind).unwrap_or(GitRefKind::Local),
        is_current: i64_to_bool(row.get("is_current")),
        is_head: i64_to_bool(row.get("is_head")),
        last_seen_commit: row.get("last_seen_commit"),
        last_scanned_at: row.get("last_scanned_at"),
    }
}

fn git_worktree_from_row(row: sqlx::sqlite::SqliteRow) -> GitWorktree {
    let is_clean: Option<i64> = row.get("is_clean");
    GitWorktree {
        project_id: row.get("project_id"),
        path: row.get("path"),
        branch: row.get("branch"),
        head_commit: row.get("head_commit"),
        is_clean: is_clean.map(i64_to_bool),
        is_prunable: i64_to_bool(row.get("is_prunable")),
        is_locked: i64_to_bool(row.get("is_locked")),
        last_scanned_at: row.get("last_scanned_at"),
    }
}

fn commit_file_change_from_row(row: sqlx::sqlite::SqliteRow) -> CommitFileChange {
    CommitFileChange {
        project_id: row.get("project_id"),
        commit_hash: row.get("commit_hash"),
        path: row.get("path"),
        old_path: row.get("old_path"),
        change_kind: row.get("change_kind"),
        additions: row.get("additions"),
        deletions: row.get("deletions"),
        is_binary: i64_to_bool(row.get("is_binary")),
        language: row.get("language"),
        top_level_dir: row.get("top_level_dir"),
        is_test: i64_to_bool(row.get("is_test")),
        is_docs: i64_to_bool(row.get("is_docs")),
        is_config: i64_to_bool(row.get("is_config")),
        is_migration: i64_to_bool(row.get("is_migration")),
        is_generated: i64_to_bool(row.get("is_generated")),
        collected_at: row.get("collected_at"),
    }
}

fn commit_diff_snippet_from_row(row: sqlx::sqlite::SqliteRow) -> CommitDiffSnippet {
    CommitDiffSnippet {
        project_id: row.get("project_id"),
        commit_hash: row.get("commit_hash"),
        path: row.get("path"),
        snippet: row.get("snippet"),
        collected_at: row.get("collected_at"),
    }
}

fn project_git_sync_state_from_row(row: sqlx::sqlite::SqliteRow) -> ProjectGitSyncState {
    ProjectGitSyncState {
        project_id: row.get("project_id"),
        range_from: row.get("range_from"),
        range_to: row.get("range_to"),
        author_email: row.get("author_email"),
        ref_fingerprint: row.get("ref_fingerprint"),
        evidence_version: row.get("evidence_version"),
        last_scanned_at: row.get("last_scanned_at"),
        last_full_scanned_at: row.get("last_full_scanned_at"),
        last_error: row.get("last_error"),
    }
}

fn project_git_sync_cursor_from_row(row: sqlx::sqlite::SqliteRow) -> ProjectGitSyncCursor {
    ProjectGitSyncCursor {
        project_id: row.get("project_id"),
        source_kind: row.get("source_kind"),
        source_name: row.get("source_name"),
        previous_head_commit: row.get("previous_head_commit"),
        latest_head_commit: row.get("latest_head_commit"),
        last_synced_at: row.get("last_synced_at"),
        last_full_synced_at: row.get("last_full_synced_at"),
        last_error: row.get("last_error"),
        is_stale: i64_to_bool(row.get("is_stale")),
    }
}

fn activity_embedding_from_row(row: sqlx::sqlite::SqliteRow) -> ActivityEmbeddingRecord {
    ActivityEmbeddingRecord {
        id: row.get("id"),
        source_type: row.get("source_type"),
        source_id: row.get("source_id"),
        evidence_kind: row.get("evidence_kind"),
        model: row.get("model"),
        provider: row.get("provider"),
        text_hash: row.get("text_hash"),
        vector_path: row.get("vector_path"),
        dimensions: row.get("dimensions"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn background_job_from_row(row: sqlx::sqlite::SqliteRow) -> BackgroundJobRecord {
    BackgroundJobRecord {
        id: row.get("id"),
        kind: row.get("kind"),
        payload_json: row.get("payload_json"),
        status: row.get("status"),
        attempts: row.get("attempts"),
        last_error: row.get("last_error"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

async fn refs_for_commit(
    pool: &SqlitePool,
    project_id: &str,
    commit_hash: &str,
) -> Result<Vec<CommitRefSummary>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT commit_refs.ref_name,
               commit_refs.ref_kind,
               COALESCE(git_refs.is_current, 0) AS is_current
        FROM commit_refs
        LEFT JOIN git_refs
          ON git_refs.project_id = commit_refs.project_id
         AND git_refs.name = commit_refs.ref_name
         AND git_refs.kind = commit_refs.ref_kind
        WHERE commit_refs.project_id = ?1
          AND commit_refs.commit_hash = ?2
        ORDER BY COALESCE(git_refs.is_current, 0) DESC,
                 commit_refs.ref_kind ASC,
                 commit_refs.ref_name ASC
        "#,
    )
    .bind(project_id)
    .bind(commit_hash)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let kind: String = row.get("ref_kind");
            CommitRefSummary {
                name: row.get("ref_name"),
                kind: GitRefKind::try_from(kind).unwrap_or(GitRefKind::Local),
                is_current: i64_to_bool(row.get("is_current")),
            }
        })
        .collect())
}

async fn commit_matches_git_filters(
    pool: &SqlitePool,
    git_refs: &Option<Vec<GitRefFilter>>,
    worktree_paths: &Option<Vec<String>>,
    project_id: &str,
    commit_hash: &str,
    refs: &[CommitRefSummary],
) -> Result<bool, sqlx::Error> {
    let has_ref_filters = git_refs
        .as_ref()
        .map(|filters| filters.iter().any(|filter| !filter.name.trim().is_empty()))
        .unwrap_or(false);
    let has_worktree_filters = worktree_paths
        .as_ref()
        .map(|paths| paths.iter().any(|path| !path.trim().is_empty()))
        .unwrap_or(false);

    if !has_ref_filters && !has_worktree_filters {
        return Ok(true);
    }

    if has_ref_filters {
        let matches_ref = git_refs
            .as_ref()
            .into_iter()
            .flat_map(|filters| filters.iter())
            .filter(|filter| {
                filter
                    .project_id
                    .as_ref()
                    .map(|filter_project_id| filter_project_id == project_id)
                    .unwrap_or(true)
            })
            .any(|filter| {
                refs.iter().any(|commit_ref| {
                    commit_ref.name == filter.name && commit_ref.kind == filter.kind
                })
            });
        if matches_ref {
            return Ok(true);
        }
    }

    if has_worktree_filters {
        let paths = worktree_paths
            .as_ref()
            .into_iter()
            .flat_map(|paths| paths.iter())
            .filter(|path| !path.trim().is_empty())
            .collect::<Vec<_>>();

        for path in paths {
            let row = sqlx::query(
                r#"
                SELECT 1
                FROM commit_worktree_refs
                WHERE project_id = ?1
                  AND commit_hash = ?2
                  AND worktree_path = ?3
                LIMIT 1
                "#,
            )
            .bind(project_id)
            .bind(commit_hash)
            .bind(path.trim())
            .fetch_optional(pool)
            .await?;
            if row.is_some() {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

async fn worktree_for_commit(
    pool: &SqlitePool,
    project_id: &str,
    commit_hash: &str,
) -> Result<Option<CommitWorktreeSummary>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT git_worktrees.path,
               COALESCE(commit_worktree_refs.branch, git_worktrees.branch) AS branch,
               git_worktrees.head_commit,
               git_worktrees.is_clean
        FROM commit_worktree_refs
        LEFT JOIN git_worktrees
          ON git_worktrees.project_id = commit_worktree_refs.project_id
         AND git_worktrees.path = commit_worktree_refs.worktree_path
        WHERE commit_worktree_refs.project_id = ?1
          AND commit_worktree_refs.commit_hash = ?2
        ORDER BY git_worktrees.branch IS NULL ASC, git_worktrees.path ASC
        LIMIT 1
        "#,
    )
    .bind(project_id)
    .bind(commit_hash)
    .fetch_optional(pool)
    .await?;

    let row = if row.is_some() {
        row
    } else {
        sqlx::query(
            r#"
        SELECT path, branch, head_commit, is_clean
        FROM git_worktrees
        WHERE project_id = ?1
          AND head_commit = ?2
        ORDER BY branch IS NULL ASC, path ASC
        LIMIT 1
        "#,
        )
        .bind(project_id)
        .bind(commit_hash)
        .fetch_optional(pool)
        .await?
    };

    Ok(row.map(|row| {
        let is_clean: Option<i64> = row.get("is_clean");
        CommitWorktreeSummary {
            path: row.get("path"),
            branch: row.get("branch"),
            head_commit: row.get("head_commit"),
            is_clean: is_clean.map(i64_to_bool),
        }
    }))
}

async fn activity_item_for_source(
    pool: &SqlitePool,
    source_type: &str,
    source_id: &str,
) -> Result<Option<ActivityItem>, sqlx::Error> {
    if source_type != "commit" {
        return Ok(None);
    }

    let row = sqlx::query(
        r#"
        SELECT commits.id,
               commits.project_id,
               projects.name AS project_name,
               projects.workspace_id AS workspace_id,
               workspaces.name AS workspace_name,
               projects.workspace_relative_path AS workspace_relative_path,
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
        LEFT JOIN workspaces ON workspaces.id = projects.workspace_id
        WHERE commits.id = ?1
        LIMIT 1
        "#,
    )
    .bind(source_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let project_id: String = row.get("project_id");
    let commit_hash: String = row.get("commit_hash");
    let refs = refs_for_commit(pool, &project_id, &commit_hash).await?;
    let worktree = worktree_for_commit(pool, &project_id, &commit_hash).await?;

    Ok(Some(ActivityItem {
        id: row.get("id"),
        project_id: Some(project_id),
        project_name: row.get("project_name"),
        workspace_id: row.get("workspace_id"),
        workspace_name: row.get("workspace_name"),
        workspace_relative_path: row.get("workspace_relative_path"),
        activity_type: "commit".to_string(),
        summary: row.get("message"),
        occurred_at: row.get("committed_at"),
        included_in_report: i64_to_bool(row.get("included_in_report")),
        commit_hash: Some(commit_hash),
        author_name: row.get("author_name"),
        author_email: row.get("author_email"),
        branch: row.get("branch"),
        files_changed: row.get("files_changed"),
        insertions: row.get("insertions"),
        deletions: row.get("deletions"),
        refs,
        worktree,
    }))
}

async fn group_matches_git_filters(
    pool: &SqlitePool,
    git_refs: &Option<Vec<GitRefFilter>>,
    worktree_paths: &Option<Vec<String>>,
    items: &[ActivityGroupItem],
) -> Result<bool, sqlx::Error> {
    let has_ref_filters = git_refs
        .as_ref()
        .map(|filters| filters.iter().any(|filter| !filter.name.trim().is_empty()))
        .unwrap_or(false);
    let has_worktree_filters = worktree_paths
        .as_ref()
        .map(|paths| paths.iter().any(|path| !path.trim().is_empty()))
        .unwrap_or(false);

    if !has_ref_filters && !has_worktree_filters {
        return Ok(true);
    }

    for item in items {
        if let Some(activity) = &item.activity {
            if let (Some(project_id), Some(commit_hash)) = (
                activity.project_id.as_deref(),
                activity.commit_hash.as_deref(),
            ) {
                if commit_matches_git_filters(
                    pool,
                    git_refs,
                    worktree_paths,
                    project_id,
                    commit_hash,
                    &activity.refs,
                )
                .await?
                {
                    return Ok(true);
                }
            }
        }
    }

    Ok(false)
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

fn normalize_classification(value: Option<String>) -> String {
    match value.as_deref().map(str::trim) {
        Some("work") => "work".to_string(),
        Some("personal") => "personal".to_string(),
        _ => "unclassified".to_string(),
    }
}

fn project_filter_matches(project_ids: &Option<Vec<String>>, project_id: &str) -> bool {
    project_ids
        .as_ref()
        .map(|ids| ids.iter().any(|id| id == project_id))
        .unwrap_or(true)
}

fn workspace_filter_matches(workspace_ids: &Option<Vec<String>>, workspace_id: Option<&str>) -> bool {
    workspace_ids
        .as_ref()
        .map(|ids| {
            workspace_id
                .map(|workspace_id| ids.iter().any(|id| id == workspace_id))
                .unwrap_or(false)
        })
        .unwrap_or(true)
}

fn group_matches_project_filter(
    project_ids: &Option<Vec<String>>,
    group_project_id: Option<&str>,
    projects: &[ActivityGroupProject],
) -> bool {
    let Some(ids) = project_ids.as_ref() else {
        return true;
    };
    group_project_id
        .map(|project_id| ids.iter().any(|id| id == project_id))
        .unwrap_or(false)
        || projects
            .iter()
            .any(|project| ids.iter().any(|id| id == &project.project_id))
}

fn group_matches_workspace_filter(
    workspace_ids: &Option<Vec<String>>,
    group_workspace_id: Option<&str>,
    items: &[ActivityGroupItem],
) -> bool {
    let Some(ids) = workspace_ids.as_ref() else {
        return true;
    };
    group_workspace_id
        .map(|workspace_id| ids.iter().any(|id| id == workspace_id))
        .unwrap_or(false)
        || items.iter().any(|item| {
            item.activity
                .as_ref()
                .and_then(|activity| activity.workspace_id.as_deref())
                .map(|workspace_id| ids.iter().any(|id| id == workspace_id))
                .unwrap_or(false)
        })
}

fn group_projects(items: &[ActivityGroupItem]) -> Vec<ActivityGroupProject> {
    let mut projects = Vec::new();
    for activity in items.iter().filter_map(|item| item.activity.as_ref()) {
        let Some(project_id) = &activity.project_id else {
            continue;
        };
        if projects
            .iter()
            .any(|project: &ActivityGroupProject| project.project_id == *project_id)
        {
            continue;
        }
        projects.push(ActivityGroupProject {
            project_id: project_id.clone(),
            project_name: activity
                .project_name
                .clone()
                .unwrap_or_else(|| "Unknown project".to_string()),
        });
    }
    projects.sort_by(|left, right| left.project_name.cmp(&right.project_name));
    projects
}

fn classification_filter_matches(
    classification_filter: &Option<String>,
    project_classification: Option<&str>,
) -> bool {
    classification_filter
        .as_deref()
        .map(|filter| project_classification == Some(filter))
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

fn group_memory_terms(group: &ActivityGroup) -> (String, Option<String>) {
    let mut terms = Vec::new();
    let mut branch_phrases = Vec::new();
    let mut issue_tokens = Vec::new();
    let mut source_titles = Vec::new();
    let mut commit_subjects = Vec::new();
    if let Some(project_name) = &group.project_name {
        terms.push(project_name.clone());
    }
    terms.push(group.title.clone());
    if let Some(summary) = &group.summary {
        terms.push(summary.clone());
    }
    if let Some(report_summary) = &group.report_summary {
        terms.push(report_summary.clone());
    }
    for item in &group.items {
        terms.push(item.summary_snapshot.clone());
        commit_subjects.push(item.summary_snapshot.clone());
        issue_tokens.extend(memory_issue_tokens(&item.summary_snapshot));
        if let Some(activity) = &item.activity {
            if let Some(branch) = &activity.branch {
                terms.push(branch.clone());
                branch_phrases.push(memory_branch_phrase(branch));
                issue_tokens.extend(memory_issue_tokens(branch));
            }
            if let Some(project_name) = &activity.project_name {
                terms.push(project_name.clone());
            }
            if activity.activity_type != "commit" {
                source_titles.push(activity.summary.clone());
            }
        }
    }
    let json = serde_json::json!({
        "projectFamily": group.project_name,
        "branchPhrases": memory_normalize(branch_phrases),
        "issueTokens": memory_normalize(issue_tokens),
        "moduleTerms": Vec::<String>::new(),
        "pathTerms": Vec::<String>::new(),
        "diffTerms": Vec::<String>::new(),
        "sourceTitles": memory_normalize(source_titles),
        "commitSubjects": memory_normalize(commit_subjects),
        "changeTerms": Vec::<String>::new(),
    });
    (terms.join(" "), Some(json.to_string()))
}

fn memory_branch_phrase(branch: &str) -> String {
    branch
        .rsplit('/')
        .next()
        .unwrap_or(branch)
        .replace(['_', '-'], " ")
        .trim()
        .to_lowercase()
}

fn memory_issue_tokens(text: &str) -> Vec<String> {
    text.split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'))
        .filter_map(|part| {
            let lower = part.to_lowercase();
            let has_digit = lower.chars().any(|ch| ch.is_ascii_digit());
            let has_alpha = lower.chars().any(|ch| ch.is_ascii_alphabetic());
            (has_digit && has_alpha && lower.len() >= 3).then_some(lower)
        })
        .collect()
}

fn memory_normalize(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    values
        .into_iter()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert(value.clone()))
        .collect()
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

fn is_full_commit_hash(value: &str) -> bool {
    value.len() == 40 && value.chars().all(|character| character.is_ascii_hexdigit())
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

    async fn connected_sparc_force_repository<'a>(
        pool: &'a SqlitePool,
    ) -> SparcForceConnectionRepository<'a> {
        let repository = SparcForceConnectionRepository::new(pool);
        let mut connection = repository
            .new_connection(
                "https://sparc-force.example".to_string(),
                "jane.engineer@example.com".to_string(),
            )
            .await;
        connection.status = "connected".to_string();
        connection.remote_user_id = Some(12);
        repository.save(&connection).await.expect("save connection");
        repository
    }

    fn sparc_force_test_task(
        external_id: &str,
        title: &str,
        case_external_id: Option<&str>,
        project_external_id: Option<&str>,
    ) -> SparcForceCacheRecord {
        SparcForceCacheRecord {
            external_id: external_id.to_string(),
            title: title.to_string(),
            status: Some("Open".to_string()),
            priority: Some("Normal".to_string()),
            project_external_id: project_external_id.map(str::to_string),
            case_external_id: case_external_id.map(str::to_string),
            assigned_to: Some(12),
            updated_at_remote: Some("2026-05-26T10:00:00Z".to_string()),
            created_at_remote: Some("2026-05-24T10:00:00Z".to_string()),
            raw_json: format!(r#"{{"task_ID":{external_id},"task_Name":"{title}"}}"#),
        }
    }

    async fn create_project(pool: &SqlitePool) -> Project {
        ProjectRepository::new(pool)
            .create(CreateProjectInput {
                name: "Sparc Force API".to_string(),
                description: None,
                repo_path: Some("C:\\repo\\sparc-force-api".to_string()),
                github_url: Some("https://github.com/company/api".to_string()),
                project_type: Some("Company".to_string()),
                classification: None,
            })
            .await
            .expect("create project")
    }

    fn test_file_change(project_id: &str, commit_hash: &str, path: &str) -> CommitFileChange {
        CommitFileChange {
            project_id: project_id.to_string(),
            commit_hash: commit_hash.to_string(),
            path: path.to_string(),
            old_path: None,
            change_kind: "modified".to_string(),
            additions: 3,
            deletions: 1,
            is_binary: false,
            language: Some("rust".to_string()),
            top_level_dir: Some("src".to_string()),
            is_test: false,
            is_docs: false,
            is_config: false,
            is_migration: false,
            is_generated: false,
            collected_at: "2026-05-28T12:00:00Z".to_string(),
        }
    }

    fn test_commit(project_id: &str, commit_hash: &str, message: &str) -> Commit {
        Commit {
            id: format!("commit_{project_id}_{commit_hash}"),
            project_id: project_id.to_string(),
            commit_hash: commit_hash.to_string(),
            message: message.to_string(),
            author_name: Some("Tester".to_string()),
            author_email: Some("tester@example.com".to_string()),
            branch: Some("main".to_string()),
            committed_at: "2026-05-28T12:00:00Z".to_string(),
            files_changed: Some(1),
            insertions: Some(3),
            deletions: Some(1),
            included_in_report: true,
        }
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
    async fn git_sync_state_round_trips_ref_fingerprint() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let repository = GitMetadataRepository::new(&pool);

        repository
            .upsert_sync_state(&ProjectGitSyncState {
                project_id: project.id.clone(),
                range_from: Some("2026-05-25".to_string()),
                range_to: Some("2026-05-29".to_string()),
                author_email: Some("tester@example.com".to_string()),
                ref_fingerprint: "refs-a".to_string(),
                evidence_version: "git-evidence-v2".to_string(),
                last_scanned_at: "2026-05-28T12:00:00Z".to_string(),
                last_full_scanned_at: None,
                last_error: None,
            })
            .await
            .expect("upsert sync state");

        let state = repository
            .get_sync_state(
                &project.id,
                Some("2026-05-25"),
                Some("2026-05-29"),
                Some("tester@example.com"),
            )
            .await
            .expect("get sync state")
            .expect("sync state exists");

        assert_eq!(state.ref_fingerprint, "refs-a");
        assert_eq!(state.evidence_version, "git-evidence-v2");
    }

    #[tokio::test]
    async fn per_commit_evidence_replacement_keeps_unrelated_rows() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let repository = GitMetadataRepository::new(&pool);
        let first = "1111111111111111111111111111111111111111".to_string();
        let second = "2222222222222222222222222222222222222222".to_string();

        repository
            .replace_commit_file_changes(
                &project.id,
                &[
                    test_file_change(&project.id, &first, "src/old.rs"),
                    test_file_change(&project.id, &second, "src/keep.rs"),
                ],
            )
            .await
            .expect("seed evidence");

        repository
            .replace_commit_file_changes_for_hashes(
                &project.id,
                std::slice::from_ref(&first),
                &[test_file_change(&project.id, &first, "src/new.rs")],
            )
            .await
            .expect("replace one commit evidence");

        let first_changes = repository
            .list_file_changes_for_commits(&project.id, std::slice::from_ref(&first))
            .await
            .expect("list first changes");
        let second_changes = repository
            .list_file_changes_for_commits(&project.id, std::slice::from_ref(&second))
            .await
            .expect("list second changes");

        assert_eq!(first_changes.len(), 1);
        assert_eq!(first_changes[0].path, "src/new.rs");
        assert_eq!(second_changes.len(), 1);
        assert_eq!(second_changes[0].path, "src/keep.rs");
    }

    #[tokio::test]
    async fn bulk_commit_upsert_preserves_report_inclusion_and_existing_stats() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let repository = CommitRepository::new(&pool);
        let hash = "3333333333333333333333333333333333333333";
        let mut commit = test_commit(&project.id, hash, "feat: original");

        repository
            .upsert_many(std::slice::from_ref(&commit))
            .await
            .expect("insert commit");
        sqlx::query(
            "UPDATE commits SET included_in_report = 0 WHERE project_id = ?1 AND commit_hash = ?2",
        )
        .bind(&project.id)
        .bind(hash)
        .execute(&pool)
        .await
        .expect("mark excluded");

        commit.message = "feat: updated".to_string();
        commit.files_changed = None;
        commit.insertions = None;
        commit.deletions = None;
        repository
            .upsert_many(std::slice::from_ref(&commit))
            .await
            .expect("update commit");

        let row = sqlx::query(
            "SELECT message, files_changed, insertions, deletions, included_in_report FROM commits WHERE project_id = ?1 AND commit_hash = ?2",
        )
        .bind(&project.id)
        .bind(hash)
        .fetch_one(&pool)
        .await
        .expect("fetch commit");

        assert_eq!(row.get::<String, _>("message"), "feat: updated");
        assert_eq!(row.get::<i64, _>("files_changed"), 1);
        assert_eq!(row.get::<i64, _>("insertions"), 3);
        assert_eq!(row.get::<i64, _>("deletions"), 1);
        assert_eq!(row.get::<i64, _>("included_in_report"), 0);
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
                classification: None,
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
                    classification: None,
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
    async fn sparc_force_case_ownership_filters_and_counts_work() {
        let pool = test_pool().await;
        let repository = SparcForceConnectionRepository::new(&pool);
        let mut connection = repository
            .new_connection(
                "https://sparc-force.example".to_string(),
                "jane.engineer@example.com".to_string(),
            )
            .await;
        connection.status = "connected".to_string();
        connection.remote_user_id = Some(12);
        repository.save(&connection).await.expect("save connection");

        let cases = [
            ("101", "Mine", Some(12)),
            ("102", "Other", Some(99)),
            ("103", "Unassigned", None),
        ];
        for (external_id, title, assigned_to) in cases {
            repository
                .upsert_case(
                    &connection.id,
                    &SparcForceCacheRecord {
                        external_id: external_id.to_string(),
                        title: title.to_string(),
                        status: Some("Open".to_string()),
                        priority: Some("High".to_string()),
                        project_external_id: None,
                        case_external_id: None,
                        assigned_to,
                        updated_at_remote: Some("2026-05-26T10:00:00+02:00".to_string()),
                        created_at_remote: Some("2026-05-24T10:00:00+02:00".to_string()),
                        raw_json: format!(r#"{{"case_ID":{external_id},"title":"{title}"}}"#),
                    },
                )
                .await
                .expect("upsert case");
        }

        let mine = repository
            .list_records(ListSparcForceRecordsInput {
                kind: Some("case".to_string()),
                ownership: Some("mine".to_string()),
                ..Default::default()
            })
            .await
            .expect("list mine cases");
        assert_eq!(mine.total, 1);
        assert_eq!(mine.records[0].external_id, "101");
        assert_eq!(mine.records[0].assigned_to, Some(12));
        assert_eq!(mine.records[0].ownership.as_deref(), Some("mine"));

        let other = repository
            .list_records(ListSparcForceRecordsInput {
                kind: Some("case".to_string()),
                ownership: Some("other".to_string()),
                ..Default::default()
            })
            .await
            .expect("list other cases");
        assert_eq!(other.total, 1);
        assert_eq!(other.records[0].external_id, "102");

        let unassigned = repository
            .list_records(ListSparcForceRecordsInput {
                kind: Some("case".to_string()),
                ownership: Some("unassigned".to_string()),
                ..Default::default()
            })
            .await
            .expect("list unassigned cases");
        assert_eq!(unassigned.total, 1);
        assert_eq!(unassigned.records[0].external_id, "103");

        let all_cases = repository
            .list_records(ListSparcForceRecordsInput {
                kind: Some("case".to_string()),
                ..Default::default()
            })
            .await
            .expect("list all cases");
        let ownership_counts = all_cases
            .counts
            .ownerships
            .iter()
            .map(|bucket| (bucket.label.as_str(), bucket.count))
            .collect::<HashMap<_, _>>();
        assert_eq!(ownership_counts.get("Assigned to me"), Some(&1));
        assert_eq!(ownership_counts.get("Assigned to others"), Some(&1));
        assert_eq!(ownership_counts.get("Unassigned"), Some(&1));
    }

    #[tokio::test]
    async fn sparc_force_project_task_sources_share_one_cached_record() {
        let pool = test_pool().await;
        let repository = connected_sparc_force_repository(&pool).await;
        let connection = repository.get().await.expect("get connection").unwrap();

        repository
            .upsert_task(
                &connection.id,
                "project_task_user",
                &sparc_force_test_task("301", "User scoped", None, Some("44")),
            )
            .await
            .expect("upsert user project task");
        repository
            .upsert_task(
                &connection.id,
                "project_task_case",
                &sparc_force_test_task("301", "Case scoped", Some("88"), Some("44")),
            )
            .await
            .expect("upsert case project task");

        let result = repository
            .list_records(ListSparcForceRecordsInput {
                kind: Some("task".to_string()),
                ..Default::default()
            })
            .await
            .expect("list tasks");

        assert_eq!(result.total, 1);
        assert_eq!(
            result.records[0].external_kind.as_deref(),
            Some("project_task")
        );
        assert_eq!(result.records[0].external_id, "301");
        assert_eq!(
            result.records[0].source.as_deref(),
            Some("project_task_case")
        );
        assert_eq!(result.records[0].case_external_id.as_deref(), Some("88"));
    }

    #[tokio::test]
    async fn sparc_force_standalone_task_sources_share_one_cached_record() {
        let pool = test_pool().await;
        let repository = connected_sparc_force_repository(&pool).await;
        let connection = repository.get().await.expect("get connection").unwrap();

        repository
            .upsert_task(
                &connection.id,
                "standalone_assigned",
                &sparc_force_test_task("401", "Assigned task", None, None),
            )
            .await
            .expect("upsert assigned task");
        repository
            .upsert_task(
                &connection.id,
                "case_task",
                &sparc_force_test_task("401", "Case task", Some("91"), None),
            )
            .await
            .expect("upsert case task");

        let result = repository
            .list_records(ListSparcForceRecordsInput {
                kind: Some("task".to_string()),
                ..Default::default()
            })
            .await
            .expect("list tasks");

        assert_eq!(result.total, 1);
        assert_eq!(result.records[0].external_kind.as_deref(), Some("task"));
        assert_eq!(result.records[0].source.as_deref(), Some("case_task"));
        assert_eq!(result.records[0].case_external_id.as_deref(), Some("91"));
    }

    #[tokio::test]
    async fn sparc_force_task_and_project_task_ids_remain_distinct() {
        let pool = test_pool().await;
        let repository = connected_sparc_force_repository(&pool).await;
        let connection = repository.get().await.expect("get connection").unwrap();

        repository
            .upsert_task(
                &connection.id,
                "standalone_assigned",
                &sparc_force_test_task("501", "Standalone", None, None),
            )
            .await
            .expect("upsert standalone task");
        repository
            .upsert_task(
                &connection.id,
                "project_task_user",
                &sparc_force_test_task("501", "Project task", None, Some("12")),
            )
            .await
            .expect("upsert project task");

        let result = repository
            .list_records(ListSparcForceRecordsInput {
                kind: Some("task".to_string()),
                ..Default::default()
            })
            .await
            .expect("list tasks");

        let kinds = result
            .records
            .iter()
            .map(|record| record.external_kind.as_deref().unwrap_or(""))
            .collect::<Vec<_>>();
        assert_eq!(result.total, 2);
        assert!(kinds.contains(&"task"));
        assert!(kinds.contains(&"project_task"));
    }

    #[tokio::test]
    async fn sparc_force_migration_merges_duplicate_task_rows_and_links() {
        let pool = test_pool().await;
        let repository = connected_sparc_force_repository(&pool).await;
        let connection = repository.get().await.expect("get connection").unwrap();
        let weekly_tasks = WeeklyTaskRepository::new(&pool);

        sqlx::query("DROP INDEX IF EXISTS idx_sparc_force_tasks_canonical")
            .execute(&pool)
            .await
            .expect("drop canonical index");
        sqlx::query(
            r#"
            INSERT INTO sparc_force_tasks (
              connection_id, source, external_kind, external_id, title, status, priority, assigned_to,
              project_external_id, case_external_id, updated_at_remote, raw_json, imported_at
            )
            VALUES
              (?1, 'project_task_user', 'project_task', '601', 'Older', 'Open', 'Normal', NULL, '31', NULL, '2026-05-25T08:00:00Z', '{}', '2026-05-25T08:00:00Z'),
              (?1, 'project_task_case', 'project_task', '601', 'Newer', 'Open', 'Normal', NULL, '31', '77', '2026-05-26T08:00:00Z', '{}', '2026-05-26T08:00:00Z')
            "#,
        )
        .bind(&connection.id)
        .execute(&pool)
        .await
        .expect("insert duplicate cached tasks");

        let survivor = weekly_tasks
            .create(CreateWeeklyTaskInput {
                project_id: None,
                task_type: WeeklyTaskType::PlannedWork,
                status: Some(WeeklyTaskStatus::Todo),
                title: "Keep me".to_string(),
                details: None,
                week_start_date: "2026-05-25".to_string(),
                target_date: None,
                completed_at: None,
                priority: Some(WeeklyTaskPriority::Normal),
                included_in_report: Some(true),
                progress_percent: None,
                estimated_minutes: None,
            })
            .await
            .expect("create survivor task");
        let duplicate = weekly_tasks
            .create(CreateWeeklyTaskInput {
                project_id: None,
                task_type: WeeklyTaskType::PlannedWork,
                status: Some(WeeklyTaskStatus::Todo),
                title: "Drop me".to_string(),
                details: None,
                week_start_date: "2026-05-25".to_string(),
                target_date: None,
                completed_at: None,
                priority: Some(WeeklyTaskPriority::Normal),
                included_in_report: Some(true),
                progress_percent: None,
                estimated_minutes: None,
            })
            .await
            .expect("create duplicate task");

        sqlx::query(
            r#"
            INSERT INTO sparc_force_native_links (
              id, connection_id, external_kind, external_id, native_kind, native_id, created_at, updated_at
            )
            VALUES
              ('link_keep', ?1, 'task', 'project_task_user:601', 'weekly_task', ?2, '2026-05-25T08:00:00Z', '2026-05-25T08:00:00Z'),
              ('link_drop', ?1, 'task', 'project_task_case:601', 'weekly_task', ?3, '2026-05-26T08:00:00Z', '2026-05-26T08:00:00Z')
            "#,
        )
        .bind(&connection.id)
        .bind(&survivor.id)
        .bind(&duplicate.id)
        .execute(&pool)
        .await
        .expect("insert duplicate links");

        run_migrations(&pool).await.expect("rerun migrations");

        let result = repository
            .list_records(ListSparcForceRecordsInput {
                kind: Some("task".to_string()),
                ..Default::default()
            })
            .await
            .expect("list migrated tasks");
        assert_eq!(result.total, 1);
        assert_eq!(
            result.records[0].source.as_deref(),
            Some("project_task_case")
        );
        assert_eq!(result.records[0].case_external_id.as_deref(), Some("77"));

        let linked = repository
            .linked_weekly_task_id("task", "project_task_case", "601")
            .await
            .expect("lookup canonical link");
        assert_eq!(linked.as_deref(), Some(survivor.id.as_str()));

        let duplicate_after = weekly_tasks
            .find(&duplicate.id)
            .await
            .expect("find duplicate")
            .expect("duplicate exists");
        assert_eq!(duplicate_after.status, WeeklyTaskStatus::Dropped);
    }

    #[tokio::test]
    async fn workspace_create_scan_import_and_ignore_work() {
        let pool = test_pool().await;
        let repository = WorkspaceRepository::new(&pool);
        let workspace = repository
            .create(CreateWorkspaceInput {
                name: "Documents Projects".to_string(),
                root_path: "C:\\Users\\Sparc\\Documents\\projects".to_string(),
                classification: None,
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
                classification: None,
            })
            .await
            .expect("create existing project");

        let workspace = workspace_repository
            .create(CreateWorkspaceInput {
                name: "Repo Root".to_string(),
                root_path: "C:\\repo".to_string(),
                classification: Some("work".to_string()),
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
        assert_eq!(imported[0].classification, "work");
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
                workspace_ids: None,
                classification: None,
                git_refs: None,
                worktree_paths: None,
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
                workspace_ids: None,
                classification: None,
                git_refs: None,
                worktree_paths: None,
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
                workspace_ids: None,
                classification: None,
                git_refs: None,
                worktree_paths: None,
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
                workspace_ids: None,
                classification: None,
                git_refs: None,
                worktree_paths: None,
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
                workspace_ids: None,
                classification: None,
                git_refs: None,
                worktree_paths: None,
            })
            .await
            .expect("list activity");

        assert_eq!(days.len(), 1);
        assert_eq!(days[0].items.len(), 1);
        assert_eq!(days[0].items[0].summary, "General meeting");
    }

    #[tokio::test]
    async fn activity_commit_filters_use_normalized_git_focus_metadata() {
        let pool = test_pool().await;
        let project = create_project(&pool).await;
        let commit_repository = CommitRepository::new(&pool);
        let git_metadata_repository = GitMetadataRepository::new(&pool);
        let activity_repository = ActivityRepository::new(&pool);

        commit_repository
            .upsert(&Commit {
                id: "commit_focus_main".to_string(),
                project_id: project.id.clone(),
                commit_hash: "focus-main".to_string(),
                message: "feat: main report work".to_string(),
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
            .expect("insert main commit");
        commit_repository
            .upsert(&Commit {
                id: "commit_focus_feature".to_string(),
                project_id: project.id.clone(),
                commit_hash: "focus-feature".to_string(),
                message: "feat: feature report work".to_string(),
                author_name: Some("Joseph".to_string()),
                author_email: Some("joseph@example.com".to_string()),
                branch: Some("feature/report".to_string()),
                committed_at: "2026-05-19T12:00:00Z".to_string(),
                files_changed: Some(2),
                insertions: Some(18),
                deletions: Some(2),
                included_in_report: true,
            })
            .await
            .expect("insert feature commit");

        git_metadata_repository
            .replace_commit_refs(
                &project.id,
                &[
                    CommitRef {
                        project_id: project.id.clone(),
                        commit_hash: "focus-main".to_string(),
                        ref_name: "main".to_string(),
                        ref_kind: GitRefKind::Local,
                    },
                    CommitRef {
                        project_id: project.id.clone(),
                        commit_hash: "focus-feature".to_string(),
                        ref_name: "feature/report".to_string(),
                        ref_kind: GitRefKind::Local,
                    },
                ],
            )
            .await
            .expect("replace commit refs");
        git_metadata_repository
            .replace_commit_worktree_refs(
                &project.id,
                &[CommitWorktreeRef {
                    project_id: project.id.clone(),
                    commit_hash: "focus-feature".to_string(),
                    worktree_path: "C:\\repo\\sparc-force-api-feature".to_string(),
                    branch: Some("feature/report".to_string()),
                }],
            )
            .await
            .expect("replace commit worktree refs");

        let branch_days = activity_repository
            .list(ListActivityInput {
                from: "2026-05-19".to_string(),
                to: "2026-05-19".to_string(),
                activity_type: Some("commit".to_string()),
                project_ids: Some(vec![project.id.clone()]),
                workspace_ids: None,
                classification: None,
                git_refs: Some(vec![GitRefFilter {
                    project_id: Some(project.id.clone()),
                    name: "main".to_string(),
                    kind: GitRefKind::Local,
                }]),
                worktree_paths: None,
            })
            .await
            .expect("list branch filtered activity");
        assert_eq!(branch_days[0].items.len(), 1);
        assert_eq!(branch_days[0].items[0].summary, "feat: main report work");

        let worktree_days = activity_repository
            .list(ListActivityInput {
                from: "2026-05-19".to_string(),
                to: "2026-05-19".to_string(),
                activity_type: Some("commit".to_string()),
                project_ids: Some(vec![project.id.clone()]),
                workspace_ids: None,
                classification: None,
                git_refs: None,
                worktree_paths: Some(vec!["C:\\repo\\sparc-force-api-feature".to_string()]),
            })
            .await
            .expect("list worktree filtered activity");
        assert_eq!(worktree_days[0].items.len(), 1);
        assert_eq!(
            worktree_days[0].items[0].summary,
            "feat: feature report work"
        );
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
                estimated_minutes: None,
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
                estimated_minutes: None,
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
                estimated_minutes: None,
            })
            .await
            .expect("create old completed task");

        let listed = repository
            .list(ListWeeklyTasksInput {
                week_start_date: "2026-05-18".to_string(),
                week_end_date: "2026-05-22".to_string(),
                project_ids: None,
                classification: None,
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
                    estimated_minutes: None,
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
                estimated_minutes: None,
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
                estimated_minutes: None,
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
                classification: None,
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
                daily_work_minutes: Some(450),
                theme: Some("system".to_string()),
                backup_enabled: Some(true),
                backup_schedule: Some("weekly".to_string()),
                backup_time: Some("17:30".to_string()),
                backup_day: Some("friday".to_string()),
                backup_storage_mode: Some("local".to_string()),
                backup_storage_location: Some("C:\\Backups".to_string()),
                online_backup_status: Some("research".to_string()),
                online_backup_provider: Some(String::new()),
                github_connected: Some(true),
                github_username: Some("octocat".to_string()),
                github_connected_at: Some("2026-05-22T00:00:00Z".to_string()),
                github_last_validated_at: Some("2026-05-22T00:00:00Z".to_string()),
                ..Default::default()
            })
            .await
            .expect("update settings");

        assert_eq!(updated.name, "Joseph");
        assert!(updated.backup_enabled);
        assert!(updated.github_connected);
        assert_eq!(updated.github_username, "octocat");
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
