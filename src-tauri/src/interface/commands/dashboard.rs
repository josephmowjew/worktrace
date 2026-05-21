use chrono::{Datelike, Duration, NaiveDate, Utc};
use sqlx::SqlitePool;
use tauri::State;

use crate::domain::dashboard::{DailyActivityHours, DashboardStats, ProjectBreakdown};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

fn get_week_range(date: NaiveDate) -> (NaiveDate, NaiveDate) {
    let day = date.weekday().num_days_from_monday();
    let monday = date - Duration::days(day as i64);
    let friday = monday + Duration::days(4);
    (monday, friday)
}

fn format_date(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

fn day_label(date: NaiveDate) -> String {
    let days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    days[date.weekday().num_days_from_monday() as usize].to_string()
}

#[tauri::command]
pub async fn get_dashboard_stats(state: State<'_, AppState>) -> Result<AppResult<DashboardStats>, String> {
    let pool = state.database.pool();
    let now = Utc::now().naive_utc().date();
    let (current_monday, current_friday) = get_week_range(now);
    let prev_monday = current_monday - Duration::days(7);
    let prev_friday = current_friday - Duration::days(7);

    let current_from = format_date(current_monday);
    let current_to = format_date(current_friday);
    let prev_from = format_date(prev_monday);
    let prev_to = format_date(prev_friday);

    // Projects worked on this week (projects with any activity)
    let projects_this_week: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(DISTINCT project_id) FROM (
            SELECT project_id FROM commits WHERE substr(committed_at, 1, 10) >= ?1 AND substr(committed_at, 1, 10) <= ?2
            UNION
            SELECT project_id FROM manual_logs WHERE date >= ?1 AND date <= ?2 AND project_id IS NOT NULL
        )
        "#,
    )
    .bind(&current_from)
    .bind(&current_to)
    .bind(&current_from)
    .bind(&current_to)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let projects_prev_week: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(DISTINCT project_id) FROM (
            SELECT project_id FROM commits WHERE substr(committed_at, 1, 10) >= ?1 AND substr(committed_at, 1, 10) <= ?2
            UNION
            SELECT project_id FROM manual_logs WHERE date >= ?1 AND date <= ?2 AND project_id IS NOT NULL
        )
        "#,
    )
    .bind(&prev_from)
    .bind(&prev_to)
    .bind(&prev_from)
    .bind(&prev_to)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Commits this week
    let commits_this_week: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM commits WHERE substr(committed_at, 1, 10) >= ?1 AND substr(committed_at, 1, 10) <= ?2"#,
    )
    .bind(&current_from)
    .bind(&current_to)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let commits_prev_week: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM commits WHERE substr(committed_at, 1, 10) >= ?1 AND substr(committed_at, 1, 10) <= ?2"#,
    )
    .bind(&prev_from)
    .bind(&prev_to)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let commits_delta_percent = if commits_prev_week > 0 {
        ((commits_this_week as f64 - commits_prev_week as f64) / commits_prev_week as f64) * 100.0
    } else if commits_this_week > 0 {
        100.0
    } else {
        0.0
    };

    // Meetings logged (manual logs with activity_type = 'Meeting')
    let meetings_this_week: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM manual_logs WHERE date >= ?1 AND date <= ?2 AND activity_type = 'Meeting'"#,
    )
    .bind(&current_from)
    .bind(&current_to)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let meetings_prev_week: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM manual_logs WHERE date >= ?1 AND date <= ?2 AND activity_type = 'Meeting'"#,
    )
    .bind(&prev_from)
    .bind(&prev_to)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Reports generated this week
    let reports_this_week: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM reports WHERE substr(created_at, 1, 10) >= ?1 AND substr(created_at, 1, 10) <= ?2"#,
    )
    .bind(&current_from)
    .bind(&current_to)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let reports_prev_week: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM reports WHERE substr(created_at, 1, 10) >= ?1 AND substr(created_at, 1, 10) <= ?2"#,
    )
    .bind(&prev_from)
    .bind(&prev_to)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(AppResult::ok(DashboardStats {
        projects_worked_on: projects_this_week,
        projects_delta: projects_this_week - projects_prev_week,
        commits_this_week,
        commits_delta_percent: (commits_delta_percent * 10.0).round() / 10.0,
        meetings_logged: meetings_this_week,
        meetings_delta: meetings_this_week - meetings_prev_week,
        reports_generated: reports_this_week,
        reports_delta: reports_this_week - reports_prev_week,
    }))
}

#[tauri::command]
pub async fn get_weekly_activity_hours(
    state: State<'_, AppState>,
) -> Result<AppResult<Vec<DailyActivityHours>>, String> {
    let pool = state.database.pool();
    let now = Utc::now().naive_utc().date();
    let (monday, friday) = get_week_range(now);

    let mut result = Vec::new();
    let mut current = monday;

    while current <= friday {
        let date_str = format_date(current);
        let label = day_label(current);

        // Get commit count for this day (estimate 0.5 hours per commit)
        let commit_count: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM commits WHERE substr(committed_at, 1, 10) = ?1"#,
        )
        .bind(&date_str)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

        // Get manual log hours for this day
        let manual_hours: f64 = sqlx::query_scalar(
            r#"SELECT COALESCE(SUM(duration_minutes), 0) / 60.0 FROM manual_logs WHERE date = ?1 AND duration_minutes IS NOT NULL"#,
        )
        .bind(&date_str)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

        let total_hours = (commit_count as f64 * 0.5) + manual_hours;

        result.push(DailyActivityHours {
            day: label,
            date: date_str,
            hours: (total_hours * 10.0).round() / 10.0,
        });

        current = current + Duration::days(1);
    }

    Ok(AppResult::ok(result))
}

#[tauri::command]
pub async fn get_project_breakdown(
    state: State<'_, AppState>,
) -> Result<AppResult<Vec<ProjectBreakdown>>, String> {
    let pool = state.database.pool();
    let now = Utc::now().naive_utc().date();
    let (monday, friday) = get_week_range(now);
    let from = format_date(monday);
    let to = format_date(friday);

    let rows = sqlx::query_as::<_, (String, String, f64)>(
        r#"
        SELECT 
            p.id,
            p.name,
            COALESCE(SUM(ml.duration_minutes), 0) / 60.0 + 
            (SELECT COUNT(*) * 0.5 FROM commits c WHERE c.project_id = p.id AND substr(c.committed_at, 1, 10) >= ?1 AND substr(c.committed_at, 1, 10) <= ?2) as hours
        FROM projects p
        LEFT JOIN manual_logs ml ON ml.project_id = p.id AND ml.date >= ?1 AND ml.date <= ?2 AND ml.duration_minutes IS NOT NULL
        WHERE p.status = 'active'
        GROUP BY p.id, p.name
        HAVING hours > 0
        ORDER BY hours DESC
        "#,
    )
    .bind(&from)
    .bind(&to)
    .bind(&from)
    .bind(&to)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let total_hours: f64 = rows.iter().map(|(_, _, h)| h).sum();

    let breakdown = rows
        .into_iter()
        .map(|(project_id, project_name, hours)| {
            let percentage = if total_hours > 0.0 {
                (hours / total_hours) * 100.0
            } else {
                0.0
            };
            ProjectBreakdown {
                project_id,
                project_name,
                hours: (hours * 10.0).round() / 10.0,
                percentage: (percentage * 10.0).round() / 10.0,
            }
        })
        .collect();

    Ok(AppResult::ok(breakdown))
}
