---
id: decision-6
title: Born-in-worktree Task-truth model approved (T-88)
date: '2026-07-20 18:48'
status: accepted
---
## Context

The hybrid Task-truth convention (Task records tracked on `main`, plus
in-flight exceptions for untracked records under `backlog/tasks/`) accrued
sustained same-class findings: doc-51 recorded two exception-patches in its
first two weeks (T-73's step-11 special case; T-72's foreign untracked file
blocking three sessions' syncs). Fresh 2026-07-20 evidence: untracked
terminal records from dead sessions blocked every post-merge sync until
PR #163 landed them; a tracked in-place edit of t-95 stalled the land rail
for hours.

## Decision

Retire the hybrid convention. Target model, per doc-51's recommendation:
**a Task record is born in its Change worktree and never moves; the board
becomes a read model aggregating active worktrees.** Approved by the
operator via the T-88 alignment brief (asked-and-answered alignment
exchange, 2026-07-20 project-home session). Considered and rejected in
doc-51: a fully separate Task store — it un-prices the atomic-PR property
and the state machine reappears in a retention-policy costume.

## Consequences

- Enactment rides its own reviewed Change under T-88; this record settles
  only the target model.
- deliver-change's record-relocation steps (step 6/11) and the T-73/T-115
  exception patches are deleted at enactment.
- `qq-board reconcile` becomes the board's aggregation mechanism (read
  model; aligns with doc-46).
- T-106's Claude-surface retirement and any other work touching Task-record
  lifecycle aligns to this model when it lands after enactment.
