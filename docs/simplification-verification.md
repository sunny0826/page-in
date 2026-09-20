# Simplification verification

Date: 2026-09-18. Baseline: `9af26e59308e94f7dc41a30839d152dc066f1a8d`.

## Status and measurement

**The requested 30% overall LOC reduction is not achieved.** This work remains a
partial delivery and the PR is a draft. Count all authored `.ts`, `.tsx`, `.rs`,
`.mjs` and `.css` files, including scripts, tests and the measurement tool:

```sh
rtk proxy mise exec -- node scripts/loc.mjs 9af26e5
```

| Measurement                             | Before | After |
| --------------------------------------- | -----: | ----: |
| Overall physical source lines           |  5,269 | 4,802 |
| Frontend coordinator `src/main.ts`      |    438 |   236 |
| Shell entry `src/shell.tsx`             |    539 |    95 |
| Native entry `src-tauri/src/main.rs`    |    528 |   117 |
| Shell styles, including extracted files |    963 |   596 |

Overall decrease: **467 lines / 8.86%**. Extracted files are counted; entry-file
reductions are not overall reductions. Short CSS rules and JSX were also reformatted,
so this physical-line change must not be interpreted as an equal reduction in
logic. Original test cases remain, and boundary coverage increased.

## Automated verification

- `mise run check`: version/identity check, TypeScript, 69 Node tests and 17 Rust
  tests passed. Added keyboard guard, release inventory/license, stale-session,
  export no-overwrite/race and changed-source cases.
- `cargo fmt --check` and Clippy with `--all-targets -- -D warnings`: passed.
- Vite production build and macOS arm64 Tauri `.app` build: passed.
- Differential CSS inspection: all 564 selector/property values match the baseline
  after token resolution, including responsive and reduced-motion rules.
- Differential animation inspection: all 11 supported recipes plus two unknown
  keys match baseline outputs with 0, 2 and 200 targets per selector.

## Real macOS WebView

The application built in this workspace was opened via its absolute `.app` path.
The sample document was edited with physical key events, not a paste-only test.

- Keyboard replacement, Backspace, Enter commit, Escape cancellation: passed.
- Undo and redo restore expected text and dirty state: passed.
- Native export creates a file and clears dirty state. A byte comparison against
  the fixture with exactly one title replacement passed; all other bytes match.
- Fullscreen entry, read-only undo guard and Escape restoring editing: passed.
- Settings/diagnostics and unsaved-quit dialog focus/cancellation: passed.
- Icon-only actions and warm-red discard styling: visually checked.
- Final build project fixture: local CSS loads, original scripts remain disabled,
  keyboard slide navigation and entering fullscreen from page two work. Editing
  the first title and exporting the project preserves BOM, CRLF, script bytes,
  CSS/binary resource bytes and an empty directory. An export inside the source
  project is rejected without creating its destination.

**Still unverified:** native Chinese IME candidate/composition flow. The attempted
input-source shortcut produced Latin text, and querying the system input menu
timed out. Unit-level composition guards do not substitute for this check.
Windows and Omarchy desktop interactions are not covered by macOS results.

## Packaging scope

The shared notice/inventory helpers have automated byte/hash and license tests.
Platform entry-point guards, output names, source-SHA validation, no-overwrite
behavior and signature metadata are retained. Existing published tags and release
assets are outside this PR's changes.

- Source tested: `0bf99a3cf08901bec88bacd92e850c327d815df8` (subsequent changes
  only record verification evidence).
- macOS: the complete packaging script produced DMG/ZIP, installed-dependency
  notices, installation notes and manifest. Ad-hoc signing verification, DMG
  verification and all six SHA-256 entries passed. These are local test packages.
- Windows NSIS and Linux AppImage/DEB: both build/check/package jobs passed in
  [run 35350534957](https://github.com/sunny0826/page-in/actions/runs/35350534957).
  This establishes CI packaging, not desktop installation/interaction acceptance.
