---
id: T-89
title: 'qq-reap: stale-doc and debris scans, weekly with heartbeat'
status: Done
assignee: []
created_date: '2026-07-17 17:19'
updated_date: '2026-07-20 17:53'
labels:
  - base-batch
dependencies:
  - T-83
priority: medium
type: task
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One engine, two scans: backlog docs referencing repo paths that no longer exist, and merged-but-undeleted branches plus leftover worktrees (through the retire rails). Strictly two-step: a run only nominates with exact commands; a second explicit run applies after operator veto. Weekly, and every run emits a dated report even when empty — a missing report, not silence, is the failure signal.

Decision ledger:
- Stale docs are deleted, not tagged — operator reversal, asked-and-answered exchange 2026-07-17.
- Two-step veto, weekly cadence, heartbeat visibility — same exchange (doc-51).
- Expiry conventions for debt notes dropped (two instances do not justify a convention) — same exchange.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 qq-reap nominates-only by default, applies only on explicit second invocation, and produces a dated report on every run including empty ones
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final: bin/qq-reap (scan default zero-mutation except disclosed FETCH_HEAD refresh; apply executes only non-vetoed, freshly-revalidated nomination IDs; dated report + latest symlink on EVERY run incl. empty). Full herdr census for bound worktrees; refusal when herdr unavailable. Strict veto parser (NUL-rejecting, order-preserving subsequence). Full-ref branch identity; branch deletion from the primary main checkout. Review round 1: 5 findings (3 P1) all fixed in a5783c0; round 2 approved. 16/16 tests + ratchet + shellcheck green.
<!-- SECTION:NOTES:END -->
