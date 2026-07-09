---
id: TASK-8
title: 'Orchestrate rework: Codex workers as first-class herdr panes'
status: To Do
assignee: []
created_date: '2026-07-08 14:41'
updated_date: '2026-07-08 21:53'
labels:
  - parallel-ok
dependencies: []
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Idea #9, decided 07-08: replace headless codex exec with herdr agent start <name> -- codex so Codex workers get their own pane, sidebar state, and the send/read/wait comms surface (idea #8). Pane mechanics smoke-tested 07-08: auto-detected as agent codex, status transitions idle-working-idle, session id captured by herdr (dissolves the resume --last cross-worktree hazard). Design doc first (docs/plans/), then its own gated branch. PILOT (operator decision 2026-07-08): this feature is the slicing pilot for the frontier model — plan it by hand as a parent task + dependency-linked slice sub-tasks (tracer bullets), each slice landing through the gate as its own small unattended run; writing-plans/executing-plans get reworked only from this pilot's lessons.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Codex workers run as named herdr agents with visible pane + status
- [ ] #2 Conductor hand-off protocol uses wait --status idle plus a file-based report, not scrollback parsing
- [ ] #3 codex exec resume --last no longer appears anywhere in orchestrate
- [ ] #4 Planned as parent + dependency-linked slices; each slice lands as its own gated run
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Design doc: docs/plans/2026-07-08-orchestrate-codex-panes.md (written 07-08, rides the rework branch). Lifecycle: agent start cx-<branch> per tree; brief/report via .qq/handoffs/<n>-{brief,report}.md; wait --status idle; repair in-pane (resume --last deleted).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Surface overlap with TASK-11 (both reshape herdr panes/layout around the orchestrate/gate view). Parallel-ok, but if run in the same wave, the two agents should talk via herdr send/read before touching cockpit/herdr config; otherwise sequence 8 → 11. PANE TOPOLOGY (operator direction + judged 2026-07-08): tab-per-task — orchestrator pane first in the tab, delegation spawns worker panes in the same tab (agent start --tab/--split; 0.7.2 fixed pane split --current to resolve to the calling pane). Cap ~3 panes/tab; overflow to a second tab or the sidebar/session navigator. Worktree affinity is per-pane (--cwd), so tabs can span worktrees; each task's conductor+worker pair shares that task's worktree (Codex holds the tree, conductor reads only). Design against herdr 0.7.2+ (upgrade lands before the wave): 'herdr terminal session observe' gives a read-only NDJSON ANSI stream of a pane — the conductor can watch a Codex worker without stealing input; 'herdr terminal session control' adds input/resize/takeover authority; session.snapshot bootstraps socket state in one call; layout.updated tracks pane mutations; 'herdr api schema --json' documents the API. Also: 0.7.2 fixes stale saved agent-session references on resumed panes — adjacent to the Codex-resume worktree-scoping this task absorbed (capture session id at first handoff; resume by id; --last banned in parallel operation).
<!-- SECTION:NOTES:END -->
