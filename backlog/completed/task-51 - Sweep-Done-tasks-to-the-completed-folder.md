---
id: TASK-51
title: Sweep Done tasks to the completed folder
status: Done
assignee: []
created_date: '2026-07-16 03:38'
updated_date: '2026-07-16 03:50'
labels: []
dependencies: []
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator wrap-up request (2026-07-15). This Change performs board-side hygiene per TASK-43 precedent by moving the Done tickets TASK-37, TASK-42, TASK-43, TASK-44, and TASK-47 from the active board to backlog/completed/ — extended mid-Change with TASK-48, which merged to main (PR #100) while the sweep was in flight and landed Done on the active board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every task with status Done is moved from backlog/tasks/ to backlog/completed/ intact (pure renames).
- [x] #2 Open tasks (TASK-45, TASK-49, TASK-50) are untouched.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved TASK-37, TASK-42, TASK-43, TASK-44, and TASK-47 from backlog/tasks/ to backlog/completed/ via backlog task complete; Git reports five 100% renames with no content changes. TASK-45, TASK-49, and TASK-50 remain untouched.

Extended mid-Change: TASK-48 (merged via PR #100 while the sweep was in flight) was also moved to backlog/completed/ after rebasing onto origin/main; Git reports it as a sixth 100% rename.
<!-- SECTION:FINAL_SUMMARY:END -->
