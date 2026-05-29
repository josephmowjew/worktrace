pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod interface;

use std::collections::HashSet;
use std::sync::Mutex;

use domain::settings::UpdateSettingsInput;
use infrastructure::database::repositories::SettingsRepository;
use infrastructure::database::Database;
use interface::commands::windows::{
    configure_desktop_lifecycle_inner, configure_quick_capture_shortcut_inner,
    hide_main_window_inner, open_settings_from_tray, show_main_window_inner,
    show_quick_capture_window, show_todo_widget, QUICK_CAPTURE_LABEL,
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;

pub struct AppState {
    pub database: Database,
    pub cancelled_report_ai_streams: Mutex<HashSet<String>>,
    pub git_sync_lock: tokio::sync::Mutex<()>,
    pub sparc_force_auth_lock: tokio::sync::Mutex<()>,
    pub google_calendar_auth_lock: tokio::sync::Mutex<()>,
    pub quick_capture_enabled: Mutex<bool>,
    pub quick_capture_shortcut: Mutex<String>,
    pub quick_capture_shortcut_error: Mutex<Option<String>>,
    pub startup_enabled: Mutex<bool>,
    pub start_minimized_to_tray: Mutex<bool>,
    pub minimize_to_tray_on_close: Mutex<bool>,
    pub desktop_lifecycle_error: Mutex<Option<String>>,
    pub quit_requested: Mutex<bool>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = show_quick_capture_window(app);
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let Some(state) = app.try_state::<AppState>() else {
                    return;
                };
                let quit_requested = *state.quit_requested.lock().expect("quit requested lock");
                let minimize_to_tray = *state
                    .minimize_to_tray_on_close
                    .lock()
                    .expect("minimize to tray lock");

                if minimize_to_tray && !quit_requested {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let launched_in_background = std::env::args().any(|arg| arg == "--background");
            let app_handle = app.handle().clone();
            let database = tauri::async_runtime::block_on(Database::connect(&app_handle))?;
            let settings =
                tauri::async_runtime::block_on(SettingsRepository::new(database.pool()).get())
                    .unwrap_or_default();

            app.manage(AppState {
                database,
                cancelled_report_ai_streams: Mutex::new(HashSet::new()),
                git_sync_lock: tokio::sync::Mutex::new(()),
                sparc_force_auth_lock: tokio::sync::Mutex::new(()),
                google_calendar_auth_lock: tokio::sync::Mutex::new(()),
                quick_capture_enabled: Mutex::new(settings.quick_capture_enabled),
                quick_capture_shortcut: Mutex::new(settings.quick_capture_shortcut.clone()),
                quick_capture_shortcut_error: Mutex::new(None),
                startup_enabled: Mutex::new(settings.startup_enabled),
                start_minimized_to_tray: Mutex::new(settings.start_minimized_to_tray),
                minimize_to_tray_on_close: Mutex::new(settings.minimize_to_tray_on_close),
                desktop_lifecycle_error: Mutex::new(None),
                quit_requested: Mutex::new(false),
            });

            setup_tray(app, settings.startup_enabled)?;

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

            WebviewWindowBuilder::new(
                app,
                QUICK_CAPTURE_LABEL,
                WebviewUrl::App("/quick-capture".into()),
            )
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
                configure_desktop_lifecycle_inner(
                    &app_handle,
                    &state,
                    settings.startup_enabled,
                    settings.start_minimized_to_tray,
                    settings.minimize_to_tray_on_close,
                );
            }

            if launched_in_background && settings.start_minimized_to_tray {
                let _ = hide_main_window_inner(&app_handle);
            }

            Ok(())
        })
        .invoke_handler(interface::commands::handlers())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_tray(app: &mut tauri::App, startup_enabled: bool) -> tauri::Result<()> {
    let open_i = MenuItem::with_id(app, "open", "Open WorkTrace", true, None::<&str>)?;
    let quick_capture_i =
        MenuItem::with_id(app, "quick-capture", "Quick Capture", true, None::<&str>)?;
    let widget_i = MenuItem::with_id(app, "todo-widget", "Show Todo Widget", true, None::<&str>)?;
    let sync_i = MenuItem::with_id(app, "sync-projects", "Sync Projects", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let startup_i = CheckMenuItem::with_id(
        app,
        "start-with-windows",
        "Start with Windows",
        true,
        startup_enabled,
        None::<&str>,
    )?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let separator_a = PredefinedMenuItem::separator(app)?;
    let separator_b = PredefinedMenuItem::separator(app)?;
    let separator_c = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &open_i,
            &quick_capture_i,
            &widget_i,
            &separator_a,
            &sync_i,
            &settings_i,
            &separator_b,
            &startup_i,
            &separator_c,
            &quit_i,
        ],
    )?;
    let startup_item = startup_i.clone();

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("WorkTrace")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main_window_inner(tray.app_handle());
            }
        })
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => {
                let _ = show_main_window_inner(app);
            }
            "quick-capture" => {
                let _ = show_quick_capture_window(app);
            }
            "todo-widget" => {
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = show_todo_widget(app_handle).await;
                });
            }
            "sync-projects" => {
                let _ = app.emit("tray://sync-projects", ());
            }
            "settings" => {
                open_settings_from_tray(app);
            }
            "start-with-windows" => {
                if let Some(state) = app.try_state::<AppState>() {
                    let enabled = !*state.startup_enabled.lock().expect("startup enabled lock");
                    let start_minimized = *state
                        .start_minimized_to_tray
                        .lock()
                        .expect("start minimized lock");
                    let close_to_tray = *state
                        .minimize_to_tray_on_close
                        .lock()
                        .expect("minimize to tray lock");
                    configure_desktop_lifecycle_inner(
                        app,
                        &state,
                        enabled,
                        start_minimized,
                        close_to_tray,
                    );
                    let repository = SettingsRepository::new(state.database.pool());
                    let _ =
                        tauri::async_runtime::block_on(repository.update(UpdateSettingsInput {
                            startup_enabled: Some(enabled),
                            ..Default::default()
                        }));
                    let _ = startup_item.set_checked(enabled);
                    let _ = app.emit("tray://lifecycle-changed", ());
                }
            }
            "quit" => {
                if let Some(state) = app.try_state::<AppState>() {
                    *state.quit_requested.lock().expect("quit requested lock") = true;
                }
                app.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}
