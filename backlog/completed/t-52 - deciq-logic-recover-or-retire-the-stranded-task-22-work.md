---
id: T-52
title: 'deciq-logic: recover or retire the stranded task-22 work'
status: Done
assignee: []
created_date: '2026-07-16 03:57'
updated_date: '2026-07-16 17:09'
labels: []
dependencies: []
priority: high
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The orphaned standalone clone at `~/.herdr/worktrees/deciq-logic/task-22` holds the only copy of four unpushed commits (through `afbcb85`) on `feat/task-22-publish-workflow`. Push the branch or explicitly decline it in the owning Backlog task, then remove the clone. Decide whether deciq-logic gets a persistent herdr home and board tab now that it has a board and in-flight work.

Do not delete the clone before pushing or recording an explicit decline: it is the only copy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The four commits are pushed, or their decline is recorded in the owning Backlog task
- [x] #2 The orphaned standalone clone is removed after the recovery or decline disposition
- [x] #3 The persistent herdr home and board-tab decision is recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Recovery, not decline: feat/task-22-publish-workflow pushed to origin (remote tip afbcb85 verified). Persistent home decision: YES — deciq-logic has a primary checkout (/home/qqp/projects/deciq-logic, main synced), a board, and in-flight work; herdr workspace 'deciq-logic' (w4E) created at the primary checkout with a 'board' tab. Remaining operator step: start 'backlog board' in that tab (herdr has no pane-exec). Clone removed after push verification; no stashes, no other unpushed refs, no herdr workspace referenced it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All four stranded commits recovered by pushing feat/task-22-publish-workflow (afbcb85 on origin). deciq-logic granted a persistent herdr home + board tab (workspace w4E). Orphaned clone removed after verified recovery.
<!-- SECTION:FINAL_SUMMARY:END -->
