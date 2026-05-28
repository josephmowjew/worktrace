use tauri::State;
use tauri_plugin_updater::UpdaterExt;

use crate::application::app_updates::{self, ReleaseNotesPayload};
use crate::interface::dto::app_result::AppResult;
use crate::AppState;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub status: String,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub body: Option<String>,
    pub pub_date: Option<String>,
}

#[tauri::command]
pub async fn get_app_version(
    app: tauri::AppHandle,
) -> Result<AppResult<app_updates::AppVersionInfo>, String> {
    Ok(AppResult::ok(app_updates::current_version(&app)))
}

#[tauri::command]
pub async fn get_release_notes(
    app: tauri::AppHandle,
) -> Result<AppResult<ReleaseNotesPayload>, String> {
    Ok(AppResult::ok(app_updates::fallback_release_notes(&app)))
}

#[tauri::command]
pub async fn check_for_app_update(
    app: tauri::AppHandle,
    _state: State<'_, AppState>,
) -> Result<AppResult<UpdateCheckResult>, String> {
    let current_version = app.package_info().version.to_string();
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => {
            return Ok(AppResult::ok(UpdateCheckResult {
                status: "error".to_string(),
                current_version,
                latest_version: None,
                body: Some(error.to_string()),
                pub_date: None,
            }))
        }
    };

    match updater.check().await {
        Ok(Some(update)) => Ok(AppResult::ok(UpdateCheckResult {
            status: "available".to_string(),
            current_version,
            latest_version: Some(update.version.clone()),
            body: update.body.clone(),
            pub_date: update.date.map(|d| d.to_string()),
        })),
        Ok(None) => Ok(AppResult::ok(UpdateCheckResult {
            status: "up_to_date".to_string(),
            current_version,
            latest_version: None,
            body: None,
            pub_date: None,
        })),
        Err(error) => Ok(AppResult::ok(UpdateCheckResult {
            status: "error".to_string(),
            current_version,
            latest_version: None,
            body: Some(error.to_string()),
            pub_date: None,
        })),
    }
}

#[tauri::command]
pub async fn install_app_update(app: tauri::AppHandle) -> Result<AppResult<bool>, String> {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => return Ok(AppResult::err("UPDATER_UNAVAILABLE", error.to_string())),
    };

    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        return Ok(AppResult::ok(false));
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    app.restart();
}
