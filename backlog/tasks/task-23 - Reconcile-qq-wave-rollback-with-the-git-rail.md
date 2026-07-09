---
id: TASK-23
title: Reconcile qq-wave rollback with the git rail
status: To Do
assignee: []
created_date: '2026-07-09 14:06'
labels:
  - gate
  - parallel-ok
  - hitl
dependencies: []
priority: medium
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
bin/qq-wave's rollback trap runs 'git branch -D' and 'git worktree remove --force'. The git rail blocks the branch-deletion half when an agent types it directly, but the rail is a Claude Code PreToolUse hook and never sees a git call made from inside a script — so qq's own tool performs, unattended, an operation the methodology forbids by hand. The rail also does not currently block direct 'git worktree remove --force'; that guard is procedural, not mechanical. On 2026-07-09 an independent review reproduced that trap destroying a live worker's branch and files (fixed in 1070a83 by disarming the rollback once the agent starts), but the underlying tension stands: the rollback still force-deletes on its remaining paths. Decide whether an automated rollback of a seconds-old, never-pushed claim branch is a sanctioned exception (and say so in the methodology), or whether it must use a non-destructive form. Related: unlanded branches today still need an operator to delete, because the rail blocks the agent's direct branch deletion.
<!-- SECTION:DESCRIPTION:END -->
