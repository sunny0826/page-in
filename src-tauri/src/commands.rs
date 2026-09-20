use crate::dialogs::{choose, Choice};
use crate::{
    document::{Entry, Session, View},
    open_requests, project,
    state::{AppState, Opened},
};
use std::sync::atomic::Ordering;

fn origin_base(id: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("http://pagein-resource.localhost/{id}/")
    } else {
        format!("pagein-resource://localhost/{id}/")
    }
}
pub fn publish(state: &AppState, session: Session) -> Result<Opened, String> {
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
pub async fn open_document(
    locale: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Opened>, String> {
    let Some(path) = choose(app, locale, Choice::Html).await? else {
        return Ok(None);
    };
    publish(&state, open_requests::read_html(&path)?).map(Some)
}
// Paths never cross the IPC boundary: only IDs issued by the native event queue.
#[tauri::command]
pub fn pending_open_request(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state
        .open_requests
        .lock()
        .map_err(|_| "state unavailable")?
        .pending())
}
#[tauri::command]
pub fn dismiss_open_request(
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
pub fn open_requested_document(
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
#[tauri::command]
pub async fn open_project(
    locale: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Opened>, String> {
    let Some(root) = choose(app, locale, Choice::Project).await? else {
        return Ok(None);
    };
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let mut session = open_requests::read_html(&project::entry(&root)?)?;
    session.filename = root
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    session.root = Some(root);
    session.project = true;
    publish(&state, session).map(Some)
}
#[tauri::command]
pub fn open_sample(state: tauri::State<'_, AppState>) -> Result<Opened, String> {
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
pub fn register_manifest(
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
pub fn commit_edit(
    state: tauri::State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
    node_id: String,
    old_text: String,
    new_text: String,
) -> Result<View, String> {
    state.with_session(&session_id, expected_revision, |s| {
        s.commit(&node_id, &old_text, new_text)
    })
}
#[tauri::command]
pub fn undo_edit(
    state: tauri::State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
) -> Result<View, String> {
    state.with_session(&session_id, expected_revision, |s| Ok(s.undo()))
}
#[tauri::command]
pub fn redo_edit(
    state: tauri::State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
) -> Result<View, String> {
    state.with_session(&session_id, expected_revision, |s| Ok(s.redo()))
}
#[tauri::command]
pub fn close_application(app: tauri::AppHandle, state: tauri::State<'_, AppState>) {
    state.approved_exit.store(true, Ordering::SeqCst);
    app.exit(0);
}
#[tauri::command]
pub fn frontend_ready(state: tauri::State<'_, AppState>, user_agent: String) -> f64 {
    let elapsed = state.started.elapsed().as_secs_f64() * 1000.0;
    println!(
        "{}",
        serde_json::json!({"event":"frontend-ready","elapsedMs":state.started.elapsed().as_secs_f64()*1000.0,"userAgent":user_agent})
    );
    elapsed
}
