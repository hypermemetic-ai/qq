---
id: TASK-4
title: Add §Parallel operation to the methodology
status: Done
assignee:
  - task-4-parallel-operation
created_date: '2026-07-08 14:41'
updated_date: '2026-07-09 03:00'
labels:
  - parallel-ok
dependencies:
  - TASK-2
  - TASK-3
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add §Parallel operation to qq-methodology.md: tree-ownership protocol (one writer per working tree; main tree belongs to the operator's interactive session; background producers in a tree they don't own are read-only + stamp their own qq-phase producer slot), shared-surface conventions (CONCEPTS.md appends, docs/solutions/ pruning, ideas/NN- and research/ numbering — write on own branch, land via merge; claim sequence numbers by filename creation), global-config rule (skills/ and cockpit/ edits happen in a worktree and land via the gate — the main checkout is live-linked into every session). PLUS parallel dispatch (operator ask, 2026-07-08): make flagging parallelizable work a standing part of triage — every task gets a parallel-ok label or a blocked-by note at creation/triage time; when the operator asks for 'next task' with a deep queue, the agent proposes a wave (independent parallel-ok tasks fanned out via herdr worktrees, one agent per task, each claiming its task in the registry) instead of defaulting to serial. Thread the one-line rules into the affected skills. BRANCH NAMING (operator approved 2026-07-08, document in the same methodology edit): task work branches are task-<id>-<slug> (e.g. task-5-compound-rename); conventional feat/chore prefixes are retired for task work — the registry already types the intent, and the task id is what the claim convention (TASK-16: assignee = branch) and the lifecycle view (TASK-11) join on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Frontier definition, claim-by-assignment, and hitl/afk labels documented in §Parallel operation
- [x] #2 bin/qq-frontier lists exactly the claimable tasks (status To Do, deps Done, unassigned)
- [x] #3 Triage/routing text tells agents to flag parallelizable work (label + blocked-by) and to propose herdr fan-out waves unprompted when the queue is deep
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landed via task-4-parallel-operation. §Parallel operation added to qq-methodology.md: frontier definition (To Do + deps Done + unassigned + no task-<id> branch anywhere — the branch is the cross-tree claim signal, closing the hole where worker claims are invisible from main until merge), claim-by-assignment, task-<id>-<slug> / task-<id>.<n>-<slug> branch naming (feat/chore prefixes retired), parallel-ok + hitl/afk triage labels, dispatchability bar (dispatcher front-loads Align; workers enter at Plan; under-specified tasks stay with the conductor — from operator exchange 2026-07-08 on worker/orchestrate roles), worker composition (interim Claude-solo, destination TASK-8 tab-per-task with Codex right-split panes), tree ownership, shared-surface conventions, global-config rule, conductor duties. Routing section: triage flags parallel-ok + hitl/afk unprompted and proposes frontier waves on deep queues. bin/qq-frontier built (--afk/--json; TASK-19 later added --ref for same-commit dispatch); verified against live registry (5 claimable; tasks 6/7/8/14 excluded via branch claims, 11 via new dep on TASK-8) plus synthetic slice-branch test (task-16.1-* correctly claims TASK-16). A 2026-07-08 grooming pass added bin/qq-frontier to the gate shellcheck lint list; future frontier/gate-view helpers should join that list when they land. Retro-labeled open tasks hitl/afk; recorded TASK-11 dep on TASK-8. One-liners threaded into compound and research skills (own-branch shared-surface rule).
<!-- SECTION:NOTES:END -->
