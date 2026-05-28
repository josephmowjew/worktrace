pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod interface;

use std::collections::HashSet;
use std::sync::Mutex;

use infrastructure::database::Database;
use infrastructure::database::repositories::SettingsRepository;
use interface::commands::windows::{
    configure_quick_capture_shortcut_inner, show_quick_capture_window, QUICK_CAPTURE_LABEL,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::ShortcutState;

pub struct AppState {
    pub database: Database,
    pub cancelled_report_ai_streams: Mutex<HashSet<String>>,
    pub sparc_force_auth_lock: tokio::sync::Mutex<()>,
    pub quick_capture_enabled: Mutex<bool>,
    pub quick_capture_shortcut: Mutex<String>,
    pub quick_capture_shortcut_error: Mutex<Option<String>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = show_quick_capture_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let app_handle = app.handle().clone();
            let database = tauri::async_runtime::block_on(Database::connect(&app_handle))?;
            let settings =
                tauri::async_runtime::block_on(SettingsRepository::new(database.pool()).get())
                    .unwrap_or_default();

            app.manage(AppState {
                database,
                cancelled_report_ai_streams: Mutex::new(HashSet::new()),
                sparc_force_auth_lock: tokio::sync::Mutex::new(()),
                quick_capture_enabled: Mutex::new(settings.quick_capture_enabled),
                quick_capture_shortcut: Mutex::new(settings.quick_capture_shortcut.clone()),
                quick_capture_shortcut_error: Mutex::new(None),
            });

            WebviewWindowBuilder::new(app, "widget", WebviewUrl::App("/widget".into()))
                .title("WorkTrace Todo")
                .inner_size(360.0, 520.0)
                .min_inner_size(280.0, 240.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(true)
                .focused(false)
                .visible(false)
                .prevent_overflow()
                .build()?;

            WebviewWindowBuilder::new(app, QUICK_CAPTURE_LABEL, WebviewUrl::App("/quick-capture".into()))
                .title("WorkTrace Quick Capture")
                .inner_size(560.0, 390.0)
                .min_inner_size(480.0, 340.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .focused(false)
                .visible(false)
                .prevent_overflow()
                .build()?;

            if let Some(state) = app.try_state::<AppState>() {
                configure_quick_capture_shortcut_inner(
                    &app_handle,
                    &state,
                    settings.quick_capture_enabled,
                    &settings.quick_capture_shortcut,
                );
            }

            Ok(())
        })
        .invoke_handler(interface::commands::handlers())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
