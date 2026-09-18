#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod document;
mod open_requests;
mod project;
mod resources;

use document::{Entry, Session, View};
use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Instant,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

type Shared = Arc<Mutex<Option<Session>>>;
struct AppState {
    session: Shared,
    staged: Mutex<Option<Session>>,
    open_requests: Mutex<open_requests::OpenRequests>,
    started: Instant,
    approved_exit: AtomicBool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Opened {
    session_id: String,
    filename: String,
    source: String,
    resource_base: String,
    project: bool,
}

fn origin_base(id: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("http://pagein-resource.localhost/{id}/")
    } else {
        format!("pagein-resource://localhost/{id}/")
    }
}
fn publish(state: &AppState, session: Session) -> Result<Opened, String> {
    let data = Opened {
        session_id: session.id.clone(),
        filename: session.filename.clone(),
        source: session.source.clone(),
        resource_base: origin_base(&session.id),
        project: session.project,
    };
    *state.staged.lock().map_err(|_| "state unavailable")? = Some(session);
    Ok(data)
}
#[tauri::command]
async fn open_document(
    locale: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Opened>, String> {
    let path = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title(if locale.as_deref() == Some("en") {
                "Open HTML (includes local styles, images and fonts)"
            } else {
                "打开 HTML（同时允许读取其目录中的样式、图片与字体）"
            })
            .add_filter("HTML", &["html", "htm"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = path else { return Ok(None) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    publish(&state, open_requests::read_html(&path)?).map(Some)
}
// Paths never cross the IPC boundary: only IDs issued by the native event queue.
#[tauri::command]
fn pending_open_request(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state
        .open_requests
        .lock()
        .map_err(|_| "state unavailable")?
        .pending())
}
#[tauri::command]
fn dismiss_open_request(
    state: tauri::State<'_, AppState>,
    request_id: String,
) -> Result<(), String> {
    state
        .open_requests
        .lock()
        .map_err(|_| "state unavailable")?
        .dismiss(&request_id);
    Ok(())
}
#[tauri::command]
fn open_requested_document(
    state: tauri::State<'_, AppState>,
    request_id: String,
) -> Result<Opened, String> {
    let path = state
        .open_requests
        .lock()
        .map_err(|_| "state unavailable")?
        .path(&request_id)?;
    publish(&state, open_requests::read_html(&path)?)
}
fn queue_open(app: &tauri::AppHandle, paths: Vec<PathBuf>) {
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
#[tauri::command]
async fn open_project(
    locale: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Opened>, String> {
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title(if locale.as_deref() == Some("en") {
                "Open project folder (index.html)"
            } else {
                "打开项目文件夹（包含 index.html）"
            })
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let root = chosen
        .into_path()
        .map_err(|e| e.to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let path = project::entry(&root)?;
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > document::MAX_SOURCE as u64 {
        return Err("只打开不超过 5 MiB 的 HTML 文件".into());
    }
    let source = document::valid_source(fs::read(&path).map_err(|e| e.to_string())?)?;
    let name = root
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let mut session = Session::new(source, Some(path), Some(root), name);
    session.project = true;
    publish(&state, session).map(Some)
}
#[tauri::command]
fn open_sample(state: tauri::State<'_, AppState>) -> Result<Opened, String> {
    publish(
        &state,
        Session::new(
            include_str!("../../tests/fixtures/self-contained.html").into(),
            None,
            None,
            "sample.html".into(),
        ),
    )
}
#[tauri::command]
fn register_manifest(
    state: tauri::State<'_, AppState>,
    session_id: String,
    entries: Vec<Entry>,
) -> Result<View, String> {
    let mut staged = state.staged.lock().map_err(|_| "state unavailable")?;
    let s = staged.as_mut().ok_or("no staged document")?;
    s.check(&session_id, 0)?;
    let view = s.register(entries)?;
    *state.session.lock().map_err(|_| "state unavailable")? = staged.take();
    Ok(view)
}
#[tauri::command]
fn commit_edit(
    state: tauri::State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
    node_id: String,
    old_text: String,
    new_text: String,
) -> Result<View, String> {
    let mut lock = state.session.lock().map_err(|_| "state unavailable")?;
    let s = lock.as_mut().ok_or("no document")?;
    s.check(&session_id, expected_revision)?;
    s.commit(&node_id, &old_text, new_text)
}
#[tauri::command]
fn undo_edit(
    state: tauri::State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
) -> Result<View, String> {
    let mut lock = state.session.lock().map_err(|_| "state unavailable")?;
    let s = lock.as_mut().ok_or("no document")?;
    s.check(&session_id, expected_revision)?;
    Ok(s.undo())
}
#[tauri::command]
fn redo_edit(
    state: tauri::State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
) -> Result<View, String> {
    let mut lock = state.session.lock().map_err(|_| "state unavailable")?;
    let s = lock.as_mut().ok_or("no document")?;
    s.check(&session_id, expected_revision)?;
    Ok(s.redo())
}
#[tauri::command]
async fn export_document(
    locale: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
) -> Result<Option<String>, String> {
    let project_data = {
        let lock = state.session.lock().map_err(|_| "state unavailable")?;
        let s = lock.as_ref().ok_or("no document")?;
        s.check(&session_id, expected_revision)?;
        if s.project {
            Some((
                s.root.clone().ok_or("no project root")?,
                s.path.clone().ok_or("no entry")?,
                s.source.clone(),
                s.export(),
                s.filename.clone(),
            ))
        } else {
            None
        }
    };
    if let Some((root, entry, original, edited, name)) = project_data {
        let chosen = tauri::async_runtime::spawn_blocking(move || {
            app.dialog()
                .file()
                .set_title(if locale.as_deref() == Some("en") {
                    "Export entire project to a new folder"
                } else {
                    "整体导出项目到新文件夹"
                })
                .set_file_name(format!("{name}-edited"))
                .blocking_save_file()
        })
        .await
        .map_err(|e| e.to_string())?;
        let Some(chosen) = chosen else {
            return Ok(None);
        };
        let path = chosen.into_path().map_err(|e| e.to_string())?;
        let parent = path
            .parent()
            .ok_or("invalid destination")?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if parent.starts_with(&root) {
            return Err("请将项目导出到原项目之外的新文件夹".into());
        }
        if path.exists() {
            return Err("导出只创建新目录，请使用一个未存在的目录名".into());
        }
        let staging = tauri::async_runtime::spawn_blocking(move || {
            let staging = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
            project::stage(&root, &entry, &original, &edited, staging.path())?;
            Ok::<_, String>(staging)
        })
        .await
        .map_err(|e| e.to_string())??;
        let mut lock = state.session.lock().map_err(|_| "state unavailable")?;
        let s = lock.as_mut().ok_or("no document")?;
        s.check(&session_id, expected_revision)?;
        project::publish(staging.path(), &path)?;
        s.mark_exported();
        return Ok(Some(path.to_string_lossy().into_owned()));
    }
    let (source, origin, name) = {
        let lock = state.session.lock().map_err(|_| "state unavailable")?;
        let s = lock.as_ref().ok_or("no document")?;
        s.check(&session_id, expected_revision)?;
        let stem = std::path::Path::new(&s.filename)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();
        (s.export(), s.path.clone(), format!("{stem}-edited.html"))
    };
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title(if locale.as_deref() == Some("en") {
                "Export edited HTML (original preserved)"
            } else {
                "导出修改版 HTML（原文件保留）"
            })
            .set_file_name(name)
            .add_filter("HTML", &["html"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let path = chosen.into_path().map_err(|e| e.to_string())?;
    // The spike never overwrites any existing file, so a cancelled replacement cannot lose data.
    if path.exists() || origin.as_ref() == Some(&path) {
        return Err("导出只创建新文件，请使用一个未存在的文件名".into());
    }
    let parent = path.parent().ok_or("invalid destination")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(source.as_bytes())
        .map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    let mut lock = state.session.lock().map_err(|_| "state unavailable")?;
    let s = lock.as_mut().ok_or("no document")?;
    s.check(&session_id, expected_revision)?;
    temp.persist_noclobber(&path).map_err(|e| e.to_string())?;
    s.mark_exported();
    Ok(Some(path.to_string_lossy().into_owned()))
}
#[tauri::command]
fn close_application(app: tauri::AppHandle, state: tauri::State<'_, AppState>) {
    state.approved_exit.store(true, Ordering::SeqCst);
    app.exit(0);
}
#[tauri::command]
fn frontend_ready(state: tauri::State<'_, AppState>, user_agent: String) -> f64 {
    let elapsed = state.started.elapsed().as_secs_f64() * 1000.0;
    println!(
        "{}",
        serde_json::json!({"event":"frontend-ready","elapsedMs":state.started.elapsed().as_secs_f64()*1000.0,"userAgent":user_agent})
    );
    elapsed
}

fn main() {
    let shared: Shared = Arc::new(Mutex::new(None));
    let resources = shared.clone();
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
        .setup(|app| {
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
            let builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("PageIn")
            .inner_size(1120.0, 760.0)
            .min_inner_size(560.0, 400.0)
            .on_navigation(|url| {
                url.as_str() == "about:srcdoc"
                    || url.as_str() == "about:blank"
                    || url.scheme() == "tauri"
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
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) =
                    event
                {
                    queue_open(handle.app_handle(), paths.clone());
                }
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = handle.emit("close-requested", ());
                }
            });
            Ok(())
        })
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
            frontend_ready
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
