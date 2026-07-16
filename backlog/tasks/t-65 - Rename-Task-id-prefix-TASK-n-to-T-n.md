---
id: T-65
title: Rename Task id prefix TASK-n to T-n
status: In Progress
assignee: []
created_date: '2026-07-16 23:17'
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
- [ ] #1 backlog/config.yml has task_prefix "t" and backlog task create mints the next t-N id
- [ ] #2 Every qq task file is named t-N with frontmatter id T-N; backlog doctor, task list, and task view resolve them
- [ ] #3 In-repo prose references to qq tasks use T-n; other projects' task ids and historical branch names are untouched
- [ ] #4 doc-48 documents the T-n scheme and the pre-cutover TASK-n history spelling
- [ ] #5 Repository Checks pass on the Change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Sandbox-verify backlog.md 1.48 behavior across a manual task_prefix change (done: list/view/create/doctor all work; CLI config set refuses, manual config edit works). 2. Flip task_prefix to t in backlog/config.yml. 3. Rename task-N files to t-N in tasks/, completed/, archive/tasks/, drafts/. 4. Rewrite frontmatter ids and dependencies. 5. Sweep prose TASK-n to T-n, keeping other projects' task ids and historical branch names. 6. Record the cutover in doc-48. 7. Verify with backlog doctor, list, view, board, and repo tests.
<!-- SECTION:PLAN:END -->
