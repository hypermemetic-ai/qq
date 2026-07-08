---
id: TASK-8
title: 'Orchestrate rework: Codex workers as first-class herdr panes'
status: To Do
assignee: []
created_date: '2026-07-08 14:41'
labels: []
dependencies: []
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Idea #9, decided 07-08: replace headless codex exec with herdr agent start <name> -- codex so Codex workers get their own pane, sidebar state, and the send/read/wait comms surface (idea #8). Pane mechanics smoke-tested 07-08: auto-detected as agent codex, status transitions idle-working-idle, session id captured by herdr (dissolves the resume --last cross-worktree hazard). Design doc first (docs/plans/), then its own gated branch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Codex workers run as named herdr agents with visible pane + status
- [ ] #2 Conductor hand-off protocol uses wait --status idle plus a file-based report, not scrollback parsing
- [ ] #3 codex exec resume --last no longer appears anywhere in orchestrate
<!-- AC:END -->
