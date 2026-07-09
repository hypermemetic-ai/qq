---
id: TASK-8
title: 'Orchestrate rework: Codex workers as first-class herdr panes'
status: Done
assignee:
  - task-8-orchestrate-panes
created_date: '2026-07-08 14:41'
updated_date: '2026-07-09 00:26'
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
- [x] #1 Codex workers run as named herdr agents with visible pane + status
- [x] #2 Conductor hand-off protocol uses wait --status idle plus a file-based report, not scrollback parsing
- [x] #3 codex exec resume --last no longer appears anywhere in orchestrate
- [x] #4 Planned as parent + dependency-linked slices; each slice lands as its own gated run
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Design doc: docs/plans/2026-07-08-orchestrate-codex-panes.md (updated 07-08 with approved substrate: tab-per-task pane topology, herdr 0.7.3 observe primitives, resume-by-id). SLICING PILOT: parent + dependency-linked slices, each its own gated run on a stacked branch — slice 0 = plan (this landing), task-8.1 = skill rewrite, task-8.2 = records retirement run as live e2e through the new Build path (dep 8.1), task-8.3 = lessons + close-out (dep 8.1, 8.2). Lifecycle: agent start cx-<branch> --cwd <tree> --tab <conductor-tab> --split; brief/report via .qq/handoffs/<n>-{brief,report}.md; wait --status idle; repair in-pane; dead pane -> codex resume <session-id> (--last banned).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landed as the slicing pilot: slice 0 (plan, PR #11, gate run 01KX23ECCG passed 0 findings) -> 8.1 skill rewrite -> 8.2 records retirement executed THROUGH the new Build path (live e2e: worker pane w7:pQ, session 019f443a captured at first handoff, two file-based handoffs incl. deliberate red->repair in-pane) -> 8.3 lessons + close-out. AC evidence: (1) skill lifecycle steps 1-7 + live worker cx-task-8.2-records-e2e with sidebar status transitions; (2) wait --status idle + .qq/handoffs/<n>-report.md as report of record, no scrollback parsing (evidence in task-8.2 notes); (3) rg 'resume --last|codex exec' skills/orchestrate/ -> no matches — dead-pane recovery is codex resume <session-id> via herdr agent get, --last banned; (4) task-8.1/8.2/8.3 dep-linked under this parent, each on its own stacked branch with its own axi run. Pilot lessons: ideas/06-slicing-pilot-lessons.md (idea #11). Surface note for TASK-11: orchestrate now spawns worker panes into the conductor's tab (tab-per-task, ~3 panes/tab).
<!-- SECTION:NOTES:END -->
