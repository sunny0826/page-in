fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "open_document",
            "open_project",
            "open_sample",
            "register_manifest",
            "commit_edit",
            "undo_edit",
            "redo_edit",
            "export_document",
            "close_application",
            "frontend_ready",
        ]),
    ))
    .expect("tauri build failed");
}
