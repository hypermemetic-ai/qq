---
id: TASK-11
title: Make Change delivery a one-PR handoff
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-12 18:30'
updated_date: '2026-07-12 18:31'
labels:
  - methodology
  - delivery
dependencies: []
documentation:
  - doc-20
modified_files:
  - skills/deliver-change/SKILL.md
  - openwiki/workflows.md
  - >-
    backlog/docs/research/doc-20 -
    GitHub-merge-coupling-for-branch-resident-Task-status.md
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Correct the end-of-Change contract exposed by PRs #32/#33 and #34/#35. Task status records whether the agreed work is complete; GitHub records whether its Change received the operator's final acceptance and merged. Finalize the Task inside its original Change, open the actual PR page for the operator, and perform post-merge verification without another repository write.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The original Change carries its Task's checked acceptance criteria, final summary, and Done status before final merge handoff
- [ ] #2 Task Done means the agreed work is verified complete; GitHub Merged means the operator accepted and landed its Change
- [ ] #3 Feedback showing failure against existing acceptance criteria reopens the same Task, while changed or additional intent requires operator-approved follow-up work
- [ ] #4 After merge, the owning agent verifies the landed Change and reports evidence without creating a Task-finalization Change
- [ ] #5 The delivery procedure explicitly opens the pull request in the operator's browser and reports the URL if browser dispatch fails or visibility is not confirmed
- [ ] #6 Current methodology documentation agrees with the one-PR Task-to-Change lifecycle
- [ ] #7 The updated skill passes structural validation, focused consistency checks, fresh-context review, and hands-on browser UAT
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the settled branch-dimensional Task model and record the GitHub-mechanics evidence. 2. Rewrite deliver-change around Task completion before merge handoff, explicit browser dispatch, and read-only post-merge verification. 3. Align current workflow documentation. 4. Validate and independently review the exact delta. 5. Open this Change's PR in the operator browser, record UAT, finalize this Task in the same PR, then verify any eventual merge without a follow-up Change.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research confirmed that native GitHub merge cannot transform a branch-resident Task file. The operator retained the original Task/Change split and declined automation or a status-surface migration; doc-20 records the evidence.
<!-- SECTION:NOTES:END -->
