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

    sqlx::query(
        "ALTER TABLE projects ADD COLUMN classification TEXT NOT NULL DEFAULT 'unclassified';",
    )
    .execute(pool)
    .await
    .ok();

    sqlx::query(
        "ALTER TABLE workspaces ADD COLUMN classification TEXT NOT NULL DEFAULT 'unclassified';",
    )
    .execute(pool)
    .await
    .ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_projects_classification ON projects(classification);",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_workspaces_classification ON workspaces(classification);",
    )
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

    sqlx::query(
        r#"
        ALTER TABLE weekly_tasks ADD COLUMN estimated_minutes INTEGER;
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

    sqlx::raw_sql(CALENDAR_SQL).execute(pool).await?;
    sqlx::raw_sql(DAILY_PLAN_SQL).execute(pool).await?;
    sqlx::raw_sql(GIT_METADATA_SQL).execute(pool).await?;
    sqlx::raw_sql(ACTIVITY_GROUPS_SQL).execute(pool).await?;
    run_activity_group_metadata_migration(pool).await?;
    sqlx::raw_sql(ACTIVITY_GROUP_TITLE_MEMORY_SQL)
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE activity_group_title_memory ADD COLUMN evidence_terms_json TEXT;")
        .execute(pool)
        .await
        .ok();
    sqlx::raw_sql(ACTIVITY_GROUP_NARRATIVES_SQL)
        .execute(pool)
        .await?;
    sqlx::raw_sql(EMBEDDINGS_SQL).execute(pool).await?;
    sqlx::raw_sql(SPARC_FORCE_SQL).execute(pool).await?;
    run_sparc_force_dedup_migration(pool).await?;

    Ok(())
}

async fn run_activity_group_metadata_migration(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for statement in [
        "ALTER TABLE activity_groups ADD COLUMN fingerprint TEXT;",
        "ALTER TABLE activity_groups ADD COLUMN algorithm_version TEXT;",
        "ALTER TABLE activity_groups ADD COLUMN confidence_label TEXT NOT NULL DEFAULT 'likely';",
        "ALTER TABLE activity_groups ADD COLUMN rationale_json TEXT;",
        "ALTER TABLE activity_groups ADD COLUMN report_summary TEXT;",
        "ALTER TABLE activity_groups ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;",
        "ALTER TABLE activity_groups ADD COLUMN user_edited_at TEXT;",
        "ALTER TABLE activity_groups ADD COLUMN review_status TEXT NOT NULL DEFAULT 'draft';",
    ] {
        sqlx::query(statement).execute(pool).await.ok();
    }

    sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_groups_fingerprint ON activity_groups(fingerprint);",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_activity_groups_review_status ON activity_groups(review_status);",
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn run_sparc_force_dedup_migration(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("ALTER TABLE sparc_force_tasks ADD COLUMN external_kind TEXT;")
        .execute(pool)
        .await
        .ok();
    sqlx::query("ALTER TABLE sparc_force_cases ADD COLUMN created_at_remote TEXT;")
        .execute(pool)
        .await
        .ok();
    sqlx::query("ALTER TABLE sparc_force_projects ADD COLUMN created_at_remote TEXT;")
        .execute(pool)
        .await
        .ok();
    sqlx::query("ALTER TABLE sparc_force_tasks ADD COLUMN created_at_remote TEXT;")
        .execute(pool)
        .await
        .ok();

    sqlx::raw_sql(
        r#"
        UPDATE sparc_force_tasks
        SET external_kind = CASE
          WHEN source IN ('project_task_user', 'project_task_case') THEN 'project_task'
          WHEN source IN ('standalone_assigned', 'case_task') THEN 'task'
          ELSE COALESCE(NULLIF(source, ''), 'task')
        END
        WHERE external_kind IS NULL OR external_kind = '';

        DROP INDEX IF EXISTS idx_sparc_force_native_links_unique;

        UPDATE sparc_force_native_links
        SET external_id =
          CASE
            WHEN external_id LIKE 'project_task_user:%'
              THEN 'project_task:' || substr(external_id, length('project_task_user:') + 1)
            WHEN external_id LIKE 'project_task_case:%'
              THEN 'project_task:' || substr(external_id, length('project_task_case:') + 1)
            WHEN external_id LIKE 'standalone_assigned:%'
              THEN 'task:' || substr(external_id, length('standalone_assigned:') + 1)
            WHEN external_id LIKE 'case_task:%'
              THEN 'task:' || substr(external_id, length('case_task:') + 1)
            ELSE external_id
          END
        WHERE external_kind = 'task';

        UPDATE weekly_tasks
        SET status = 'dropped',
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id IN (
          SELECT native_id
          FROM (
            SELECT links.native_id,
                   ROW_NUMBER() OVER (
                     PARTITION BY links.connection_id, links.external_kind, links.external_id, links.native_kind
                     ORDER BY weekly_tasks.created_at ASC, links.created_at ASC, links.native_id ASC
                   ) AS rn
            FROM sparc_force_native_links links
            LEFT JOIN weekly_tasks ON weekly_tasks.id = links.native_id
            WHERE links.external_kind = 'task'
              AND links.native_kind = 'weekly_task'
          )
          WHERE rn > 1
        );

        DELETE FROM sparc_force_native_links
        WHERE id IN (
          SELECT id
          FROM (
            SELECT links.id,
                   ROW_NUMBER() OVER (
                     PARTITION BY links.connection_id, links.external_kind, links.external_id, links.native_kind
                     ORDER BY weekly_tasks.created_at ASC, links.created_at ASC, links.native_id ASC
                   ) AS rn
            FROM sparc_force_native_links links
            LEFT JOIN weekly_tasks ON weekly_tasks.id = links.native_id
            WHERE links.external_kind = 'task'
              AND links.native_kind = 'weekly_task'
          )
          WHERE rn > 1
        );

        DELETE FROM sparc_force_tasks
        WHERE rowid IN (
          SELECT rowid
          FROM (
            SELECT rowid,
                   ROW_NUMBER() OVER (
                     PARTITION BY connection_id, external_kind, external_id
                     ORDER BY
                       CASE WHEN case_external_id IS NOT NULL AND case_external_id != '' THEN 0 ELSE 1 END,
                       CASE WHEN project_external_id IS NOT NULL AND project_external_id != '' THEN 0 ELSE 1 END,
                       COALESCE(updated_at_remote, '') DESC,
                       imported_at DESC,
                       source ASC
                   ) AS rn
            FROM sparc_force_tasks
          )
          WHERE rn > 1
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_sparc_force_tasks_canonical
          ON sparc_force_tasks(connection_id, external_kind, external_id);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_sparc_force_native_links_unique
          ON sparc_force_native_links(connection_id, external_kind, external_id, native_kind, native_id);
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

const SPARC_FORCE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS sparc_force_connections (
  id TEXT PRIMARY KEY,
  base_url TEXT NOT NULL,
  status TEXT NOT NULL,
  account_email TEXT NOT NULL,
  remote_user_id INTEGER,
  remote_username TEXT,
  masked_email TEXT,
  access_token_ref TEXT,
  refresh_token_ref TEXT,
  otp_session_ref TEXT,
  access_expires_at TEXT,
  otp_expires_at TEXT,
  connected_at TEXT,
  last_validated_at TEXT,
  last_synced_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sparc_force_connections_status
  ON sparc_force_connections(status);

CREATE TABLE IF NOT EXISTS sparc_force_cases (
  connection_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  case_number TEXT,
  title TEXT NOT NULL,
  status TEXT,
  priority TEXT,
  assigned_to INTEGER,
  project_external_id TEXT,
  updated_at_remote TEXT,
  created_at_remote TEXT,
  raw_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, external_id),
  FOREIGN KEY (connection_id) REFERENCES sparc_force_connections(id)
);

CREATE TABLE IF NOT EXISTS sparc_force_projects (
  connection_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  priority TEXT,
  updated_at_remote TEXT,
  created_at_remote TEXT,
  raw_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, external_id),
  FOREIGN KEY (connection_id) REFERENCES sparc_force_connections(id)
);

CREATE TABLE IF NOT EXISTS sparc_force_tasks (
  connection_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_kind TEXT NOT NULL DEFAULT 'task',
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT,
  priority TEXT,
  assigned_to INTEGER,
  project_external_id TEXT,
  case_external_id TEXT,
  updated_at_remote TEXT,
  created_at_remote TEXT,
  raw_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, source, external_id),
  FOREIGN KEY (connection_id) REFERENCES sparc_force_connections(id)
);

CREATE INDEX IF NOT EXISTS idx_sparc_force_tasks_project
  ON sparc_force_tasks(connection_id, project_external_id);
CREATE INDEX IF NOT EXISTS idx_sparc_force_tasks_case
  ON sparc_force_tasks(connection_id, case_external_id);

CREATE TABLE IF NOT EXISTS sparc_force_native_links (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  external_kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  native_kind TEXT NOT NULL,
  native_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (connection_id) REFERENCES sparc_force_connections(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sparc_force_native_links_unique
  ON sparc_force_native_links(connection_id, external_kind, external_id, native_kind, native_id);
"#;

const GIT_METADATA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS git_refs (
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  is_head INTEGER NOT NULL DEFAULT 0,
  last_seen_commit TEXT,
  last_scanned_at TEXT NOT NULL,
  PRIMARY KEY (project_id, name, kind),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_git_refs_project ON git_refs(project_id);

CREATE TABLE IF NOT EXISTS commit_refs (
  project_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  ref_name TEXT NOT NULL,
  ref_kind TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (project_id, commit_hash, ref_name, ref_kind),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_commit_refs_commit ON commit_refs(project_id, commit_hash);

CREATE TABLE IF NOT EXISTS commit_worktree_refs (
  project_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  branch TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (project_id, commit_hash, worktree_path),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_commit_worktree_refs_commit ON commit_worktree_refs(project_id, commit_hash);
CREATE INDEX IF NOT EXISTS idx_commit_worktree_refs_path ON commit_worktree_refs(project_id, worktree_path);

CREATE TABLE IF NOT EXISTS git_worktrees (
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  branch TEXT,
  head_commit TEXT,
  is_clean INTEGER,
  is_prunable INTEGER NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  last_scanned_at TEXT NOT NULL,
  PRIMARY KEY (project_id, path),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_git_worktrees_project ON git_worktrees(project_id);

CREATE TABLE IF NOT EXISTS project_git_focus_refs (
  project_id TEXT NOT NULL,
  ref_name TEXT NOT NULL,
  ref_kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, ref_name, ref_kind),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS project_git_focus_worktrees (
  project_id TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, worktree_path),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
"#;

const CALENDAR_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS calendar_sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_email TEXT NOT NULL,
  account_name TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  token_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_sources_provider_account
  ON calendar_sources(provider, account_email);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  timezone TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  busy_status TEXT NOT NULL DEFAULT 'busy',
  is_cancelled INTEGER NOT NULL DEFAULT 0,
  project_id TEXT,
  task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES calendar_sources(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (task_id) REFERENCES weekly_tasks(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_source_external
  ON calendar_events(source_id, external_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_starts_at ON calendar_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_ends_at ON calendar_events(ends_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_source ON calendar_events(source_id);
"#;

const DAILY_PLAN_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS daily_plans (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  focus_goal_minutes INTEGER NOT NULL DEFAULT 240,
  current_task_id TEXT,
  suggested_task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (current_task_id) REFERENCES weekly_tasks(id),
  FOREIGN KEY (suggested_task_id) REFERENCES weekly_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(date);

CREATE TABLE IF NOT EXISTS daily_plan_items (
  id TEXT PRIMARY KEY,
  daily_plan_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  weekly_task_id TEXT,
  planned_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (daily_plan_id) REFERENCES daily_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (weekly_task_id) REFERENCES weekly_tasks(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plan_items_plan_rank ON daily_plan_items(daily_plan_id, rank);
CREATE INDEX IF NOT EXISTS idx_daily_plan_items_plan ON daily_plan_items(daily_plan_id);
"#;

const ACTIVITY_GROUPS_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS activity_groups (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'local_rule',
  confidence REAL NOT NULL DEFAULT 0.7,
  included_in_report INTEGER NOT NULL DEFAULT 1,
  fingerprint TEXT,
  algorithm_version TEXT,
  confidence_label TEXT NOT NULL DEFAULT 'likely',
  rationale_json TEXT,
  report_summary TEXT,
  locked INTEGER NOT NULL DEFAULT 0,
  user_edited_at TEXT,
  review_status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_activity_groups_project ON activity_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_groups_dates ON activity_groups(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_activity_groups_included ON activity_groups(included_in_report);

CREATE TABLE IF NOT EXISTS activity_group_items (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  summary_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES activity_groups(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_group_items_unique ON activity_group_items(group_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_activity_group_items_group ON activity_group_items(group_id);
CREATE INDEX IF NOT EXISTS idx_activity_group_items_source ON activity_group_items(source_type, source_id);

CREATE TABLE IF NOT EXISTS commit_file_changes (
  project_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  path TEXT NOT NULL,
  old_path TEXT,
  change_kind TEXT NOT NULL DEFAULT 'modified',
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  is_binary INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  top_level_dir TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  is_docs INTEGER NOT NULL DEFAULT 0,
  is_config INTEGER NOT NULL DEFAULT 0,
  is_migration INTEGER NOT NULL DEFAULT 0,
  is_generated INTEGER NOT NULL DEFAULT 0,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (project_id, commit_hash, path),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_commit_file_changes_commit ON commit_file_changes(project_id, commit_hash);
CREATE INDEX IF NOT EXISTS idx_commit_file_changes_top_level ON commit_file_changes(top_level_dir);

CREATE TABLE IF NOT EXISTS commit_diff_snippets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  path TEXT NOT NULL,
  snippet TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_commit_diff_snippets_commit ON commit_diff_snippets(project_id, commit_hash);

CREATE TABLE IF NOT EXISTS activity_source_links (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.7,
  evidence_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_source_links_source ON activity_source_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_activity_source_links_target ON activity_source_links(target_type, target_id);
"#;

const ACTIVITY_GROUP_TITLE_MEMORY_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS activity_group_title_memory (
  id TEXT PRIMARY KEY,
  original_title TEXT NOT NULL,
  edited_title TEXT NOT NULL,
  edited_summary TEXT,
  project_id TEXT,
  project_name TEXT,
  evidence_fingerprint TEXT,
  evidence_terms TEXT NOT NULL,
  evidence_terms_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_activity_group_title_memory_project
  ON activity_group_title_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_group_title_memory_fingerprint
  ON activity_group_title_memory(evidence_fingerprint);
"#;

const ACTIVITY_GROUP_NARRATIVES_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS activity_group_narratives (
  group_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  report_summary TEXT,
  title_confidence REAL NOT NULL,
  title_confidence_label TEXT NOT NULL,
  title_quality_label TEXT NOT NULL,
  naming_strategy TEXT NOT NULL,
  classification_json TEXT NOT NULL,
  candidates_json TEXT NOT NULL,
  rationale_json TEXT NOT NULL,
  rejected_terms_json TEXT,
  algorithm_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES activity_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activity_group_narratives_quality
  ON activity_group_narratives(title_quality_label);
CREATE INDEX IF NOT EXISTS idx_activity_group_narratives_confidence
  ON activity_group_narratives(title_confidence_label);

CREATE TABLE IF NOT EXISTS activity_group_title_vocabulary (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  project_name TEXT,
  project_family TEXT,
  preferred_term TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  avoid_terms_json TEXT,
  related_terms_json TEXT,
  evidence_terms_json TEXT,
  source TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_title_vocabulary_project
  ON activity_group_title_vocabulary(project_id, normalized_term);
CREATE INDEX IF NOT EXISTS idx_title_vocabulary_family
  ON activity_group_title_vocabulary(project_family, normalized_term);

CREATE TABLE IF NOT EXISTS activity_group_title_events (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  project_id TEXT,
  event_type TEXT NOT NULL,
  previous_title TEXT,
  new_title TEXT,
  previous_summary TEXT,
  new_summary TEXT,
  selected_candidate_json TEXT,
  rejected_candidates_json TEXT,
  evidence_fingerprint TEXT,
  evidence_terms_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES activity_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_title_events_group
  ON activity_group_title_events(group_id);
CREATE INDEX IF NOT EXISTS idx_title_events_project
  ON activity_group_title_events(project_id, event_type);
"#;

const EMBEDDINGS_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS activity_embeddings (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  evidence_kind TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  vector_path TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_embeddings_unique
  ON activity_embeddings(source_type, source_id, evidence_kind, model, provider);
CREATE INDEX IF NOT EXISTS idx_activity_embeddings_source
  ON activity_embeddings(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_activity_embeddings_hash
  ON activity_embeddings(text_hash);
"#;

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
  classification TEXT NOT NULL DEFAULT 'unclassified',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'unclassified',
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

CREATE TABLE IF NOT EXISTS git_refs (
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  is_head INTEGER NOT NULL DEFAULT 0,
  last_seen_commit TEXT,
  last_scanned_at TEXT NOT NULL,
  PRIMARY KEY (project_id, name, kind),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_git_refs_project ON git_refs(project_id);

CREATE TABLE IF NOT EXISTS commit_refs (
  project_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  ref_name TEXT NOT NULL,
  ref_kind TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (project_id, commit_hash, ref_name, ref_kind),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_commit_refs_commit ON commit_refs(project_id, commit_hash);

CREATE TABLE IF NOT EXISTS commit_worktree_refs (
  project_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  branch TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (project_id, commit_hash, worktree_path),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_commit_worktree_refs_commit ON commit_worktree_refs(project_id, commit_hash);
CREATE INDEX IF NOT EXISTS idx_commit_worktree_refs_path ON commit_worktree_refs(project_id, worktree_path);

CREATE TABLE IF NOT EXISTS git_worktrees (
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  branch TEXT,
  head_commit TEXT,
  is_clean INTEGER,
  is_prunable INTEGER NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  last_scanned_at TEXT NOT NULL,
  PRIMARY KEY (project_id, path),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_git_worktrees_project ON git_worktrees(project_id);

CREATE TABLE IF NOT EXISTS project_git_focus_refs (
  project_id TEXT NOT NULL,
  ref_name TEXT NOT NULL,
  ref_kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, ref_name, ref_kind),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS project_git_focus_worktrees (
  project_id TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, worktree_path),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

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
  estimated_minutes INTEGER,
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

CREATE TABLE IF NOT EXISTS daily_plans (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  focus_goal_minutes INTEGER NOT NULL DEFAULT 240,
  current_task_id TEXT,
  suggested_task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (current_task_id) REFERENCES weekly_tasks(id),
  FOREIGN KEY (suggested_task_id) REFERENCES weekly_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(date);

CREATE TABLE IF NOT EXISTS daily_plan_items (
  id TEXT PRIMARY KEY,
  daily_plan_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  weekly_task_id TEXT,
  planned_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (daily_plan_id) REFERENCES daily_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (weekly_task_id) REFERENCES weekly_tasks(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plan_items_plan_rank ON daily_plan_items(daily_plan_id, rank);
CREATE INDEX IF NOT EXISTS idx_daily_plan_items_plan ON daily_plan_items(daily_plan_id);
"#;
