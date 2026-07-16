---
id: T-51
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
Operator wrap-up request (2026-07-15). This Change performs board-side hygiene per T-43 precedent by moving the Done tickets T-37, T-42, T-43, T-44, and T-47 from the active board to backlog/completed/ — extended mid-Change with T-48, which merged to main (PR #100) while the sweep was in flight and landed Done on the active board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every task with status Done is moved from backlog/tasks/ to backlog/completed/ intact (pure renames).
- [x] #2 Open tasks (T-45, T-49, T-50) are untouched.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved T-37, T-42, T-43, T-44, and T-47 from backlog/tasks/ to backlog/completed/ via backlog task complete; Git reports five 100% renames with no content changes. T-45, T-49, and T-50 remain untouched.

Extended mid-Change: T-48 (merged via PR #100 while the sweep was in flight) was also moved to backlog/completed/ after rebasing onto origin/main; Git reports it as a sixth 100% rename.
<!-- SECTION:FINAL_SUMMARY:END -->
