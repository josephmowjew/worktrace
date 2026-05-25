use chrono::Utc;
use tauri::State;

use crate::domain::project::{CategoryDistribution, ProjectStats, RecentCommit, TopContributor};
use crate::infrastructure::database::repositories::GitMetadataRepository;
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn get_project_stats(
    state: State<'_, AppState>,
) -> Result<AppResult<Vec<ProjectStats>>, String> {
    let pool = state.database.pool();
    let now = Utc::now();
    let week_start = now
        .date_naive()
        .pred_opt()
        .unwrap_or(now.date_naive())
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc();
    let week_start_str = week_start.format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let rows = sqlx::query_as::<_, (String, String, i64, Option<String>, f64)>(
        r#"
        SELECT 
            p.id,
            p.name,
            COALESCE(commit_counts.commits_this_week, 0) as commits_this_week,
            MAX(c.committed_at) as last_sync,
            COALESCE(log_totals.total_hours, 0.0) as hours_tracked
        FROM projects p
        LEFT JOIN (
            SELECT project_id, COUNT(*) as commits_this_week
            FROM commits
            WHERE committed_at >= ?1
            GROUP BY project_id
        ) commit_counts ON commit_counts.project_id = p.id
        LEFT JOIN commits c ON c.project_id = p.id
        LEFT JOIN (
            SELECT project_id, COALESCE(SUM(duration_minutes), 0) / 60.0 as total_hours
            FROM manual_logs
            WHERE duration_minutes IS NOT NULL
            GROUP BY project_id
        ) log_totals ON log_totals.project_id = p.id
        WHERE p.status = 'active'
        GROUP BY p.id, p.name, commit_counts.commits_this_week, log_totals.total_hours
        ORDER BY p.name ASC
        "#,
    )
    .bind(&week_start_str)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let stats = rows
        .into_iter()
        .map(
            |(project_id, project_name, commits_this_week, last_sync, hours_tracked)| {
                ProjectStats {
                    project_id,
                    project_name,
                    commits_this_week,
                    last_sync,
                    hours_tracked,
                }
            },
        )
        .collect();

    Ok(AppResult::ok(stats))
}

#[tauri::command]
pub async fn get_category_distribution(
    state: State<'_, AppState>,
) -> Result<AppResult<Vec<CategoryDistribution>>, String> {
    let pool = state.database.pool();

    let rows = sqlx::query_as::<_, (Option<String>, i64)>(
        r#"
        SELECT type, COUNT(*) as count
        FROM projects
        WHERE status = 'active'
        GROUP BY type
        ORDER BY count DESC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let total: i64 = rows.iter().map(|(_, count)| count).sum();

    let distribution = rows
        .into_iter()
        .map(|(category, count)| {
            let percentage = if total > 0 {
                (count as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            CategoryDistribution {
                category: category.unwrap_or_else(|| "Other".to_string()),
                count,
                percentage: (percentage * 10.0).round() / 10.0,
            }
        })
        .collect();

    Ok(AppResult::ok(distribution))
}

#[tauri::command]
pub async fn get_recent_commits(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<AppResult<Vec<RecentCommit>>, String> {
    let pool = state.database.pool();
    let git_metadata_repository = GitMetadataRepository::new(pool);
    let limit = limit.unwrap_or(10);

    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            Option<String>,
            String,
            String,
            Option<String>,
            Option<String>,
            String,
        ),
    >(
        r#"
        SELECT 
            p.id as project_id,
            p.name as project_name,
            p.repo_path,
            c.commit_hash,
            c.message,
            c.author_name,
            c.branch,
            c.committed_at
        FROM commits c
        JOIN projects p ON p.id = c.project_id
        WHERE p.status = 'active'
        ORDER BY c.committed_at DESC
        LIMIT ?1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut commits = Vec::with_capacity(rows.len());
    for (
        project_id,
        project_name,
        repo_path,
        commit_hash,
        message,
        author_name,
        branch,
        committed_at,
    ) in rows
    {
        let refs = git_metadata_repository
            .refs_for_commit(&project_id, &commit_hash)
            .await
            .unwrap_or_default();
        let worktree = git_metadata_repository
            .worktree_for_commit(&project_id, &commit_hash)
            .await
            .ok()
            .flatten();
        commits.push(RecentCommit {
            project_id,
            project_name,
            repo_path,
            commit_hash,
            message,
            author_name,
            branch,
            committed_at,
            refs,
            worktree,
            status: "Up to date".to_string(),
        });
    }

    Ok(AppResult::ok(commits))
}

#[tauri::command]
pub async fn get_top_contributors(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<AppResult<Vec<TopContributor>>, String> {
    let pool = state.database.pool();
    let limit = limit.unwrap_or(5);

    let now = Utc::now();
    let week_start = now
        .date_naive()
        .pred_opt()
        .unwrap_or(now.date_naive())
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc();
    let week_start_str = week_start.format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let rows = sqlx::query_as::<_, (String, Option<String>, i64)>(
        r#"
        SELECT 
            author_name,
            author_email,
            COUNT(*) as commit_count
        FROM commits
        WHERE committed_at >= ?1
          AND author_name IS NOT NULL
        GROUP BY author_name, author_email
        ORDER BY commit_count DESC
        LIMIT ?2
        "#,
    )
    .bind(&week_start_str)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let contributors = rows
        .into_iter()
        .map(|(author_name, author_email, commit_count)| TopContributor {
            author_name,
            author_email,
            commit_count,
        })
        .collect();

    Ok(AppResult::ok(contributors))
}
