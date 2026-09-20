fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "open_document",
            "pending_open_request",
            "open_requested_document",
            "dismiss_open_request",
            "open_project",
            "open_sample",
            "register_manifest",
            "commit_edit",
            "undo_edit",
            "redo_edit",
            "export_document",
            "close_application",
            "frontend_ready",
            "prepare_preview",
        ]),
    ))
    .expect("tauri build failed");
}
