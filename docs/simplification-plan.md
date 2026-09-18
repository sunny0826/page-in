# Simplification implementation and verification

Single owner: the primary agent owns all changed files. No parallel agents.

| Stage       | Depends on                    | Scope                                  | Acceptance                                          |
| ----------- | ----------------------------- | -------------------------------------- | --------------------------------------------------- |
| Baseline    | —                             | Source count, current checks           | Reproducible baseline and clean branch              |
| UI          | Baseline                      | Shell components and styles            | Shared controls, retained semantics and layout      |
| Engine      | Baseline                      | Input/navigation modules               | Clear dependencies, unchanged edit transaction      |
| Native      | Baseline                      | Commands, session access, window setup | Revision and export checks preserved                |
| Packaging   | Baseline                      | Shared notice/inventory helpers        | Existing output contract preserved                  |
| Integration | UI, Engine, Native, Packaging | Entire repository                      | Typecheck, tests, build, fmt, clippy                |
| Desktop     | Integration                   | Real macOS WebView                     | Keyboard, cancel, composition, export, presentation |
| Delivery    | Desktop                       | Metrics, documentation, PR             | Evidence and explicit remaining limits              |

These independent scopes are implemented serially. Integration risks are import
cycles, event ordering and packaging metadata differences. Verify each boundary
as it changes, then run the full checks and native flow before creating the PR.
Windows and Omarchy runtime results require those systems; macOS cannot establish
their desktop acceptance.
