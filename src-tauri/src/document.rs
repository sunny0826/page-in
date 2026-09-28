use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf};

pub const MAX_SOURCE: usize = 5 * 1024 * 1024;
const MAX_TEXT: usize = 1024 * 1024;

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TextContext {
    #[default]
    Html,
    PreLeading,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub node_id: String,
    pub start_byte: usize,
    pub end_byte: usize,
    pub raw: String,
    pub original_decoded: String,
    #[serde(default)]
    pub text_context: TextContext,
}

#[derive(Clone, Debug)]
struct Edit {
    node_id: String,
    before: String,
    after: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub revision: u64,
    pub texts: BTreeMap<String, String>,
    pub can_undo: bool,
    pub can_redo: bool,
    pub dirty: bool,
}

pub struct Session {
    pub id: String,
    pub source: String,
    pub path: Option<PathBuf>,
    pub root: Option<PathBuf>,
    pub filename: String,
    pub project: bool,
    pub entries: BTreeMap<String, Entry>,
    pub patches: BTreeMap<String, String>,
    exported: BTreeMap<String, String>,
    pub revision: u64,
    pub preview: Option<crate::preview::Preview>,
    past: Vec<Edit>,
    future: Vec<Edit>,
    registered: bool,
}

pub fn valid_source(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.len() > MAX_SOURCE {
        return Err("暂不打开超过 5 MiB 的文件".into());
    }
    let text =
        String::from_utf8(bytes).map_err(|_| "UnsupportedEncoding：只支持有效 UTF-8 HTML")?;
    if text.contains('\0') {
        return Err("不支持含 NUL 的文件".into());
    }
    Ok(text)
}

impl Session {
    pub fn new(
        source: String,
        path: Option<PathBuf>,
        root: Option<PathBuf>,
        filename: String,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            source,
            path,
            root,
            filename,
            project: false,
            entries: BTreeMap::new(),
            patches: BTreeMap::new(),
            exported: BTreeMap::new(),
            revision: 0,
            preview: None,
            past: vec![],
            future: vec![],
            registered: false,
        }
    }
    pub fn check(&self, id: &str, revision: u64) -> Result<(), String> {
        if self.id != id {
            return Err("SessionExpired".into());
        }
        if self.revision != revision {
            return Err("StaleRevision".into());
        }
        Ok(())
    }
    pub fn register(&mut self, mut entries: Vec<Entry>) -> Result<View, String> {
        if self.registered {
            return Err("清单已登记，不能重新定义源区间".into());
        }
        if entries.len() > 50000 {
            return Err("文本节点过多".into());
        }
        entries.sort_by_key(|e| e.start_byte);
        let mut end = 0;
        let mut map = BTreeMap::new();
        for e in entries {
            if e.start_byte < end
                || e.start_byte >= e.end_byte
                || e.end_byte > self.source.len()
                || self.source.get(e.start_byte..e.end_byte) != Some(e.raw.as_str())
                || e.node_id != format!("{}:{}", e.start_byte, e.end_byte)
                || e.original_decoded.len() > MAX_TEXT
                || map.contains_key(&e.node_id)
            {
                return Err("MappingMismatch".into());
            }
            end = e.end_byte;
            map.insert(e.node_id.clone(), e);
        }
        self.entries = map;
        self.registered = true;
        Ok(self.view())
    }
    pub fn text(&self, id: &str) -> Result<&str, String> {
        let entry = self.entries.get(id).ok_or("UnknownNode")?;
        Ok(self
            .patches
            .get(id)
            .map(String::as_str)
            .unwrap_or(&entry.original_decoded))
    }
    fn set(&mut self, id: &str, text: String) {
        if self.entries[id].original_decoded == text {
            self.patches.remove(id);
        } else {
            self.patches.insert(id.into(), text);
        }
    }
    pub fn commit(&mut self, node: &str, old: &str, new: String) -> Result<View, String> {
        if new.len() > MAX_TEXT || new.contains('\0') {
            return Err("文字过长或含不支持字符".into());
        }
        if self.text(node)? != old {
            return Err("MappingMismatch".into());
        }
        if old != new {
            self.past.push(Edit {
                node_id: node.into(),
                before: old.into(),
                after: new.clone(),
            });
            self.future.clear();
            self.set(node, new);
            self.revision += 1;
            while self.past.len() > 200
                || self
                    .past
                    .iter()
                    .map(|e| e.before.len() + e.after.len())
                    .sum::<usize>()
                    > 8 * 1024 * 1024
            {
                self.past.remove(0);
            }
        }
        Ok(self.view())
    }
    pub fn undo(&mut self) -> View {
        if let Some(e) = self.past.pop() {
            self.set(&e.node_id, e.before.clone());
            self.future.push(e);
            self.revision += 1;
        }
        self.view()
    }
    pub fn redo(&mut self) -> View {
        if let Some(e) = self.future.pop() {
            self.set(&e.node_id, e.after.clone());
            self.past.push(e);
            self.revision += 1;
        }
        self.view()
    }
    pub fn view(&self) -> View {
        View {
            revision: self.revision,
            texts: self.patches.clone(),
            can_undo: !self.past.is_empty(),
            can_redo: !self.future.is_empty(),
            dirty: self.patches != self.exported,
        }
    }
    pub fn export(&self) -> String {
        let mut entries: Vec<_> = self
            .patches
            .iter()
            .map(|(id, text)| (&self.entries[id], text))
            .collect();
        entries.sort_by_key(|(e, _)| e.start_byte);
        let mut result = String::with_capacity(self.source.len());
        let mut pos = 0;
        for (e, text) in entries {
            result.push_str(&self.source[pos..e.start_byte]);
            let mut text = text.as_str();
            if e.text_context == TextContext::PreLeading && text.starts_with('\n') {
                result.push('\n');
            }
            // Preserve a source CR outside the patch without letting it combine
            // with the replacement's first LF during HTML input preprocessing.
            if self.source[..e.start_byte].ends_with('\r') && text.starts_with('\n') {
                result.push_str("&#10;");
                text = &text[1..];
            }
            result.push_str(&escape(text));
            pos = e.end_byte;
        }
        result.push_str(&self.source[pos..]);
        result
    }
    pub fn mark_exported(&mut self) {
        self.exported = self.patches.clone();
    }
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\r', "&#13;")
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Session {
        let raw = "<!doctype html>\r\n<!--keep--><h1>中文 &amp; 😀</h1><script>keep()</script>";
        let mut s = Session::new(raw.into(), None, None, "test.html".into());
        let start = raw.find("中文").unwrap();
        let end = raw.find("</h1>").unwrap();
        s.register(vec![Entry {
            node_id: format!("{start}:{end}"),
            start_byte: start,
            end_byte: end,
            raw: raw[start..end].into(),
            original_decoded: "中文 & 😀".into(),
            text_context: TextContext::Html,
        }])
        .unwrap();
        s
    }
    #[test]
    fn unicode_patch_preserves_all_other_bytes() {
        let mut s = fixture();
        let id = s.entries.keys().next().unwrap().clone();
        s.commit(&id, "中文 & 😀", "新 <b> & 👨‍👩‍👧‍👦".into()).unwrap();
        assert_eq!(
            s.export(),
            "<!doctype html>\r\n<!--keep--><h1>新 &lt;b&gt; &amp; 👨‍👩‍👧‍👦</h1><script>keep()</script>"
        );
        s.undo();
        assert_eq!(s.export(), s.source);
        s.redo();
        assert!(s.view().dirty);
        s.mark_exported();
        assert!(!s.view().dirty);
        s.undo();
        assert!(s.view().dirty);
    }
    #[test]
    fn rejects_bad_offsets_stale_revisions_and_values() {
        let mut s = fixture();
        assert!(s.check("wrong", 0).is_err());
        assert!(s.check(&s.id, 1).is_err());
        let id = s.entries.keys().next().unwrap().clone();
        assert!(s.commit(&id, "wrong", "oops".into()).is_err());
        assert_eq!(s.export(), s.source);
        assert!(s.register(vec![]).is_err());
        let mut t = Session::new("中".into(), None, None, "a".into());
        assert!(t
            .register(vec![Entry {
                node_id: "1:3".into(),
                start_byte: 1,
                end_byte: 3,
                raw: "中".into(),
                original_decoded: "中".into(),
                text_context: TextContext::Html,
            }])
            .is_err());
    }
    #[test]
    fn no_op_and_roundtrip_restore_entities() {
        let mut s = fixture();
        let id = s.entries.keys().next().unwrap().clone();
        s.commit(&id, "中文 & 😀", "other".into()).unwrap();
        s.commit(&id, "other", "中文 & 😀".into()).unwrap();
        assert_eq!(s.export(), s.source);
        assert!(!s.view().dirty);
        assert!(s.patches.is_empty());
    }
    #[test]
    fn rejects_non_utf8_and_limits() {
        assert!(valid_source(vec![0xff]).is_err());
        assert!(valid_source(vec![0]).is_err());
        assert!(valid_source(vec![b'a'; MAX_SOURCE + 1]).is_err());
        assert_eq!(
            valid_source(b"\xef\xbb\xbfhi".to_vec()).unwrap(),
            "\u{feff}hi"
        );
    }

    #[derive(Deserialize)]
    struct TextFixture {
        name: String,
        source: String,
        entries: Vec<Entry>,
        #[serde(default)]
        changes: Vec<TextChange>,
    }

    #[derive(Deserialize)]
    struct TextChange {
        text: String,
        exported: String,
    }

    fn text_fixtures() -> Vec<TextFixture> {
        serde_json::from_str(include_str!("../../tests/fixtures/text-context.json")).unwrap()
    }

    fn registered(fixture: &TextFixture) -> Session {
        let mut s = Session::new(fixture.source.clone(), None, None, "fixture.html".into());
        s.register(fixture.entries.clone()).unwrap();
        s
    }

    #[test]
    fn shared_text_context_fixtures_preserve_original_bytes_without_edits() {
        for fixture in text_fixtures() {
            let mut s = registered(&fixture);
            assert_eq!(s.export(), fixture.source, "{}", fixture.name);
            for entry in &fixture.entries {
                s.commit(
                    &entry.node_id,
                    &entry.original_decoded,
                    entry.original_decoded.clone(),
                )
                .unwrap();
            }
            assert_eq!(s.export(), fixture.source, "{}", fixture.name);
            assert_eq!(s.revision, 0, "{}", fixture.name);
            assert!(!s.view().dirty, "{}", fixture.name);
        }
    }

    #[test]
    fn shared_text_context_fixtures_export_and_restore_expected_bytes() {
        for fixture in text_fixtures() {
            for change in &fixture.changes {
                let mut s = registered(&fixture);
                let entry = &fixture.entries[0];
                s.commit(&entry.node_id, &entry.original_decoded, change.text.clone())
                    .unwrap();
                assert_eq!(s.export(), change.exported, "{}", fixture.name);
                assert_eq!(s.source, fixture.source, "{}", fixture.name);
                s.undo();
                assert_eq!(s.export(), fixture.source, "{}", fixture.name);
                assert!(s.patches.is_empty(), "{}", fixture.name);
                s.redo();
                assert_eq!(s.export(), change.exported, "{}", fixture.name);
                s.commit(&entry.node_id, &change.text, entry.original_decoded.clone())
                    .unwrap();
                assert_eq!(s.export(), fixture.source, "{}", fixture.name);
                assert!(s.patches.is_empty(), "{}", fixture.name);
            }
        }
    }

    #[test]
    fn text_context_defaults_to_html_and_rejects_unknown_values() {
        let value = serde_json::json!({
            "nodeId": "5:6", "startByte": 5, "endByte": 6,
            "raw": "A", "originalDecoded": "A"
        });
        let entry: Entry = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(entry.text_context, TextContext::Html);
        for unknown in [serde_json::json!("raw-text"), serde_json::Value::Null] {
            let mut invalid = value.clone();
            invalid["textContext"] = unknown;
            assert!(serde_json::from_value::<Entry>(invalid).is_err());
        }
    }
}
