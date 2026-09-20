#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod commands;
mod desktop;
mod dialogs;
mod document;
mod export;
mod open_requests;
mod preview;
mod project;
mod resources;
mod state;

use commands::*;
use desktop::queue_open;
use export::export_document;
use state::{AppState, Shared};
use std::{
    fs,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Instant,
};
use tauri::{Emitter, Manager};

fn main() {
    let shared: Shared = Arc::new(Mutex::new(None));
    let resources = shared.clone();
    let previews = shared.clone();
    let mut requests = open_requests::OpenRequests::default();
    if let Ok(cwd) = std::env::current_dir() {
        let _ = requests.push(open_requests::argument_paths(std::env::args(), &cwd));
    }
    tauri::Builder::default()
        .manage(AppState {
            session: shared,
            staged: Mutex::new(None),
            open_requests: Mutex::new(requests),
            started: Instant::now(),
            approved_exit: AtomicBool::new(false),
        })
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            queue_open(
                app,
                open_requests::argument_paths(args, std::path::Path::new(&cwd)),
            );
        }))
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("pagein-preview", move |_ctx, request| {
            let bytes = (|| {
                let path = request.uri().path().trim_start_matches('/');
                let (token, filename) = path.split_once('/')?;
                if filename != "index.html" {
                    return None;
                }
                let lock = previews.lock().ok()?;
                let session = lock.as_ref()?;
                session.preview.as_ref()?.read(token, session.revision)
            })();
            tauri::http::Response::builder()
                .status(if bytes.is_some() { 200 } else { 403 })
                .header("Content-Type", "text/html; charset=utf-8")
                .header("Content-Security-Policy", preview::CSP)
                .header("X-Content-Type-Options", "nosniff")
                .header("Cache-Control", "no-store")
                .body(bytes.unwrap_or_default())
                .unwrap()
        })
        .register_uri_scheme_protocol("pagein-resource", move |_ctx, request| {
            let result = (|| -> Result<(Vec<u8>, &str), String> {
                let uri = request.uri().path().trim_start_matches('/');
                let (id, relative) = uri.split_once('/').ok_or("invalid resource")?;
                let root = {
                    let lock = resources.lock().map_err(|_| "state unavailable")?;
                    let s = lock.as_ref().ok_or("no document")?;
                    if id != s.id {
                        return Err("SessionExpired".into());
                    }
                    s.root.clone().ok_or("no resource directory")?
                };
                let (path, mime) = resources::resolve(&root, relative)?;
                let bytes = fs::read(path).map_err(|_| "resource unavailable")?;
                Ok((bytes, mime))
            })();
            match result {
                Ok((bytes, mime)) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", mime)
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Content-Security-Policy", "default-src 'none'; sandbox")
                    .body(bytes)
                    .unwrap(),
                Err(_) => tauri::http::Response::builder()
                    .status(403)
                    .header("Content-Type", "text/plain")
                    .body(b"resource unavailable".to_vec())
                    .unwrap(),
            }
        })
        .setup(desktop::setup)
        .invoke_handler(tauri::generate_handler![
            open_document,
            pending_open_request,
            open_requested_document,
            dismiss_open_request,
            open_project,
            open_sample,
            register_manifest,
            commit_edit,
            undo_edit,
            redo_edit,
            export_document,
            close_application,
            frontend_ready,
            preview::prepare_preview
        ])
        .build(tauri::generate_context!())
        .expect("error building PageIn")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                queue_open(
                    app,
                    urls.iter()
                        .filter_map(|url| url.to_file_path().ok())
                        .collect(),
                );
            }
            // Menu Quit / Cmd+Q must take the same unsaved-change path as closing.
            // Menu Quit can also use code Some(0); use an explicit confirmation flag.
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !app.state::<AppState>().approved_exit.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    let _ = app.emit("close-requested", ());
                }
            }
        });
}
