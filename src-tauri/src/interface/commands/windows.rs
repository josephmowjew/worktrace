use tauri::Manager;

use crate::interface::dto::app_result::AppResult;

const TODO_WIDGET_LABEL: &str = "widget";

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
