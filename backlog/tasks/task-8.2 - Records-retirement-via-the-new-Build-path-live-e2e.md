---
id: TASK-8.2
title: Live e2e proof for worker-pane Build path
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
Slice 2 of TASK-8 (pilot). The resume --last / stdin-hang records now carry the slice-1 documentation sync: ideas/03 is superseded for orchestrate, ideas/05 Part 2 item 3 is resolved for orchestrate, and ideas/README.md points at the worker-pane lifecycle. This slice validates the records stay clean and implements a live e2e exercise THROUGH the new Build path: conductor starts a cx- worker pane in its own tab, drives two handoffs (one clean, one deliberately red-then-repair via brief scoping), reads .qq/handoffs/<n>-report.md files back, captures evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Residual record drift fixed if found; ideas/03, ideas/README.md, and ideas/05 still point at the worker-pane lifecycle
- [ ] #2 No live doc teaches resume --last as an orchestrate handoff (rg proof)
- [ ] #3 Edits implemented by a Codex pane worker via brief/report handoff files, not by the conductor
- [ ] #4 Evidence bundle (worker start cmd, wait, red->repair round, reports) recorded in this task file
<!-- AC:END -->
