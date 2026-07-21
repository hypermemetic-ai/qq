---
id: T-73
title: >-
  Amend deliver-change step 11 to tolerate convention-sanctioned in-flight Task
  records
status: Done
assignee: []
created_date: '2026-07-17 03:25'
updated_date: '2026-07-17 03:37'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two landed rules contradict: deliver-change step 11 requires an empty git status --porcelain --untracked-files=all in the primary main checkout before ff-sync, while the hybrid Task-truth convention (doc-48, T-67) deliberately keeps every in-flight Task record as an untracked file under backlog/tasks/ in that same checkout. Any in-flight Change therefore blocks every other Change's post-merge sync. Observed live 2026-07-17: T-68's session refused its sync over T-70's in-flight record (plus a genuinely foreign file), and T-69's session deferred its sync; both required manual agent-messaging coordination and time-windowing to resolve. Operator approved (structured choice in the accountable session): amend step 11 so convention-sanctioned untracked Task records under backlog/tasks/ do not block the sync, while everything else still does — tracked modifications and any other untracked path (like 2026-07-17's foreign skill file) must still stop it. Keep step 12 and related empty-status language consistent, and cover the amendment in the conformance tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deliver-change step 11 tolerates untracked files under backlog/tasks/ in the primary checkout while still requiring an otherwise-empty status; tracked modifications and any other untracked path still block the sync
- [x] #2 Step 12's rails and any other empty-status references in the skill remain consistent with the amended step 11
- [x] #3 Conformance tests assert the amended wording and trip if step 11 regresses to the strict all-untracked rail
- [x] #4 The repository test suite passes
- [x] #5 Implementation is executed codex-first with a completion envelope verified against the tree
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Compose exact old-to-new work order for deliver-change step 11 plus conformance test coverage; create step11-rail work session; dispatch codex exec; verify envelope; review; PR; finalize; handoff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Executed codex-first from one exact old-to-new work order (step-11 replacement + test insertion); envelope verified against the tree with an independent owner regression probe (old sentence restored fails the conformance test; byte-identical restore verified). Fresh read-only codex review: no material findings; reviewer verified the git fast-forward untracked-path refusal against git-scm.com docs and confirmed the carve-out still blocks tracked/staged changes, foreign untracked files, and non-record entries under backlog/tasks/. Live evidence of the bug: T-68's session refused sync over T-70's record; T-69's deferred; T-72's own sync deferred behind this Task's record. Step 12's Change-checkout rails untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
deliver-change step 11 now admits only convention-sanctioned untracked Task records under backlog/tasks/ when checking the primary checkout before post-merge ff-sync; everything else still blocks. A conformance tripwire fails on regression to the strict rail. Delivered through PR #123.
<!-- SECTION:FINAL_SUMMARY:END -->
