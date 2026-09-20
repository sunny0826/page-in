use crate::state::AppState;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

pub fn queue_open(app: &tauri::AppHandle, paths: Vec<PathBuf>) {
    let state = app.state::<AppState>();
    let result = state
        .open_requests
        .lock()
        .map_err(|_| "state unavailable".to_string())
        .and_then(|mut requests| requests.push(paths));
    if let Err(error) = result {
        let _ = app.emit("open-request-error", error);
    }
    let _ = app.emit("open-requested", ());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
    // The macOS predefined Quit action calls NSApplication directly.
    // Route our own Quit item through the same frontend transaction guard.
    let quit = MenuItem::with_id(
        app,
        "request-quit",
        "退出 PageIn",
        true,
        Some("CmdOrCtrl+Q"),
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "PageIn",
                true,
                &[&PredefinedMenuItem::close_window(app, None)?, &quit],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
        ],
    )?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == "request-quit" {
            let _ = app.emit("close-requested", ());
        }
    });
    let builder =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("PageIn")
            .inner_size(1120.0, 760.0)
            .min_inner_size(560.0, 400.0)
            .on_navigation(|url| {
                url.as_str() == "about:srcdoc"
                    || url.as_str() == "about:blank"
                    || url.scheme() == "tauri"
                    || url.scheme() == "pagein-preview"
                    || url.host_str() == Some("pagein-preview.localhost")
                    || url.host_str() == Some("tauri.localhost")
                    || (cfg!(debug_assertions)
                        && url.host_str() == Some("127.0.0.1")
                        && url.port() == Some(1420))
            });
    // Keep the native traffic lights and their system behavior while the
    // page fills the window and the editor controls float independently.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);
    let window = builder.build()?;
    let handle = window.clone();
    window.on_window_event(move |event| {
        // WebviewWindow drag/drop is dispatched as WindowEvent by Tauri/Wry.
        if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
            queue_open(handle.app_handle(), paths.clone());
        }
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.emit("close-requested", ());
        }
    });
    Ok(())
}
