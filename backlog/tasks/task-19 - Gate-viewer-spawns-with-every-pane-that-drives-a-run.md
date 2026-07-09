---
id: TASK-19
title: Gate viewer spawns with every pane that drives a run
status: Done
assignee:
  - task-19-gate-viewer-panes
created_date: '2026-07-09 01:13'
updated_date: '2026-07-09 02:09'
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
- [x] #3 qq-activate.sh puts qq-gate-view (and qq-frontier) on PATH — typing the command works without an absolute path
- [x] #4 bin/qq-wave spawns a viewer right-split beside every worker it launches (the in-repo call site), and refuses to dispatch a task that is not on the frontier
- [x] #5 qq-wave reads the frontier from the same commit its workers are created from (origin/main), so dispatch state and worker checkout can never disagree
<!-- AC:END -->





## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bin/qq-gate-view wraps 'no-mistakes attach' (reuse-first: the gate's TUI renders; the wrapper fixes scoping and lifetime). bin/qq-wave is the in-repo call site that makes 'any pane that needs one spawns with one' true, promoted from an ad-hoc scratchpad launcher on operator direction after gate finding NM-002 correctly showed AC3 was aspirational. AC1: guard accepts a status block only when its branch: field matches this worktree — verified from the task-19 worktree (repo-active run was task-8's; REJECTed) and task-14's (own run; ACCEPTed). AC2: viewer spawned before any run existed showed the waiting banner, then attached to this branch's run by id and rendered the pipeline live; attach is supervised so finished/cancelled/superseded runs do not freeze the pane. AC3: qq-activate.sh now links qq-gate-view AND qq-frontier — the latter shipped in TASK-4 and was never on PATH because the install list is hardcoded. AC4: qq-wave --dry-run accepts frontier tasks (16,17), refuses claimed (TASK-8) and dependency-blocked (TASK-11) tasks, and each launch spawns worker pane + gate-view right split. AC5: qq-wave fetches origin/main, creates workers from that commit, and calls qq-frontier --ref with the same commit; the old behind-main guard is gone because the conductor's tree is not consulted, and task titles come from the frontier JSON. Additional fixes: qq-frontier's remote-branch loop no longer shadows the registry revision variable, and qq-gate-view --repo follows the repo's active run for conductor panes on main. Findings for TASK-11: (a) bare 'attach' is repo-scoped; (b) 'axi status' silently falls back to the repo active run on a branch with no run — how the task-8 worker went blind to its own parked slice-0 run; (c) qq-activate's hardcoded install list silently drops new bin/ tools. Gate findings honored: NM-002 (real; fixed by promoting the launcher rather than narrowing the AC) and RV-002 (real; same-commit frontier/worker source).
<!-- SECTION:NOTES:END -->
