---
id: TASK-13
title: Recover approved local outputs and reconcile Git state
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-12 22:21'
updated_date: '2026-07-12 22:26'
labels: []
dependencies: []
documentation:
  - doc-23
modified_files:
  - backlog/docs/doc-1 - Ideas.md
  - >-
    backlog/docs/solutions/doc-22 -
    BPMN-plan-generation-is-already-interactive-speed.md
  - cockpit/herdr/config.toml
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recover the three previously approved outputs that were expected to be live but remain only in the primary worktree/stash, deliver them through one GitHub Flow Change, and remove obsolete merged worktrees, merged local branches, superseded stashes, and historical WIP refs after preservation is proven. Leave orphan commit 8ed35f2 unreferenced as directed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Ideas entry, BPMN performance solution, and Herdr panel sort setting are present on a branch based on current origin/main with their approved content preserved.
- [ ] #2 Fresh checks demonstrate the recovered files are valid and the primary checkout can be synchronized without losing them.
- [ ] #3 The recovered repository modifications pass fresh-context review, are committed and pushed through one pull request, and the Task is finalized in that Change.
- [ ] #4 The six clean merged auxiliary worktrees and their merged local branches, all three superseded stashes, and all historical refs/wip snapshots are removed only after recovery is safely represented in Git.
- [ ] #5 The primary main checkout is clean and synchronized to current origin/main; orphan commit 8ed35f2 is not rescued or preserved by a new ref.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory and revalidate the recovery and cleanup surfaces. 2. Create an isolated Change from freshly fetched origin/main and transfer the approved outputs plus planning records. 3. Validate and independently review the exact Change, then commit, push, open/finalize the pull request, and verify its green state. 4. After preservation is proven, clean and synchronize the primary checkout, remove obsolete worktrees/branches/stashes/WIP refs, and verify final Git invariants. 5. Record BPMN conformance after the Change lands.
<!-- SECTION:PLAN:END -->
