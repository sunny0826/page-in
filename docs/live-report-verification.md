# Dynamic report verification — 2026-09-20

Implementation: [ADR-011](ADR-011-isolated-live-reports.md),
[contract](live-report-contract.md), [plan](live-report-plan.md).

## Automated checks and build

- `mise run check`: version identity, TypeScript, 74 frontend tests and 18 Rust tests passed.
- `npm run tauri -- build --debug --bundles app`: macOS application bundle built successfully.
- Rust formatting, Clippy with warnings denied, documentation formatting/relative links and Git whitespace checks passed.
- No runtime dependency added. Live document parsing is loaded on demand; the main bundle is approximately 438 kB.
- Mapping tests reject forged IDs, duplicate IDs, different tags/namespaces, transformed text and mixed children. Rust tests reject stale preview tokens/revisions and oversized HTML.

## Actual macOS WKWebView

Used the native debug application, not Vite mocks, with the user's original
`anshi-opensource-report/index.html` and its existing local resources.

- Canvas cover rendered; switching B to C changed the drawing.
- Both generated SVG diagrams, ecology table and all six source rows rendered.
- Original section navigation scrolled to the architecture and updated the reading dashboard.
- Entering editing preserved the visible Canvas drawing and generated content.
- Keyboard replacement, Backspace, Enter, undo and redo worked on original text. Returning to live preview retained the acknowledged edit and regenerated charts.
- Fullscreen rendered the report; Escape from the report restored the window, previous editing mode and scroll position.
- A separate local script fixture rendered Canvas/SVG while observing `parent.document` and local storage blocked, with both `window.__TAURI_INTERNALS__` and `window.__TAURI__` undefined.
- Escape canceled a text transaction in that fixture. Native export succeeded; byte comparison showed exactly the original title replaced by `Verified`, with every other byte including scripts unchanged. No bridge, snapshot or PNG was exported.

The original report's SHA-256 remained
`8fb4f2b8af4d35f311e3f8dd33453430434ff556be68591f8e9e1adf8cbb5ea7`.
The fixture and exported copy are under ignored `artifacts/live-report-check/`.
An earlier report export attempt was canceled because the native save panel kept
Save disabled during path editing; the subsequent fixture export completed.

## Remaining coverage and scope

This is a local macOS debug build, not a published release. Windows/WebView2 and
Omarchy/WebKitGTK have not been tested. Native IME composition was not exercised
in this run. Arbitrary remote services, opaque-origin storage, script-generated
text editing and existing slide-script execution are outside ADR-011's scope.
The user's supplied local report is the rendering acceptance case; this does not
claim universal browser equivalence for every HTML application.
