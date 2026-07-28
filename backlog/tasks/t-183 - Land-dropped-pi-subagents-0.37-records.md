---
id: T-183
title: Land dropped pi-subagents 0.37 records
status: Done
assignee: []
created_date: '2026-07-28 05:36'
updated_date: '2026-07-28 05:50'
labels: []
dependencies: []
documentation:
  - >-
    backlog/docs/plans/doc-121 -
    Plan-—-Land-dropped-pi-subagents-0.37-records.md
modified_files:
  - >-
    backlog/decisions/decision-22 -
    Drop-the-pi-subagents-0.37-Change-entirely.md
  - >-
    backlog/archive/tasks/t-166.3 -
    Update-pi-subagents-0.37-and-retire-subsumed-qq-machinery.md
priority: medium
type: chore
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Preserve and deliver the operator-approved records that drop the pi-subagents 0.37 Change, moving them out of the diverged primary checkout and into a reviewed GitHub Flow Change.

Decision ledger:
- Drop the pi-subagents 0.37 Change entirely — operator direction “drop it entirely,” recorded in local-only commit `117a188` as decision-22 and preserved by this Change.
- Archive T-166.3 without completion or delivery — same operator disposition, recorded in local-only commit `63f334e` and preserved by this Change.
- Preserve the two primary-local commits on a pushed recovery branch before restoring primary `main` to `origin/main` — operator selection of “Preserve + restore” in this session.
- Primary `main` restoration happens only after preservation is pushed, and no pull request is merged by an agent — explicit operator approval in this session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Change preserves decision-22, recording the operator decision to drop the pi-subagents 0.37 Change entirely.
- [x] #2 The Change moves T-166.3 from backlog/tasks to backlog/archive without altering its task content.
- [x] #3 The Change includes an owning Task and approved plan record describing the recovery boundary.
- [x] #4 The recovery branch is pushed before primary main is restored, and the resulting PR is green and handed off without agent merge.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification 2026-07-28: recovery commits bd87f0b and 58bf7af preserve the two primary-local records byte-for-byte against source commits 117a188 and 63f334e; T-166.3 is a pure rename into backlog/archive and absent from backlog/tasks. tests/test-qq-task-identity.sh, tests/test-ratchet.sh, git diff --check, and Task/plan whitespace checks pass.

Fresh-context review returned APPROVE with no material findings after independently re-verifying hashes, path presence/absence, base, ID collision, dangling references, diff hygiene, and focused tests. The reviewer substrate again failed after capturing the valid completion envelope because its execution-profile receipt directory was absent; the resume repeated that infrastructure failure while preserving the APPROVE output. Its ratchet limitation was confined to unavailable /dev/fd process substitution in the confined sandbox; the owner-run ratchet passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered PR #277. decision-22 and the pure T-166.3 archival rename are preserved from the two primary-local commits onto a reviewed Change based on current origin/main. The recovery branch was pushed before the operator-approved primary-main restoration; primary main was then restored to origin/main so merged PR #276 could land. Focused Checks, ratchet, task identity, diff hygiene, and GitHub shell-tests are green. Fresh-context review returned APPROVE with no material findings; the post-envelope receipt-path infrastructure failure and confined /dev/fd ratchet limitation are recorded in the notes. No runtime, package, adapter, credential, execution-profile, or PR merge action was taken.
<!-- SECTION:FINAL_SUMMARY:END -->
