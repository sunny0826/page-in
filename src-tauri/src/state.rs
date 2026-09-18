use crate::{document::Session, open_requests};
use serde::Serialize;
use std::{
    sync::{atomic::AtomicBool, Arc, Mutex},
    time::Instant,
};

pub type Shared = Arc<Mutex<Option<Session>>>;
pub struct AppState {
    pub session: Shared,
    pub staged: Mutex<Option<Session>>,
    pub open_requests: Mutex<open_requests::OpenRequests>,
    pub started: Instant,
    pub approved_exit: AtomicBool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    pub session_id: String,
    pub filename: String,
    pub source: String,
    pub resource_base: String,
    pub project: bool,
}

impl AppState {
    // Keep the check and mutation under one lock; no guard escapes across an await.
    pub fn with_session<T>(
        &self,
        id: &str,
        revision: u64,
        action: impl FnOnce(&mut Session) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut lock = self.session.lock().map_err(|_| "state unavailable")?;
        let session = lock.as_mut().ok_or("no document")?;
        session.check(id, revision)?;
        action(session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_or_foreign_sessions_never_run_the_write_closure() {
        let session = Session::new("<h1>text</h1>".into(), None, None, "test.html".into());
        let id = session.id.clone();
        let state = AppState {
            session: Arc::new(Mutex::new(Some(session))),
            staged: Mutex::new(None),
            open_requests: Mutex::new(open_requests::OpenRequests::default()),
            started: Instant::now(),
            approved_exit: AtomicBool::new(false),
        };
        for (requested, revision, error) in [
            ("foreign", 0, "SessionExpired"),
            (id.as_str(), 1, "StaleRevision"),
        ] {
            let result = state.with_session(requested, revision, |_| -> Result<(), String> {
                panic!("must reject before mutation")
            });
            assert_eq!(result.unwrap_err(), error);
        }
        state
            .with_session(&id, 0, |s| {
                s.revision += 1;
                Ok(())
            })
            .unwrap();
        assert_eq!(
            state.with_session(&id, 0, |_| Ok(())).unwrap_err(),
            "StaleRevision"
        );
        assert_eq!(state.with_session(&id, 1, |s| Ok(s.revision)).unwrap(), 1);
    }
}
