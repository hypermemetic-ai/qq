---
id: doc-121
title: Plan — Land dropped pi-subagents 0.37 records
type: specification
created_date: '2026-07-28 05:37'
updated_date: '2026-07-28 05:37'
---
# Plan — Land dropped pi-subagents 0.37 records

## Intent

Preserve the two commits that exist only on primary `main`—decision-22 dropping the pi-subagents 0.37 Change and the archival move of T-166.3—as a normal reviewed Change based on current `origin/main`. Once this recovery branch is pushed, restore primary `main` to `origin/main` so the already-merged PR #276 can complete landing, Observer analysis, and retirement.

## Ownership boundary

This Change owns only:

- `backlog/decisions/decision-22 - Drop-the-pi-subagents-0.37-Change-entirely.md`
- the pure rename of T-166.3 from `backlog/tasks/` to `backlog/archive/tasks/`
- Task T-183 and this plan

The separate operational step, already approved by the operator, is restoring `/home/qqp/projects/qq` primary `main` to `origin/main` only after this branch is pushed.

## Non-goals

- No pi-subagents runtime, package, adapter, credential, or execution-profile change.
- No retry or repair of the dropped pi-subagents 0.37 Change.
- No merge by an agent.
- No rewrite of published candidate refs or other historical records.

## Decisions and dispositions

- Drop the pi-subagents 0.37 Change entirely — operator direction “drop it entirely,” recorded in local-only commit `117a188` as decision-22.
- Archive T-166.3 without completion or delivery — same operator disposition, recorded in local-only commit `63f334e`.
- Preserve the two local commits on a pushed recovery branch before primary restoration — operator selection of “Preserve + restore” in this session.
- Restore primary `main` only after preservation is pushed and do not merge any PR as an agent — explicit operator approval in this session.

## Success evidence

- The recovery branch contains decision-22 and the T-166.3 archival rename, based on `origin/main`.
- `git diff --check`, `tests/test-qq-task-identity.sh`, and `tests/test-ratchet.sh` pass.
- Fresh-context review finds no material introduced failure.
- The recovery branch is pushed before primary `main` is restored.
- The resulting PR has green GitHub Checks and is handed to the operator without merge.
