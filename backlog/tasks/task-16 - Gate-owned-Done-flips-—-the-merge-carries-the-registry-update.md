---
id: TASK-16
title: Gate-owned Done flips — the merge carries the registry update
status: To Do
assignee: []
created_date: '2026-07-08 22:37'
updated_date: '2026-07-09 00:50'
labels:
  - afk
  - parallel-ok
dependencies: []
priority: medium
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator decision 2026-07-08: agents never author the Done flip; the landing does, so the board can neither overstate (Done before proof) nor lag (flip after merge). Wiring: the pipeline's document step (runs after review+test, before push/PR) flips to Done any In Progress task whose assignee equals the landing branch, as a pipeline-authored commit — the operator's merge click then lands code+Done atomically. Claim convention prerequisite: workers claim a task by setting assignee to their branch. Incidental registry edits to unclaimed tasks in the same diff are never flipped. Interim rule until wired: flip at gate handoff only (verification green, gate starting), and reverting the flip is the first repair action of a failed/abandoned landing. Context: raised by the operator when task-3 was marked Done before merge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A landing with a claimed (assignee=branch) In Progress task gets a pipeline-authored Done flip before push/PR
- [ ] #2 Unclaimed tasks edited in the same diff are untouched
- [ ] #3 Methodology documents the claim convention and retires the interim rule
<!-- AC:END -->
