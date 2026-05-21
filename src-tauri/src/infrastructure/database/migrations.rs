use sqlx::SqlitePool;

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("PRAGMA foreign_keys = ON;")
        .execute(pool)
        .await?;
    sqlx::raw_sql(SCHEMA_SQL).execute(pool).await?;

    sqlx::query(
        r#"
        ALTER TABLE projects ADD COLUMN description TEXT;
        "#,
    )
    .execute(pool)
    .await
    .ok();

    sqlx::query(
        r#"
        ALTER TABLE projects ADD COLUMN workspace_id TEXT;
        "#,
    )
    .execute(pool)
    .await
    .ok();

    sqlx::query(
        r#"
        ALTER TABLE projects ADD COLUMN workspace_relative_path TEXT;
        "#,
    )
    .execute(pool)
    .await
    .ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        ALTER TABLE weekly_tasks ADD COLUMN progress_percent INTEGER;
        "#,
    )
    .execute(pool)
    .await
    .ok();

    sqlx::raw_sql(
        r#"
        CREATE TABLE IF NOT EXISTS focus_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          task_id TEXT,
          title TEXT NOT NULL,
          notes TEXT,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          duration_minutes INTEGER,
          manual_log_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (task_id) REFERENCES weekly_tasks(id),
          FOREIGN KEY (manual_log_id) REFERENCES manual_logs(id)
        );

        CREATE INDEX IF NOT EXISTS idx_focus_sessions_started_at ON focus_sessions(started_at);
        CREATE INDEX IF NOT EXISTS idx_focus_sessions_status ON focus_sessions(status);
        CREATE INDEX IF NOT EXISTS idx_focus_sessions_project ON focus_sessions(project_id);
        CREATE INDEX IF NOT EXISTS idx_focus_sessions_task ON focus_sessions(task_id);
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::raw_sql(
        r#"
        CREATE TABLE IF NOT EXISTS nudge_dismissals (
          id TEXT PRIMARY KEY,
          nudge_key TEXT NOT NULL,
          scope TEXT,
          dismissed_for_date TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_nudge_dismissals_unique
          ON nudge_dismissals(nudge_key, dismissed_for_date, scope);
        CREATE INDEX IF NOT EXISTS idx_nudge_dismissals_date
          ON nudge_dismissals(dismissed_for_date);
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  repo_path TEXT,
  github_url TEXT,
  type TEXT,
  workspace_id TEXT,
  workspace_relative_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_scanned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);

CREATE TABLE IF NOT EXISTS workspace_repo_ignores (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_ignores_unique ON workspace_repo_ignores(workspace_id, repo_path);

CREATE TABLE IF NOT EXISTS commits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  message TEXT NOT NULL,
  author_name TEXT,
  author_email TEXT,
  branch TEXT,
  committed_at TEXT NOT NULL,
  files_changed INTEGER,
  insertions INTEGER,
  deletions INTEGER,
  included_in_report INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commits_project_hash ON commits(project_id, commit_hash);
CREATE INDEX IF NOT EXISTS idx_commits_committed_at ON commits(committed_at);

CREATE TABLE IF NOT EXISTS manual_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  date TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  outcome TEXT,
  duration_minutes INTEGER,
  follow_up TEXT,
  included_in_report INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_manual_logs_date ON manual_logs(date);
CREATE INDEX IF NOT EXISTS idx_manual_logs_project ON manual_logs(project_id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  recipient_name TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

CREATE TABLE IF NOT EXISTS report_items (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  project_id TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_report_items_report ON report_items(report_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  note_type TEXT NOT NULL,
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  included_in_report INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_report_notes_date ON report_notes(date);
CREATE INDEX IF NOT EXISTS idx_report_notes_type ON report_notes(note_type);

CREATE TABLE IF NOT EXISTS weekly_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  week_start_date TEXT NOT NULL,
  target_date TEXT,
  completed_at TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  included_in_report INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_tasks_week ON weekly_tasks(week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_status ON weekly_tasks(status);
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_project ON weekly_tasks(project_id);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  task_id TEXT,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_minutes INTEGER,
  manual_log_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (task_id) REFERENCES weekly_tasks(id),
  FOREIGN KEY (manual_log_id) REFERENCES manual_logs(id)
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_started_at ON focus_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_status ON focus_sessions(status);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_project ON focus_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_task ON focus_sessions(task_id);

CREATE TABLE IF NOT EXISTS nudge_dismissals (
  id TEXT PRIMARY KEY,
  nudge_key TEXT NOT NULL,
  scope TEXT,
  dismissed_for_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nudge_dismissals_unique
  ON nudge_dismissals(nudge_key, dismissed_for_date, scope);
CREATE INDEX IF NOT EXISTS idx_nudge_dismissals_date
  ON nudge_dismissals(dismissed_for_date);
"#;
