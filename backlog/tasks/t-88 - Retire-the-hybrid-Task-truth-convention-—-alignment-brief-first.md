---
id: T-88
title: Retire the hybrid Task-truth convention — alignment brief first
status: In Progress
assignee: []
created_date: '2026-07-17 17:19'
updated_date: '2026-07-20 22:20'
labels:
  - base-batch
dependencies:
  - T-83
priority: medium
type: task
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
OPEN: this Task enacts nothing until its own alignment brief is answered. Evidence for reopening, the recommended born-in-worktree model with board-as-read-model, and the considered-and-rejected separate Task store are recorded in doc-51.

Decision ledger:
- OPEN — routes through a dedicated alignment brief (grilling) before any Repository mutation; recorded as open in doc-51 (2026-07-17).
- 2026-07-20: alignment brief answered — operator APPROVED the born-in-worktree model with board-as-read-model (asked-and-answered alignment exchange, project-home session); outcome recorded as decision-6. Enactment now routes through its own reviewed Change.
- 2026-07-20: board render disposition — no qq-owned visual element; the vendor backlog TUI remains the board surface and must be accurate and always up to date. qq-board aggregates primary + active worktrees into a derived scratch board tree (runtime cache, never tracked, source records never board-written) that the vendor TUI renders; reconcile's record-writing dies: operator direction, asked-and-answered exchange, project-home session ('we shouldn't own any visual element, backlog tui is source of truth. it just needs to be accurate and always up to date.').
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An alignment brief is answered before any enactment and its outcome recorded as a decision record
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence 2026-07-20 (batch aftermath): the qq-change land engine admits untracked paths ONLY under backlog/tasks/ — terminal managed markdown (docs/decisions/completed/archive) left untracked in primary by dead sessions blocked every post-merge sync until landed via PR #163. Also observed: a tracked in-place edit of an already-tracked task record (t-95) blocked the rail for hours; the hybrid convention makes tracked-record edits undeliverable without their own Change. Both are same-class findings for the convention's retirement.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-19 18:15
---
State check 2026-07-19 (batch-alignment session): board half landed via PR #145 (qq-board by-construction reconciler); convention-retirement half remains — moving records off the primary checkout, editing deliver-change/delegate-batch, deleting step-11 — as a separate later Change requiring the alignment brief (AC #1) and a decision record. Not board drift; status In Progress is correct. Delegate work orders keep doc-48's no-backlog-edits rule until then.
---
<!-- COMMENTS:END -->
