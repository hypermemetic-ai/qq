---
id: T-43
title: Sweep Done tasks to the completed folder
status: Done
assignee: []
created_date: '2026-07-15 02:38'
updated_date: '2026-07-15 02:40'
labels: []
dependencies: []
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator asked to wrap up tasks (2026-07-14). Delivery residue was cleaned locally (20 merged worktrees and 40 merged branches removed; no open PRs). This Change performs the board-side wrap-up: move every Done task from backlog/tasks/ to backlog/completed/ via the backlog CLI, leaving only open work on the active board. T-37 and T-42 remain To Do and are untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every task with status Done is moved from backlog/tasks/ to backlog/completed/
- [x] #2 Tasks T-37 and T-42 remain in backlog/tasks/ unchanged
- [x] #3 Task files are moved intact (content unchanged apart from location)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved all 37 Done tasks from backlog/tasks/ to backlog/completed/ via backlog task complete; git shows 37 pure renames (R100) with zero content change. T-37 and T-42 untouched and remain the only open work. All shell tests pass locally. Session-side wrap-up in the same operator request: removed 20 stale merged worktrees and 40 merged local branches; no open PRs remained.
<!-- SECTION:FINAL_SUMMARY:END -->
