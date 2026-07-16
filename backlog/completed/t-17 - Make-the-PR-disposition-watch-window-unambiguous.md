---
id: T-17
title: Make the PR disposition watch window unambiguous
status: Done
assignee:
  - '@codex'
created_date: '2026-07-13 02:15'
updated_date: '2026-07-13 02:16'
labels: []
dependencies: []
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The deliver-change Skill currently says to watch a pull request for up to three minutes. That wording was interpreted as permission to stop after a short poll while the PR remained open. Clarify the procedure so monitoring lasts the full three-minute window unless the pull request reaches a terminal disposition earlier.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Step 9 requires polling for the full three-minute monitoring window while the pull request remains open
- [x] #2 Step 9 allows early exit only when the pull request state changes and reports an open PR only after the full window elapses
- [x] #3 The updated deliver-change Skill passes the skill validator
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite deliver-change step 9 to define an explicit three-minute window and its only early-exit condition. 2. Validate the Skill and inspect the exact diff. 3. Finalize this Task and deliver the focused Change.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: skill-creator quick_validate reports Skill is valid; git diff --check passes. agents/openai.yaml remains accurate because the Skill still drives verified PR disposition.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Clarified deliver-change step 9: after browser handoff, poll until the PR is merged or closed or the complete three-minute window expires; a still-open poll is explicitly not a stopping condition. Skill validation and diff checks pass.
<!-- SECTION:FINAL_SUMMARY:END -->
