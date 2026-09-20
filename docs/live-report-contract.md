# Live report contract

Baseline: [ADR-011](ADR-011-isolated-live-reports.md), 2026-09-20.

## Interfaces and ownership

| Boundary         | Contract                                                                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parser           | `ParsedDocument.live: boolean` indicates a report with executable script elements. Existing `html` and `entries` remain the static, source-mapped projection.                                                     |
| Runtime builder  | Original source + entries + acknowledged texts + channel ID produce disposable live HTML. Markers identify original text only; original user markers are removed.                                                 |
| Native IPC       | `prepare_preview(sessionId, expectedRevision, html): string` checks the current session/revision, stores at most 16 MiB and returns a fresh preview URL. It does not modify revision, patches or dirty state.     |
| Preview protocol | Only the active session's current random preview token/revision is served. Response CSP enforces opaque script sandbox, local resources and no native/network access.                                             |
| Runtime messages | A per-load channel and exact iframe `event.source` gate snapshot replies, Escape and pointer activity. Messages never dispatch file, edit, export or arbitrary native commands.                                   |
| Capture          | Host requests a snapshot with a request ID; child returns HTML plus finite scroll coordinates. HTML is bounded to 16 MiB and 50,000 nodes, then reparsed/sanitized in the parser worker. Canvas is frozen to PNG. |
| Edit mapping     | Match a unique marker to an existing entry, exact HTML tag, one text child and current acknowledged text. Reject duplicates or mismatches. No generated entry is sent to Rust.                                    |
| Export           | Rust applies its original verified UTF-8 source patches. Runtime HTML, Canvas PNGs, bridge scripts, source markers and snapshots are excluded.                                                                    |

The live frame has `sandbox="allow-scripts"`; the editing frame retains
`sandbox="allow-same-origin"`. The two permissions are never combined.
Opening another document, entering editing or closing disposes the prior runtime
and its message channel. Mode changes stay serialized with the existing session
queue; edits are committed before a preview rebuild. Scroll position is restored
where the rebuilt layout allows it. Existing presentations use the static path.
The bundled editing demo stays static because it doubles as a script-stripping fixture.

## Decisions, alternatives and risks

Snapshot serialization is permitted for temporary display only. It is explicitly
not an export format. Keeping the snapshot read-only except for verified original
entries trades editing of generated text for reliable original-byte export.
Opaque-origin isolation costs direct parent DOM access; the bounded bridge is
used only to acquire display data, never as a source of privileged instructions.
Resource authorization remains limited to the user's document directory and
existing file-size/type/path checks, with JS/MJS/JSON added for local rendering.
