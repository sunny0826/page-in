# ADR-011: Isolated live report rendering

Status: accepted for implementation, 2026-09-20.

## Decision and superseded scope

The user explicitly requires browser-like rendering, rejecting compatibility
warnings and empty placeholders. Reports containing JavaScript will run their
local scripts in a separate-origin, opaque sandbox iframe inside the existing
single native WebView. This supersedes the blanket script-disabled preview rule
of ADR-002/ADR-003/ADR-005 for reports only. The static editor, existing deck
adapters, Rust session authority, byte-patch export, local resource scope and
single-window architecture remain effective.

The live iframe uses only `allow-scripts`, never `allow-same-origin`. Its HTML
comes from a session-scoped `pagein-preview` protocol with a response CSP that
also enforces the sandbox. The trusted application's CSP stays script-restricted.
Local JS/MJS/JSON are added to scoped resources. No remote networking, native
capabilities, filesystem APIs, top navigation or popup permission is granted.
Tauri initializes its IPC key in the main frame only; the child cannot read the
parent. Verify this on the actual WebView, not just by assuming origin ACLs.

Entering edit mode captures the rendered HTML and rasterizes Canvas surfaces.
That untrusted snapshot is sanitized again and displayed in the existing
script-disabled same-origin editor. The live frame is then unloaded. Only unique
source markers whose tag and text still match the registered original entries
can be edited. Generated chart text stays read-only. Returning to preview rebuilds
from the immutable source plus acknowledged text edits and runs scripts again.
Snapshots are never registered as source and never used for export.

## Alternatives and risks

- Warnings/placeholders: rejected by the user; do not solve rendering.
- Enabling scripts in the same-origin editor: rejected because it exposes the
  trusted shell and breaks the native permission boundary.
- A second native WebView or bundled browser: unnecessary runtime/packaging cost.
- Per-report hard-coded drawing adapters: cannot reproduce arbitrary report JS.

Snapshots can contain forged markers, large images or unsafe markup; use strict
size/node limits, sanitization, duplicate rejection and exact source-text checks.
Snapshot timeouts fail the mode switch without discarding the live page.
Report scripts can still consume CPU; this is not an OS process sandbox.
Storage tied to an opaque origin and remote services are outside this local
report scope. Existing slide adapters keep their prior behavior.

## Acceptance

Follow the [contract](live-report-contract.md) and [plan](live-report-plan.md).
The reported multi-file page must show its Canvas cover, both SVG diagrams,
ecology table, source rows and working cover/navigation interactions without
compatibility UI. Verify snapshot editing, keyboard transactions and byte-exact
export in macOS WKWebView; document Windows/Omarchy and IME coverage separately.
