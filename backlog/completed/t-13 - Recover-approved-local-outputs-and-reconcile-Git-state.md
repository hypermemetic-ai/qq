---
id: T-13
title: Recover approved local outputs and reconcile Git state
status: Done
assignee:
  - '@codex'
created_date: '2026-07-12 22:21'
updated_date: '2026-07-12 22:40'
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
- [x] #1 The Ideas entry, BPMN performance solution, and Herdr panel sort setting are present on a branch based on current origin/main with their approved content preserved.
- [x] #2 Fresh checks demonstrate the recovered files are valid and the primary checkout can be synchronized without losing them.
- [x] #3 The recovered repository modifications pass fresh-context review, are committed and pushed through one pull request, and the Task is finalized in that Change.
- [x] #4 The six clean merged auxiliary worktrees and their merged local branches, all three superseded stashes, and all historical refs/wip snapshots are removed only after recovery is safely represented in Git.
- [x] #5 The primary main checkout is clean and synchronized to current origin/main; orphan commit 8ed35f2 is not rescued or preserved by a new ref.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory and revalidate the recovery and cleanup surfaces. 2. Create an isolated Change from freshly fetched origin/main and transfer the approved outputs plus planning records. 3. Validate and independently review the exact Change, then commit, push, open/finalize the pull request, and verify its green state. 4. After preservation is proven, clean and synchronize the primary checkout, remove obsolete worktrees/branches/stashes/WIP refs, and verify final Git invariants. 5. Record BPMN conformance after the Change lands.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Recovery branch `chore/recover-git-state` was created by Herdr from freshly fetched `origin/main` at d29af43. The three approved outputs and required T-13/doc-23 BPMN records were transferred into the isolated Change. Fail-fast checks passed for JSON/TOML parsing, Backlog linkage/listing, exact stash-content preservation after approved ID/timestamp normalization, Herdr-supported `spaces` semantics, BPMN lint and lossless evidence round trip, three-artifact shape, and diff hygiene. Fresh-context review found two plan sequencing defects; the plan was corrected with a delayed-disposition loop and explicit post-merge primary synchronization, regenerated, re-approved by the operator, and the exact corrective delta received no material findings.

Commit 84b4911 was pushed and PR #43 opened. Remote branch SHA and every recovered/planning blob matched the local committed tree before cleanup began. Six clean merged auxiliary worktrees and their six associated local branches were removed through Herdr plus safe branch deletion; all three stashes and 15 historical refs/wip snapshots were deleted. Primary main was cleaned without reset --hard and fast-forwarded to origin/main d29af43. Final checks observed exactly the primary and active recovery worktrees, clean synchronized primary main, clean pushed recovery worktree, no stashes, no refs/wip, absent retired worktree paths/branches, and no ref containing orphan 8ed35f2. The operator accepted the temporary pre-merge Herdr sort reversion; the approved plan restores `spaces` durably by synchronizing primary main after merge.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recovered the three approved local outputs into one reviewed, pushed Change and opened PR #43. Proved the remote commit contained every recovered artifact before removing local preservation sources. Retired six clean merged worktrees and their branches, cleared three superseded stashes and 15 WIP refs, and left primary main clean and synchronized. The deliberately abandoned orphan 8ed35f2 remains unreferenced. Post-merge synchronization and BPMN conformance remain disposition steps, not agent-side merge work.
<!-- SECTION:FINAL_SUMMARY:END -->
