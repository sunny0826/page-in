use crate::{
    dialogs::{choose, Choice},
    document::Session,
    project,
    state::AppState,
};
use std::{io::Write, path::PathBuf};

// Snapshot before the dialog, stage without the session lock, recheck at publish.
struct Export {
    original: String,
    edited: String,
    origin: Option<PathBuf>,
    root: Option<PathBuf>,
}
impl Export {
    fn snapshot(s: &Session) -> Result<(Self, Choice), String> {
        let stem = std::path::Path::new(&s.filename)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();
        let choice = if s.project {
            Choice::ExportProject(format!("{}-edited", s.filename))
        } else {
            Choice::ExportHtml(format!("{stem}-edited.html"))
        };
        Ok((
            Self {
                original: s.source.clone(),
                edited: s.export(),
                origin: s.path.clone(),
                root: if s.project {
                    Some(s.root.clone().ok_or("no project root")?)
                } else {
                    None
                },
            },
            choice,
        ))
    }
    fn stage(self, path: &std::path::Path) -> Result<Staged, String> {
        let parent = path.parent().ok_or("invalid destination")?;
        if let Some(root) = self.root {
            let parent = parent.canonicalize().map_err(|e| e.to_string())?;
            if parent.starts_with(&root) {
                return Err("请将项目导出到原项目之外的新文件夹".into());
            }
            if path.exists() {
                return Err("导出只创建新目录，请使用一个未存在的目录名".into());
            }
            let staging = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
            project::stage(
                &root,
                &self.origin.ok_or("no entry")?,
                &self.original,
                &self.edited,
                staging.path(),
            )?;
            Ok(Staged::Project(staging))
        } else {
            if path.exists() || self.origin.as_deref() == Some(path) {
                return Err("导出只创建新文件，请使用一个未存在的文件名".into());
            }
            let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
            temp.write_all(self.edited.as_bytes())
                .map_err(|e| e.to_string())?;
            temp.as_file().sync_all().map_err(|e| e.to_string())?;
            Ok(Staged::Html(temp))
        }
    }
}
enum Staged {
    Html(tempfile::NamedTempFile),
    Project(tempfile::TempDir),
}
impl Staged {
    fn publish(self, path: &std::path::Path) -> Result<(), String> {
        match self {
            Self::Html(file) => file
                .persist_noclobber(path)
                .map(|_| ())
                .map_err(|e| e.to_string()),
            Self::Project(directory) => project::publish(directory.path(), path),
        }
    }
}
#[tauri::command]
pub async fn export_document(
    locale: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
) -> Result<Option<String>, String> {
    let (export, choice) =
        state.with_session(&session_id, expected_revision, |s| Export::snapshot(s))?;
    let Some(path) = choose(app, locale, choice).await? else {
        return Ok(None);
    };
    let destination = path.clone();
    let staged = tauri::async_runtime::spawn_blocking(move || export.stage(&destination))
        .await
        .map_err(|e| e.to_string())??;
    state.with_session(&session_id, expected_revision, |s| {
        staged.publish(&path)?;
        s.mark_exported();
        Ok(Some(path.to_string_lossy().into_owned()))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn snapshot(root: &std::path::Path, project: bool) -> Export {
        let source = "\u{feff}<h1>中文 😀 &amp;</h1>\r\n";
        let entry = root.join("index.html");
        fs::write(&entry, source).unwrap();
        let mut session = Session::new(
            source.into(),
            Some(entry),
            Some(root.into()),
            "index.html".into(),
        );
        session.project = project;
        Export::snapshot(&session).unwrap().0
    }
    #[test]
    fn staging_preserves_bytes_and_publish_refuses_existing_targets() {
        for project in [false, true] {
            let source = tempfile::tempdir().unwrap();
            let output = tempfile::tempdir().unwrap();
            let destination = output.path().join("edited");
            let export = snapshot(source.path(), project);
            let original = export.original.clone();
            export
                .stage(&destination)
                .unwrap()
                .publish(&destination)
                .unwrap();
            let file = if project {
                destination.join("index.html")
            } else {
                destination.clone()
            };
            assert_eq!(fs::read(&file).unwrap(), original.as_bytes());
            assert!(snapshot(source.path(), project)
                .stage(&destination)
                .is_err());
            assert_eq!(fs::read(&file).unwrap(), original.as_bytes());
        }
    }
    #[test]
    fn concurrent_destination_creation_does_not_overwrite() {
        for project in [false, true] {
            let source = tempfile::tempdir().unwrap();
            let output = tempfile::tempdir().unwrap();
            let destination = output.path().join("occupied");
            let staged = snapshot(source.path(), project)
                .stage(&destination)
                .unwrap();
            fs::write(&destination, "keep").unwrap();
            assert!(staged.publish(&destination).is_err());
            assert_eq!(fs::read_to_string(destination).unwrap(), "keep");
        }
    }
    #[test]
    fn project_rejects_internal_destination_and_changed_entry() {
        let root = tempfile::tempdir().unwrap();
        let output = tempfile::tempdir().unwrap();
        assert!(snapshot(root.path(), true)
            .stage(&root.path().join("edited"))
            .is_err());
        let export = snapshot(root.path(), true);
        fs::write(root.path().join("index.html"), "externally changed").unwrap();
        assert!(export.stage(&output.path().join("edited")).is_err());
    }
}
