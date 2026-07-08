---
id: TASK-4
title: Add §Parallel operation to the methodology
status: To Do
assignee: []
created_date: '2026-07-08 14:41'
updated_date: '2026-07-08 17:13'
labels: []
dependencies:
  - TASK-2
  - TASK-3
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Instruction layer from ideas/05 Part 2: tree-ownership protocol (one writer per tree; main tree belongs to the operator's interactive session), shared-surface conventions (append-only docs land via merge; sequence numbers claimed by file creation), global-config rule (skill/cockpit edits happen in a worktree, land via the gate). EXTENDED 2026-07-08 (frontier adoption, from mattpocock v1.1 to-tickets/wayfinder): tasks declare blocking edges in dependencies at creation; frontier = every task whose deps are all Done and assignee is empty; claiming = setting assignee (claim-by-assignment, no claim labels); hitl/afk labels — hitl tasks need live human exchange and are never claimed by background agents; ship bin/qq-frontier (~20 lines) to list claimable tasks since the CLI has no dependency-state filter. All of it lands in §Parallel operation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Frontier definition, claim-by-assignment, and hitl/afk labels documented in §Parallel operation
- [ ] #2 bin/qq-frontier lists exactly the claimable tasks (deps Done, unassigned)
<!-- AC:END -->
