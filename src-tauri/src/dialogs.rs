use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;

pub enum Choice {
    Html,
    Project,
    ExportHtml(String),
    ExportProject(String),
}

pub async fn choose(
    app: tauri::AppHandle,
    locale: Option<String>,
    choice: Choice,
) -> Result<Option<PathBuf>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (en, zh) = match &choice {
            Choice::Html => (
                "Open HTML (includes local styles, images and fonts)",
                "打开 HTML（同时允许读取其目录中的样式、图片与字体）",
            ),
            Choice::Project => (
                "Open project folder (index.html)",
                "打开项目文件夹（包含 index.html）",
            ),
            Choice::ExportHtml(_) => (
                "Export edited HTML (original preserved)",
                "导出修改版 HTML（原文件保留）",
            ),
            Choice::ExportProject(_) => (
                "Export entire project to a new folder",
                "整体导出项目到新文件夹",
            ),
        };
        let dialog = app
            .dialog()
            .file()
            .set_title(if locale.as_deref() == Some("en") {
                en
            } else {
                zh
            });
        let picked = match choice {
            Choice::Html => dialog
                .add_filter("HTML", &["html", "htm"])
                .blocking_pick_file(),
            Choice::Project => dialog.blocking_pick_folder(),
            Choice::ExportHtml(name) => dialog
                .set_file_name(name)
                .add_filter("HTML", &["html"])
                .blocking_save_file(),
            Choice::ExportProject(name) => dialog.set_file_name(name).blocking_save_file(),
        };
        picked
            .map(|file| file.into_path().map_err(|e| e.to_string()))
            .transpose()
    })
    .await
    .map_err(|e| e.to_string())?
}
