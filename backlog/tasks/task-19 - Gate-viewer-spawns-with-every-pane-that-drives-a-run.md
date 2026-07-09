---
id: TASK-19
title: Gate viewer spawns with every pane that drives a run
status: In Progress
assignee:
  - task-19-gate-viewer-panes
created_date: '2026-07-09 01:13'
updated_date: '2026-07-09 01:13'
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
- [ ] #1 bin/qq-gate-view attaches only to the current branch's run and never to another branch's run
- [ ] #2 A viewer pane spawned before any run exists waits, then attaches when the branch's run starts
- [ ] #3 The wave launcher spawns a viewer as a right split in every task tab
<!-- AC:END -->
