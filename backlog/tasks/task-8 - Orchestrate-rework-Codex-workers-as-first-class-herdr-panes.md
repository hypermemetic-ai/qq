---
id: TASK-8
title: 'Orchestrate rework: Codex workers as first-class herdr panes'
status: To Do
assignee: []
created_date: '2026-07-08 14:41'
updated_date: '2026-07-08 17:13'
labels: []
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
