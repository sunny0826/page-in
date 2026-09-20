# ADR-010: Explicit modules and shared operations

Status: accepted for implementation, 2026-09-18.

## Decision and superseded scope

Partially supersedes the file organization in ADR-002, ADR-003 and ADR-004,
and duplicated packaging implementation in ADR-007/ADR-008. Split application
composition, input surface, shell components, native commands and window setup.
Reuse dialog framing, command metadata, checked session access and release
inventory generation. All product, security, export and release guarantees in
those ADRs and ADR-009 remain effective. No runtime or dependency changes.

## Alternatives and risks

Keeping the current entry files preserves hidden coupling. A framework rewrite
adds dependencies and migration risk. Small modules with explicit inputs preserve
the existing model; their principal risks are focus/event ordering, stale session
writes and packaging metadata drift. Retain regression tests and verify the
native WebView, rather than inferring correctness from a browser preview.

## Acceptance

Follow the [contract](simplification-contract.md) and [plan](simplification-plan.md).
Report physical source LOC against `9af26e5`, including tests and tooling, and
separate formatting from substantive simplification. The requested reduction is
at least 30%; deleting coverage or security checks is not an acceptable shortcut.
