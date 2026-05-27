pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod interface;

use std::collections::HashSet;
use std::sync::Mutex;

use infrastructure::database::Database;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub struct AppState {
    pub database: Database,
    pub cancelled_report_ai_streams: Mutex<HashSet<String>>,
    pub sparc_force_auth_lock: tokio::sync::Mutex<()>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let database = tauri::async_runtime::block_on(Database::connect(&app_handle))?;

            app.manage(AppState {
                database,
                cancelled_report_ai_streams: Mutex::new(HashSet::new()),
                sparc_force_auth_lock: tokio::sync::Mutex::new(()),
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

            Ok(())
        })
        .invoke_handler(interface::commands::handlers())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
