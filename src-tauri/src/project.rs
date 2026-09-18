use std::{
    fs,
    path::{Path, PathBuf},
};

const MAX_FILES: usize = 10_000;
const MAX_BYTES: u64 = 512 * 1024 * 1024;

pub fn entry(root: &Path) -> Result<PathBuf, String> {
    for name in ["index.html", "index.htm"] {
        let path = root.join(name);
        if path.is_file() && !path.is_symlink() {
            return Ok(path);
        }
    }
    Err("项目文件夹中需要有 index.html 或 index.htm".into())
}

// Stage the complete tree before publishing an export. Never follow symlinks:
// project export must neither read outside the chosen root nor omit files silently.
pub fn stage(
    root: &Path,
    source_path: &Path,
    original: &str,
    edited: &str,
    staging: &Path,
) -> Result<(), String> {
    if fs::read(source_path).map_err(|e| e.to_string())? != original.as_bytes() {
        return Err("原 HTML 已被外部修改，请重新打开项目后再导出".into());
    }
    let mut budget = (0usize, 0u64);
    fn copy(
        from: &Path,
        to: &Path,
        entry: &Path,
        edited: &str,
        budget: &mut (usize, u64),
        depth: usize,
    ) -> Result<(), String> {
        if depth > 64 {
            return Err("项目目录层级过深".into());
        }
        for item in fs::read_dir(from).map_err(|e| e.to_string())? {
            let item = item.map_err(|e| e.to_string())?;
            let path = item.path();
            let target = to.join(item.file_name());
            let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            budget.0 += 1;
            if budget.0 > MAX_FILES {
                return Err("项目最多包含 10,000 个文件和目录".into());
            }
            if meta.is_symlink() || (!meta.is_file() && !meta.is_dir()) {
                return Err(format!(
                    "项目包含不支持的链接或特殊文件：{}",
                    path.display()
                ));
            }
            if meta.is_dir() {
                fs::create_dir(&target).map_err(|e| e.to_string())?;
                copy(&path, &target, entry, edited, budget, depth + 1)?;
            } else {
                budget.1 += if path == entry {
                    edited.len() as u64
                } else {
                    meta.len()
                };
                if budget.1 > MAX_BYTES {
                    return Err("项目导出上限为 512 MiB".into());
                }
                if path == entry {
                    fs::write(&target, edited).map_err(|e| e.to_string())?;
                } else {
                    fs::copy(&path, &target).map_err(|e| e.to_string())?;
                }
            }
        }
        Ok(())
    }
    copy(root, staging, source_path, edited, &mut budget, 0)
}

pub fn publish(staging: &Path, destination: &Path) -> Result<(), String> {
    // Reserve exclusively: rename alone may overwrite an existing empty directory.
    fs::create_dir(destination).map_err(|_| "导出只创建新目录，请使用一个未存在的目录名")?;
    let result = (|| {
        for item in fs::read_dir(staging).map_err(|e| e.to_string())? {
            let item = item.map_err(|e| e.to_string())?;
            fs::rename(item.path(), destination.join(item.file_name()))
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(destination);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn complete_export_preserves_other_files_and_empty_directories() {
        let root = tempfile::tempdir().unwrap();
        let out = tempfile::tempdir().unwrap();
        let staging = tempfile::tempdir_in(out.path()).unwrap();
        fs::create_dir(root.path().join("assets")).unwrap();
        fs::create_dir(root.path().join("images")).unwrap();
        fs::write(
            root.path().join("index.html"),
            "<h1>原文</h1><script>play()</script>",
        )
        .unwrap();
        fs::write(root.path().join("slides.html"), "alternate source").unwrap();
        fs::write(root.path().join("assets/a.bin"), [0, 255, 23]).unwrap();
        let path = entry(root.path()).unwrap();
        stage(
            root.path(),
            &path,
            "<h1>原文</h1><script>play()</script>",
            "<h1>修改</h1><script>play()</script>",
            staging.path(),
        )
        .unwrap();
        let dest = out.path().join("export");
        publish(staging.path(), &dest).unwrap();
        assert_eq!(
            fs::read_to_string(dest.join("index.html")).unwrap(),
            "<h1>修改</h1><script>play()</script>"
        );
        assert_eq!(fs::read(dest.join("assets/a.bin")).unwrap(), [0, 255, 23]);
        assert_eq!(
            fs::read_to_string(dest.join("slides.html")).unwrap(),
            "alternate source"
        );
        assert!(dest.join("images").is_dir());
        assert!(fs::read_to_string(&path).unwrap().contains("原文"));
        assert!(publish(staging.path(), &dest).is_err());
    }
    #[test]
    fn refuses_changed_source_and_missing_entry() {
        let root = tempfile::tempdir().unwrap();
        let stage_dir = tempfile::tempdir().unwrap();
        assert!(entry(root.path()).is_err());
        let path = root.path().join("index.htm");
        fs::write(&path, "new content").unwrap();
        assert_eq!(entry(root.path()).unwrap(), path);
        assert!(stage(root.path(), &path, "old content", "edit", stage_dir.path()).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_in_export() {
        let root = tempfile::tempdir().unwrap();
        let stage_dir = tempfile::tempdir().unwrap();
        let path = root.path().join("index.html");
        fs::write(&path, "original").unwrap();
        std::os::unix::fs::symlink("/etc/hosts", root.path().join("linked")).unwrap();
        assert!(stage(root.path(), &path, "original", "edited", stage_dir.path()).is_err());
    }
}
