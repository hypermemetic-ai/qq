---
id: T-65
title: Rename Task id prefix TASK-n to T-n
status: Done
assignee: []
created_date: '2026-07-16 23:17'
updated_date: '2026-07-16 23:34'
labels: []
dependencies: []
type: chore
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One-time migration of the Backlog task id scheme from TASK-n to T-n for denser prose, commit subjects, and board columns. Covers config task_prefix, task file names, frontmatter ids, dependencies, and in-repo prose references. Git history, old PR titles, and old branch names keep the TASK-n spelling; the conventions doc records the cutover.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 backlog/config.yml has task_prefix "t" and backlog task create mints the next t-N id
- [x] #2 Every qq task file is named t-N with frontmatter id T-N; backlog doctor, task list, and task view resolve them
- [x] #3 In-repo prose references to qq tasks use T-n; other projects' task ids and historical branch names are untouched
- [x] #4 doc-48 documents the T-n scheme and the pre-cutover TASK-n history spelling
- [x] #5 Repository Checks pass on the Change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Sandbox-verify backlog.md 1.48 behavior across a manual task_prefix change (done: list/view/create/doctor all work; CLI config set refuses, manual config edit works). 2. Flip task_prefix to t in backlog/config.yml. 3. Rename task-N files to t-N in tasks/, completed/, archive/tasks/, drafts/. 4. Rewrite frontmatter ids and dependencies. 5. Sweep prose TASK-n to T-n, keeping other projects' task ids and historical branch names. 6. Record the cutover in doc-48. 7. Verify with backlog doctor, list, view, board, and repo tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sandbox-verified backlog.md 1.48 tolerates a manual task_prefix migration before touching the repo (config set refuses; direct config.yml edit + file rename + id rewrite works: list/view/create/doctor all resolve). Sweep rule settled and recorded in doc-48: uppercase TASK-N (always a qq task) renamed everywhere; lowercase task-n kept verbatim where it names another project's task, a historical branch/worktree, a quoted evidence path, or doc-6's old-scheme design narrative. Code review (fresh codex, read-only) confirmed the mechanical sweep complete and caught 5 lowercase prose refs that were live qq vocabulary (doc-42, doc-43, doc-46); fixed those plus 2 same-class refs (doc-45, doc-19). Note: bare-number lookup (task edit 65) does not resolve; use T-65.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Task id scheme migrated from TASK-n to T-n in one Change: task_prefix now "t", all 64 task files renamed to t-N with T-N frontmatter ids, every uppercase prose reference swept, decision-1/doc-19 slugs aligned, cutover and boundary rules documented in doc-48. Verified: backlog doctor clean, list/view resolve T-N ids, create mints t-66, board stays live, all 8 tests/test-*.sh pass (the CI suite). History keeps the old spelling; doc-48 says to grep both.
<!-- SECTION:FINAL_SUMMARY:END -->
