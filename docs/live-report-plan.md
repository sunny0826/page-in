# Live report implementation plan

Owner: one agent owns all files; no parallel agents or separate integration lanes.
This task changes document execution boundaries without new dependencies.

| Stage        | Depends on  | Owned files and deliverable                                              | Acceptance                                                               |
| ------------ | ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| T0 contract  | none        | ADR-011, contract, plan                                                  | Frozen isolation, IPC, capture and export invariants                     |
| Runtime      | T0          | `src/live-*.ts`, parser/contracts; Rust preview/resources/state/commands | Live source rendering, source markers, bounded snapshot, scoped protocol |
| Integration  | Runtime     | main, document-frame, presentation-controls, iframe/CSS, i18n/settings   | Remove prior warnings; mode switching and keyboard/fullscreen boundaries |
| Regression   | Integration | focused TS/Rust tests, AGENTS/README                                     | Source-byte mapping, stale tokens, script isolation, no snapshot export  |
| Verification | Regression  | verification record and ignored artifacts                                | Whole-repo check/build; real report in native WKWebView                  |

Alternatives and risks are recorded in [ADR-011](ADR-011-isolated-live-reports.md).
Reject same-origin execution if it appears to simplify integration. Do not use
browser mocks as native IPC/input evidence. Retain original report files unchanged.
Failures in capture or mode switching must keep the active document recoverable.
