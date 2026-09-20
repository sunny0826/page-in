use crate::state::AppState;

pub const MAX_PREVIEW: usize = 16 * 1024 * 1024;
pub const CSP: &str = "default-src 'none'; script-src 'unsafe-inline' pagein-resource: http://pagein-resource.localhost; style-src 'unsafe-inline' pagein-resource: http://pagein-resource.localhost; img-src data: blob: pagein-resource: http://pagein-resource.localhost; font-src data: pagein-resource: http://pagein-resource.localhost; connect-src pagein-resource: http://pagein-resource.localhost; media-src pagein-resource: http://pagein-resource.localhost; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri pagein-resource: http://pagein-resource.localhost; sandbox allow-scripts";

pub struct Preview {
    pub token: String,
    pub revision: u64,
    pub html: String,
}

impl Preview {
    pub fn new(html: String, revision: u64) -> Result<Self, String> {
        if html.len() > MAX_PREVIEW {
            return Err("PreviewTooLarge".into());
        }
        Ok(Self {
            token: uuid::Uuid::new_v4().to_string(),
            revision,
            html,
        })
    }
    pub fn read(&self, token: &str, revision: u64) -> Option<Vec<u8>> {
        (self.token == token && self.revision == revision).then(|| self.html.as_bytes().to_vec())
    }
}

#[tauri::command]
pub fn prepare_preview(
    state: tauri::State<'_, AppState>,
    session_id: String,
    expected_revision: u64,
    html: String,
) -> Result<String, String> {
    state.with_session(&session_id, expected_revision, |session| {
        let preview = Preview::new(html, session.revision)?;
        let origin = if cfg!(target_os = "windows") {
            "http://pagein-preview.localhost"
        } else {
            "pagein-preview://localhost"
        };
        let url = format!("{origin}/{}/index.html", preview.token);
        session.preview = Some(preview);
        Ok(url)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preview_is_bounded_and_token_and_revision_scoped() {
        let preview = Preview::new("<script>draw()</script>".into(), 3).unwrap();
        assert!(preview.read("foreign", 3).is_none());
        assert!(preview.read(&preview.token, 4).is_none());
        assert_eq!(
            preview.read(&preview.token, 3).unwrap(),
            b"<script>draw()</script>"
        );
        assert!(Preview::new("x".repeat(MAX_PREVIEW + 1), 0).is_err());
        assert!(CSP.contains("sandbox allow-scripts"));
        assert!(!CSP.contains("allow-same-origin"));
        assert!(!CSP.contains("ipc:"));
    }
}
