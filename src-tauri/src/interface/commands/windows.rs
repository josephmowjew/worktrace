use serde::Serialize;
use tauri::{Emitter, Manager, WebviewWindow};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::interface::dto::app_result::AppResult;
use crate::AppState;

const TODO_WIDGET_LABEL: &str = "widget";
const MAIN_WINDOW_LABEL: &str = "main";
pub const QUICK_CAPTURE_LABEL: &str = "quick-capture";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickCaptureStatus {
    pub enabled: bool,
    pub shortcut: String,
    pub registered: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLifecycleStatus {
    pub startup_enabled: bool,
    pub start_minimized_to_tray: bool,
    pub minimize_to_tray_on_close: bool,
    pub autostart_registered: bool,
    pub last_error: Option<String>,
}

#[tauri::command]
pub async fn show_todo_widget(app: tauri::AppHandle) -> Result<AppResult<bool>, String> {
    let Some(window) = app.get_webview_window(TODO_WIDGET_LABEL) else {
        return Ok(AppResult::err(
            "WIDGET_NOT_FOUND",
            "The todo widget window is not available.",
        ));
    };

    if let Err(error) = window.show() {
        return Ok(AppResult::err(
            "WIDGET_SHOW_FAILED",
            &format!("Could not show the todo widget: {error}"),
        ));
    }

    if let Err(error) = window.set_always_on_top(true) {
        return Ok(AppResult::err(
            "WIDGET_TOPMOST_FAILED",
            &format!("Could not keep the todo widget on top: {error}"),
        ));
    }

    if let Err(error) = window.set_focus() {
        return Ok(AppResult::err(
            "WIDGET_FOCUS_FAILED",
            &format!("Could not focus the todo widget: {error}"),
        ));
    }

    Ok(AppResult::ok(true))
}

#[tauri::command]
pub async fn hide_todo_widget(app: tauri::AppHandle) -> Result<AppResult<bool>, String> {
    let Some(window) = app.get_webview_window(TODO_WIDGET_LABEL) else {
        return Ok(AppResult::err(
            "WIDGET_NOT_FOUND",
            "The todo widget window is not available.",
        ));
    };

    if let Err(error) = window.hide() {
        return Ok(AppResult::err(
            "WIDGET_HIDE_FAILED",
            &format!("Could not hide the todo widget: {error}"),
        ));
    }

    Ok(AppResult::ok(false))
}

#[tauri::command]
pub async fn toggle_todo_widget(app: tauri::AppHandle) -> Result<AppResult<bool>, String> {
    let Some(window) = app.get_webview_window(TODO_WIDGET_LABEL) else {
        return Ok(AppResult::err(
            "WIDGET_NOT_FOUND",
            "The todo widget window is not available.",
        ));
    };

    let is_visible = match window.is_visible() {
        Ok(value) => value,
        Err(error) => {
            return Ok(AppResult::err(
                "WIDGET_STATE_FAILED",
                &format!("Could not read todo widget visibility: {error}"),
            ));
        }
    };

    if is_visible {
        if let Err(error) = window.hide() {
            return Ok(AppResult::err(
                "WIDGET_HIDE_FAILED",
                &format!("Could not hide the todo widget: {error}"),
            ));
        }
        return Ok(AppResult::ok(false));
    }

    if let Err(error) = window.show() {
        return Ok(AppResult::err(
            "WIDGET_SHOW_FAILED",
            &format!("Could not show the todo widget: {error}"),
        ));
    }

    if let Err(error) = window.set_always_on_top(true) {
        return Ok(AppResult::err(
            "WIDGET_TOPMOST_FAILED",
            &format!("Could not keep the todo widget on top: {error}"),
        ));
    }

    if let Err(error) = window.set_focus() {
        return Ok(AppResult::err(
            "WIDGET_FOCUS_FAILED",
            &format!("Could not focus the todo widget: {error}"),
        ));
    }

    Ok(AppResult::ok(true))
}

#[tauri::command]
pub async fn set_todo_widget_always_on_top(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<AppResult<bool>, String> {
    let Some(window) = app.get_webview_window(TODO_WIDGET_LABEL) else {
        return Ok(AppResult::err(
            "WIDGET_NOT_FOUND",
            "The todo widget window is not available.",
        ));
    };

    if let Err(error) = window.set_always_on_top(enabled) {
        return Ok(AppResult::err(
            "WIDGET_TOPMOST_FAILED",
            &format!("Could not update todo widget topmost state: {error}"),
        ));
    }

    Ok(AppResult::ok(enabled))
}

#[tauri::command]
pub async fn show_quick_capture(app: tauri::AppHandle) -> Result<AppResult<bool>, String> {
    match show_quick_capture_window(&app) {
        Ok(()) => Ok(AppResult::ok(true)),
        Err((code, message)) => Ok(AppResult::err(code, message)),
    }
}

#[tauri::command]
pub async fn hide_quick_capture(app: tauri::AppHandle) -> Result<AppResult<bool>, String> {
    let Some(window) = app.get_webview_window(QUICK_CAPTURE_LABEL) else {
        return Ok(AppResult::err(
            "QUICK_CAPTURE_NOT_FOUND",
            "The quick capture window is not available.",
        ));
    };

    if let Err(error) = window.hide() {
        return Ok(AppResult::err(
            "QUICK_CAPTURE_HIDE_FAILED",
            &format!("Could not hide quick capture: {error}"),
        ));
    }

    Ok(AppResult::ok(false))
}

#[tauri::command]
pub async fn toggle_quick_capture(app: tauri::AppHandle) -> Result<AppResult<bool>, String> {
    let Some(window) = app.get_webview_window(QUICK_CAPTURE_LABEL) else {
        return Ok(AppResult::err(
            "QUICK_CAPTURE_NOT_FOUND",
            "The quick capture window is not available.",
        ));
    };

    let is_visible = match window.is_visible() {
        Ok(value) => value,
        Err(error) => {
            return Ok(AppResult::err(
                "QUICK_CAPTURE_STATE_FAILED",
                &format!("Could not read quick capture visibility: {error}"),
            ));
        }
    };

    if is_visible {
        if let Err(error) = window.hide() {
            return Ok(AppResult::err(
                "QUICK_CAPTURE_HIDE_FAILED",
                &format!("Could not hide quick capture: {error}"),
            ));
        }
        return Ok(AppResult::ok(false));
    }

    match show_quick_capture_window(&app) {
        Ok(()) => Ok(AppResult::ok(true)),
        Err((code, message)) => Ok(AppResult::err(code, message)),
    }
}

#[tauri::command]
pub async fn get_quick_capture_status(
    state: tauri::State<'_, AppState>,
) -> Result<AppResult<QuickCaptureStatus>, String> {
    Ok(AppResult::ok(quick_capture_status(&state)))
}

#[tauri::command]
pub async fn configure_quick_capture_shortcut(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    enabled: bool,
    shortcut: String,
) -> Result<AppResult<QuickCaptureStatus>, String> {
    configure_quick_capture_shortcut_inner(&app, &state, enabled, &shortcut);
    Ok(AppResult::ok(quick_capture_status(&state)))
}

#[tauri::command]
pub async fn get_desktop_lifecycle_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<AppResult<DesktopLifecycleStatus>, String> {
    Ok(AppResult::ok(desktop_lifecycle_status(&app, &state)))
}

#[tauri::command]
pub async fn configure_desktop_lifecycle(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    startup_enabled: bool,
    start_minimized_to_tray: bool,
    minimize_to_tray_on_close: bool,
) -> Result<AppResult<DesktopLifecycleStatus>, String> {
    configure_desktop_lifecycle_inner(
        &app,
        &state,
        startup_enabled,
        start_minimized_to_tray,
        minimize_to_tray_on_close,
    );
    Ok(AppResult::ok(desktop_lifecycle_status(&app, &state)))
}

#[tauri::command]
pub async fn show_main_window(app: tauri::AppHandle) -> Result<AppResult<bool>, String> {
    match show_main_window_inner(&app) {
        Ok(()) => Ok(AppResult::ok(true)),
        Err((code, message)) => Ok(AppResult::err(code, message)),
    }
}

#[tauri::command]
pub async fn hide_main_window_to_tray(app: tauri::AppHandle) -> Result<AppResult<bool>, String> {
    match hide_main_window_inner(&app) {
        Ok(()) => Ok(AppResult::ok(false)),
        Err((code, message)) => Ok(AppResult::err(code, message)),
    }
}

#[tauri::command]
pub async fn quit_app(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    *state.quit_requested.lock().expect("quit requested lock") = true;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn request_tray_sync(app: tauri::AppHandle) -> Result<AppResult<bool>, String> {
    let _ = app.emit("tray://sync-projects", ());
    Ok(AppResult::ok(true))
}

pub fn show_quick_capture_window(app: &tauri::AppHandle) -> Result<(), (&'static str, String)> {
    let Some(window) = app.get_webview_window(QUICK_CAPTURE_LABEL) else {
        return Err((
            "QUICK_CAPTURE_NOT_FOUND",
            "The quick capture window is not available.".to_string(),
        ));
    };

    show_focus_window(&window)
}

pub fn show_main_window_inner(app: &tauri::AppHandle) -> Result<(), (&'static str, String)> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err((
            "MAIN_WINDOW_NOT_FOUND",
            "The WorkTrace window is not available.".to_string(),
        ));
    };

    if let Err(error) = window.unminimize() {
        return Err((
            "MAIN_WINDOW_RESTORE_FAILED",
            format!("Could not restore WorkTrace: {error}"),
        ));
    }
    if let Err(error) = window.show() {
        return Err((
            "MAIN_WINDOW_SHOW_FAILED",
            format!("Could not show WorkTrace: {error}"),
        ));
    }
    if let Err(error) = window.set_focus() {
        return Err((
            "MAIN_WINDOW_FOCUS_FAILED",
            format!("Could not focus WorkTrace: {error}"),
        ));
    }
    Ok(())
}

pub fn hide_main_window_inner(app: &tauri::AppHandle) -> Result<(), (&'static str, String)> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err((
            "MAIN_WINDOW_NOT_FOUND",
            "The WorkTrace window is not available.".to_string(),
        ));
    };

    if let Err(error) = window.hide() {
        return Err((
            "MAIN_WINDOW_HIDE_FAILED",
            format!("Could not hide WorkTrace to the tray: {error}"),
        ));
    }
    Ok(())
}

pub fn open_settings_from_tray(app: &tauri::AppHandle) {
    let _ = show_main_window_inner(app);
    let _ = app.emit("tray://open-settings", ());
}

fn show_focus_window(window: &WebviewWindow) -> Result<(), (&'static str, String)> {
    if let Err(error) = window.show() {
        return Err((
            "QUICK_CAPTURE_SHOW_FAILED",
            format!("Could not show quick capture: {error}"),
        ));
    }
    if let Err(error) = window.set_always_on_top(true) {
        return Err((
            "QUICK_CAPTURE_TOPMOST_FAILED",
            format!("Could not keep quick capture on top: {error}"),
        ));
    }
    if let Err(error) = window.set_focus() {
        return Err((
            "QUICK_CAPTURE_FOCUS_FAILED",
            format!("Could not focus quick capture: {error}"),
        ));
    }
    Ok(())
}

pub fn configure_quick_capture_shortcut_inner(
    app: &tauri::AppHandle,
    state: &AppState,
    enabled: bool,
    shortcut: &str,
) {
    let shortcut = shortcut.trim();
    {
        let current = state.quick_capture_shortcut.lock().expect("shortcut lock");
        if !current.is_empty() {
            let _ = app.global_shortcut().unregister(current.as_str());
        }
    }

    *state.quick_capture_enabled.lock().expect("enabled lock") = enabled;
    *state.quick_capture_shortcut.lock().expect("shortcut lock") = shortcut.to_string();

    if !enabled {
        *state
            .quick_capture_shortcut_error
            .lock()
            .expect("shortcut error lock") = None;
        return;
    }

    if shortcut.is_empty() {
        *state
            .quick_capture_shortcut_error
            .lock()
            .expect("shortcut error lock") = Some("Shortcut cannot be empty.".to_string());
        return;
    }

    match app.global_shortcut().register(shortcut) {
        Ok(()) => {
            *state
                .quick_capture_shortcut_error
                .lock()
                .expect("shortcut error lock") = None;
        }
        Err(error) => {
            *state
                .quick_capture_shortcut_error
                .lock()
                .expect("shortcut error lock") = Some(error.to_string());
        }
    }
}

pub fn configure_desktop_lifecycle_inner(
    app: &tauri::AppHandle,
    state: &AppState,
    startup_enabled: bool,
    start_minimized_to_tray: bool,
    minimize_to_tray_on_close: bool,
) {
    *state.startup_enabled.lock().expect("startup enabled lock") = startup_enabled;
    *state
        .start_minimized_to_tray
        .lock()
        .expect("start minimized lock") = start_minimized_to_tray;
    *state
        .minimize_to_tray_on_close
        .lock()
        .expect("minimize to tray lock") = minimize_to_tray_on_close;

    let autostart = app.autolaunch();
    let result = if startup_enabled {
        autostart.enable()
    } else {
        autostart.disable()
    };
    let error = result.err().map(|error| error.to_string()).filter(|message| {
        startup_enabled || !message.contains("os error 2")
    });

    *state
        .desktop_lifecycle_error
        .lock()
        .expect("desktop lifecycle error lock") = error;
}

fn quick_capture_status(state: &AppState) -> QuickCaptureStatus {
    let enabled = *state.quick_capture_enabled.lock().expect("enabled lock");
    let shortcut = state
        .quick_capture_shortcut
        .lock()
        .expect("shortcut lock")
        .clone();
    let last_error = state
        .quick_capture_shortcut_error
        .lock()
        .expect("shortcut error lock")
        .clone();

    QuickCaptureStatus {
        enabled,
        shortcut,
        registered: enabled && last_error.is_none(),
        last_error,
    }
}

fn desktop_lifecycle_status(app: &tauri::AppHandle, state: &AppState) -> DesktopLifecycleStatus {
    let startup_enabled = *state.startup_enabled.lock().expect("startup enabled lock");
    let start_minimized_to_tray = *state
        .start_minimized_to_tray
        .lock()
        .expect("start minimized lock");
    let minimize_to_tray_on_close = *state
        .minimize_to_tray_on_close
        .lock()
        .expect("minimize to tray lock");
    let stored_error = state
        .desktop_lifecycle_error
        .lock()
        .expect("desktop lifecycle error lock")
        .clone();
    let (autostart_registered, last_error) = if startup_enabled {
        match app.autolaunch().is_enabled() {
            Ok(enabled) => (enabled, stored_error),
            Err(error) => (false, Some(error.to_string())),
        }
    } else {
        (false, stored_error)
    };

    DesktopLifecycleStatus {
        startup_enabled,
        start_minimized_to_tray,
        minimize_to_tray_on_close,
        autostart_registered,
        last_error,
    }
}
