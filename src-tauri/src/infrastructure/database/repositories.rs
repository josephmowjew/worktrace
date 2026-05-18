use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Utc;
use sqlx::{Row, SqlitePool};

use crate::domain::commit::Commit;
use crate::domain::project::{CreateProjectInput, Project, UpdateProjectInput};

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

pub enum CommitUpsertResult {
    Inserted,
    Updated,
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
