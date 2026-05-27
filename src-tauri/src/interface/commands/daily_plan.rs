use tauri::State;

use crate::application::daily_plan::{DailyPlanService, DailyPlanServiceError};
use crate::domain::daily_plan::{
    DailyPlan, DailyPlanItem, GetDailyPlanInput, GetTodayCommandCenterInput,
    ReplaceDailyPlanItemsInput, TodayCommandCenter, UpdateDailyPlanItemInput, UpsertDailyPlanInput,
};
use crate::infrastructure::database::repositories::{
    CalendarEventRepository, DailyPlanRepository, FocusSessionRepository, ManualLogRepository,
    WeeklyTaskRepository,
};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[tauri::command]
pub async fn get_daily_plan(
    state: State<'_, AppState>,
    input: GetDailyPlanInput,
) -> Result<AppResult<Option<DailyPlan>>, String> {
    let repository = DailyPlanRepository::new(state.database.pool());
    Ok(
        match DailyPlanService::get_daily_plan(&repository, input).await {
            Ok(plan) => AppResult::ok(plan),
            Err(DailyPlanServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(DailyPlanServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn upsert_daily_plan(
    state: State<'_, AppState>,
    input: UpsertDailyPlanInput,
) -> Result<AppResult<DailyPlan>, String> {
    let repository = DailyPlanRepository::new(state.database.pool());
    Ok(
        match DailyPlanService::upsert_daily_plan(&repository, input).await {
            Ok(plan) => AppResult::ok(plan),
            Err(DailyPlanServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(DailyPlanServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn replace_daily_plan_items(
    state: State<'_, AppState>,
    input: ReplaceDailyPlanItemsInput,
) -> Result<AppResult<Vec<DailyPlanItem>>, String> {
    let repository = DailyPlanRepository::new(state.database.pool());
    Ok(
        match DailyPlanService::replace_daily_plan_items(&repository, input).await {
            Ok(items) => AppResult::ok(items),
            Err(DailyPlanServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(DailyPlanServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn update_daily_plan_item(
    state: State<'_, AppState>,
    id: String,
    input: UpdateDailyPlanItemInput,
) -> Result<AppResult<DailyPlanItem>, String> {
    let repository = DailyPlanRepository::new(state.database.pool());
    Ok(
        match DailyPlanService::update_daily_plan_item(&repository, &id, input).await {
            Ok(Some(item)) => AppResult::ok(item),
            Ok(None) => {
                AppResult::err("DAILY_PLAN_ITEM_NOT_FOUND", "Daily plan item was not found")
            }
            Err(DailyPlanServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(DailyPlanServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}

#[tauri::command]
pub async fn get_today_command_center(
    state: State<'_, AppState>,
    input: GetTodayCommandCenterInput,
) -> Result<AppResult<TodayCommandCenter>, String> {
    let plans = DailyPlanRepository::new(state.database.pool());
    let tasks = WeeklyTaskRepository::new(state.database.pool());
    let focus = FocusSessionRepository::new(state.database.pool());
    let logs = ManualLogRepository::new(state.database.pool());
    let calendar = CalendarEventRepository::new(state.database.pool());

    Ok(
        match DailyPlanService::get_today_command_center(
            &plans, &tasks, &focus, &logs, &calendar, input,
        )
        .await
        {
            Ok(payload) => AppResult::ok(payload),
            Err(DailyPlanServiceError::Validation(message)) => {
                AppResult::err("VALIDATION_ERROR", message)
            }
            Err(DailyPlanServiceError::Database(error)) => {
                AppResult::err("DATABASE_ERROR", error.to_string())
            }
        },
    )
}
