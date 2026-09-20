use percent_encoding::percent_decode_str;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

pub fn resolve(root: &Path, encoded: &str) -> Result<(PathBuf, &'static str), String> {
    let decoded = percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|_| "invalid encoding")?;
    let rel = Path::new(decoded.as_ref());
    if decoded.contains('\\')
        || rel.is_absolute()
        || rel
            .components()
            .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
    {
        return Err("PathOutsideScope".into());
    }
    let path = root.join(rel).canonicalize().map_err(|_| "not found")?;
    let root = root.canonicalize().map_err(|_| "invalid root")?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err("PathOutsideScope".into());
    }
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "css" => "text/css",
        "js" | "mjs" => "text/javascript",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => return Err("resource type not allowed".into()),
    };
    if fs::metadata(&path).map_err(|_| "not found")?.len() > 20 * 1024 * 1024 {
        return Err("resource too large".into());
    }
    Ok((path, mime))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn allows_known_resource_and_blocks_traversal_and_html() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.css"), "body{}").unwrap();
        fs::write(dir.path().join("a.html"), "<h1>x</h1>").unwrap();
        fs::write(dir.path().join("a.js"), "draw()").unwrap();
        fs::write(dir.path().join("a.json"), "{}").unwrap();
        assert_eq!(resolve(dir.path(), "a.js").unwrap().1, "text/javascript");
        assert_eq!(resolve(dir.path(), "a.json").unwrap().1, "application/json");
        assert_eq!(resolve(dir.path(), "a.css").unwrap().1, "text/css");
        for p in ["../a.css", "%2e%2e/a.css", "/a.css", "..%5Ca.css", "a.html"] {
            assert!(resolve(dir.path(), p).is_err(), "{p}");
        }
    }
    #[cfg(unix)]
    #[test]
    fn blocks_symlink_escape() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let target = outside.path().join("a.css");
        fs::write(&target, "a{}").unwrap();
        std::os::unix::fs::symlink(&target, root.path().join("link.css")).unwrap();
        assert!(resolve(root.path(), "link.css").is_err());
    }
}
