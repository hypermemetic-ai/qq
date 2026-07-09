---
id: TASK-19
title: Gate viewer spawns with every pane that drives a run
status: Done
assignee:
  - task-19-gate-viewer-panes
created_date: '2026-07-09 01:13'
updated_date: '2026-07-09 01:15'
labels:
  - cockpit
dependencies: []
priority: high
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator direction (2026-07-08): 'any pane that needs one should spawn with one.' The gate already ships a TUI (no-mistakes attach) — reuse it rather than rebuild. Two defects make bare attach unusable per-pane, both verified 2026-07-08: (1) bare 'attach' resolves the REPO's active run, not the pane's branch, so with parallel workers a pane watches whichever run started last; (2) 'no-mistakes axi status' is not reliably branch-scoped either — on a branch with no run of its own it silently FALLS BACK to the repo's active run (a fresh task-19 worktree reported task-8's run), which is how the task-8 worker went blind to its own parked slice-0 run while sitting idle. bin/qq-gate-view wraps attach: it reads axi status, ACCEPTS it only when the reported branch matches this worktree, resolves the run id, and calls 'attach --run <id>'; it waits when no run exists yet (viewers spawn before runs do), survives successive runs (fix rounds, stacked slices), and respects an operator detach. Spawn convention: every task tab gets the viewer as a RIGHT split (operator direction) alongside the worker pane. This is deliberately the reuse-first floor for TASK-11's full-lifecycle view, not a competitor to it: qq-gate-view covers the gate segment (registry -> loop -> GATE -> PR) and TASK-11 subsumes or wraps it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bin/qq-gate-view attaches only to the current branch's run and never to another branch's run
- [x] #2 A viewer pane spawned before any run exists waits, then attaches when the branch's run starts
- [x] #3 The wave launcher spawns a viewer as a right split in every task tab
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bin/qq-gate-view wraps 'no-mistakes attach'. Reuse-first: the gate's own TUI does the rendering; the wrapper only fixes scoping and lifetime. AC1 evidence: guard accepts only a status block whose branch: field matches this worktree — verified from the task-19 worktree (repo-active run was task-8's; guard REJECTed) and from the task-14 worktree (own run; ACCEPTed). AC2 evidence: viewer spawned in w7 before any run existed, showed the waiting banner, then attached to this branch's run by id. AC3 evidence: 'qq-gate-view --spawn <pane>' splits a right pane (ratio 0.42), renames it gate-view, and starts the viewer via herdr's non-agent pane pattern (split + send-text + Enter, discovered by task-14) — verified absent from 'herdr agent list', so the sidebar stays reserved for real agents. Findings recorded for TASK-11: (a) bare 'attach' is repo-scoped, (b) 'axi status' silently falls back to the repo's active run on a branch with no run — this is how the task-8 worker went blind to its own parked slice-0 run. TASK-11 subsumes or wraps this; qq-gate-view is the gate segment of the lifecycle view, not a competitor.
<!-- SECTION:NOTES:END -->
