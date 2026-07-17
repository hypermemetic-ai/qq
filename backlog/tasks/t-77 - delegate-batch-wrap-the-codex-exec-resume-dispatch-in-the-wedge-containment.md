---
id: T-77
title: 'delegate-batch: wrap the codex exec resume dispatch in the wedge containment'
status: Done
assignee: []
created_date: '2026-07-17 05:17'
updated_date: '2026-07-17 05:25'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The last uncontained dispatch surface: delegate-batch instructs `codex exec resume <thread-id>` without the timeout wrapper, though a resumed delegate is a fresh codex process with the same wedge-prone startup (doc-45) as any dispatch. Flagged as follow-up in T-75. Scope: amend the resume sentence to carry `timeout -k 10 3600` with the same MCP-less override and events/envelope/stderr capture as the original dispatch; add one conformance assertion.

Decision ledger:
- Extend the wrapper to the resume dispatch — asked and answered (alignment brief approved 2026-07-17).
- Resumed implementers stay MCP-less — decision-2.
- Bound value 3600 and tune-to-the-ticket wording — T-63 (reused unchanged).
- Conformance assertion in tests/test-qq-herdr-home.sh — house pattern (T-70/T-73/T-75/T-76).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The resume dispatch sentence in delegate-batch carries the timeout -k 10 3600 wrapper and keeps the cwd rail and fresh-dispatch fallback
- [x] #2 A conformance assertion fails the suite if the wrapped resume wording regresses
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented codex-first from an exact work order; envelope verified against the tree. Fresh review: no material findings; reviewer verified codex 0.144.5 resume accepts the -c overrides and -o/--json flags. Delivered under the T-76 rule: decision ledger in this Description, approved via alignment brief 2026-07-17.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resume dispatches carry the same doc-45 containment as fresh ones: timeout -k 10 3600 codex exec resume with the MCP-less override and events/envelope/stderr capture of the original dispatch, cwd writable-root rail and fresh-dispatch fallback preserved; a conformance assertion pins the wording. Every codex dispatch surface in qq is now wedge-contained.
<!-- SECTION:FINAL_SUMMARY:END -->
