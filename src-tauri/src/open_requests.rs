use crate::document::{self, Session};
use std::{
    collections::VecDeque,
    fs,
    path::{Path, PathBuf},
};

#[derive(Default)]
pub struct OpenRequests {
    queue: VecDeque<(String, Vec<PathBuf>)>,
}

impl OpenRequests {
    pub fn push(&mut self, paths: Vec<PathBuf>) -> Result<(), String> {
        if paths.is_empty() {
            return Ok(());
        }
        if self.queue.len() >= 32 {
            return Err("打开请求过多，请稍后重试".into());
        }
        self.queue
            .push_back((uuid::Uuid::new_v4().to_string(), paths));
        Ok(())
    }

    pub fn pending(&self) -> Option<String> {
        self.queue.front().map(|(id, _)| id.clone())
    }

    pub fn path(&self, id: &str) -> Result<PathBuf, String> {
        let (current, paths) = self.queue.front().ok_or("打开请求已失效")?;
        if current != id {
            return Err("打开请求已失效".into());
        }
        if paths.len() != 1 {
            return Err("请一次只打开一个 HTML 文件".into());
        }
        Ok(paths[0].clone())
    }

    pub fn dismiss(&mut self, id: &str) {
        if self.queue.front().is_some_and(|(current, _)| current == id) {
            self.queue.pop_front();
        }
    }
}

// Relative paths belong to the process that sent them, not the running app's cwd.
pub fn argument_paths(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<PathBuf> {
    args.into_iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .map(|arg| {
            if arg.starts_with("file:") {
                if let Some(path) = tauri::Url::parse(&arg)
                    .ok()
                    .and_then(|url| url.to_file_path().ok())
                {
                    return path;
                }
            }
            cwd.join(arg)
        })
        .collect()
}

pub fn read_html(path: &Path) -> Result<Session, String> {
    if !path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm"))
    {
        return Err("请选择 HTML 文件".into());
    }
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > document::MAX_SOURCE as u64 {
        return Err("只打开不超过 5 MiB 的 HTML 文件".into());
    }
    let source = document::valid_source(fs::read(&path).map_err(|e| e.to_string())?)?;
    let filename = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let root = path.parent().map(PathBuf::from);
    Ok(Session::new(source, Some(path), root, filename))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requests_require_the_front_token_and_survive_until_dismissed() {
        let mut queue = OpenRequests::default();
        queue.push(vec!["a.html".into()]).unwrap();
        let first = queue.pending().unwrap();
        queue.push(vec!["b.html".into()]).unwrap();
        assert!(queue.path("forged").is_err());
        queue.dismiss("forged");
        assert_eq!(queue.path(&first).unwrap(), PathBuf::from("a.html"));
        queue.dismiss(&first);
        assert!(queue.path(&first).is_err());
        let second = queue.pending().unwrap();
        assert_eq!(queue.path(&second).unwrap(), PathBuf::from("b.html"));
        queue.dismiss(&second);
        assert!(queue.pending().is_none());
    }

    #[test]
    fn batches_and_queue_limit_are_explicit() {
        let mut queue = OpenRequests::default();
        queue.push(vec![]).unwrap();
        assert!(queue.pending().is_none());
        queue.push(vec!["a.html".into(), "b.html".into()]).unwrap();
        assert!(queue.path(&queue.pending().unwrap()).is_err());
        for _ in 1..32 {
            queue.push(vec!["a.html".into()]).unwrap();
        }
        assert!(queue.push(vec!["overflow.html".into()]).is_err());
    }

    #[test]
    fn arguments_preserve_spaces_unicode_and_file_urls() {
        let cwd = std::env::temp_dir();
        let file = cwd.join("中文 space.html");
        let url = tauri::Url::from_file_path(&file).unwrap().to_string();
        assert_eq!(
            argument_paths(
                vec![
                    "pagein".into(),
                    "--flag".into(),
                    "中文 space.html".into(),
                    url
                ],
                &cwd
            ),
            vec![file.clone(), file]
        );
    }

    #[test]
    fn reads_html_without_changing_bytes_and_rejects_invalid_inputs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("中文 space.HTM");
        let bytes = "\u{feff}<h1>中文 😀</h1>\r\n";
        fs::write(&path, bytes).unwrap();
        let session = read_html(&path).unwrap();
        assert_eq!(session.source.as_bytes(), bytes.as_bytes());
        assert_eq!(session.root.unwrap(), dir.path().canonicalize().unwrap());
        assert!(!session.project);
        assert_eq!(fs::read(&path).unwrap(), bytes.as_bytes());
        fs::write(&path, [0xff]).unwrap();
        assert!(read_html(&path).is_err());
        fs::write(&path, vec![b'a'; document::MAX_SOURCE + 1]).unwrap();
        assert!(read_html(&path).is_err());
        assert!(read_html(&dir.path().join("missing.html")).is_err());
        assert!(read_html(dir.path()).is_err());
        let txt = dir.path().join("file.txt");
        fs::write(&txt, "<h1>text</h1>").unwrap();
        assert!(read_html(&txt).is_err());
    }
}
