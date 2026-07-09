---
id: TASK-8.2
title: Records retirement via the new Build path (live e2e)
status: To Do
assignee: []
created_date: '2026-07-09 00:07'
labels:
  - slice
dependencies:
  - TASK-8.1
parent_task_id: TASK-8
priority: high
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Slice 2 of TASK-8 (pilot). Two jobs in one: (a) retire the resume --last / stdin-hang records — mark ideas/03 superseded (rationale survives for background side-quest use, ideas/01), close ideas/05 Part 2 item 3 (resolved by TASK-8: session id captured by herdr, resume by id, --last deleted from orchestrate), update ideas/README.md pointers; (b) implement it THROUGH the new Build path as the live e2e exercise of slice 1's lifecycle: conductor starts a cx- worker pane in its own tab, drives two handoffs (one clean, one deliberately red-then-repair via brief scoping), reads .qq/handoffs/<n>-report.md files back, captures evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ideas/03 marked superseded; ideas/README.md updated; ideas/05 Part 2 item 3 marked resolved
- [ ] #2 No live doc teaches resume --last as an orchestrate handoff (rg proof)
- [ ] #3 Edits implemented by a Codex pane worker via brief/report handoff files, not by the conductor
- [ ] #4 Evidence bundle (worker start cmd, wait, red->repair round, reports) recorded in this task file
<!-- AC:END -->
