---
id: T-61
title: Sweep merged qq worktrees and branches behind doc-44 rails
status: Done
assignee: []
created_date: '2026-07-16 16:43'
updated_date: '2026-07-16 17:09'
labels: []
dependencies: []
priority: medium
type: chore
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Housekeeping found during board-driven dispatch (2026-07-16): three linked worktrees under ~/.herdr/worktrees/qq (chore-adopt-tooling-148, chore-task-55-remove-bpmn, feat-deliver-change-codex-first) are clean, attached to their branches, and merged into origin/main, with no herdr work sessions. Predates T-49 retire-at-source. Remove behind doc-44 rails: unforced git worktree remove + git branch -d only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All three worktrees and their branches are removed with every doc-44 rail green, or the tripped rail is reported
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
chore-adopt-tooling-148, chore-task-55-remove-bpmn, and feat-deliver-change-codex-first removed with every doc-44 rail green (clean, attached, merged into freshly fetched origin/main, no herdr work sessions); branches deleted with git branch -d. Only the live T-57 Change worktree remains under ~/.herdr/worktrees/qq.
<!-- SECTION:FINAL_SUMMARY:END -->
