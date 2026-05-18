pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod interface;

use infrastructure::database::Database;
use tauri::Manager;

pub struct AppState {
    pub database: Database,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let database = tauri::async_runtime::block_on(Database::connect(&app_handle))?;

            app.manage(AppState { database });

            Ok(())
        })
        .invoke_handler(interface::commands::handlers())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
