---
id: TASK-40
title: 'deliver-change diet round 2 (attach-default, agent labels, honest handoff)'
status: Done
assignee: []
created_date: '2026-07-14 22:47'
updated_date: '2026-07-15 00:57'
labels: []
dependencies:
  - TASK-39
documentation:
  - doc-42
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per doc-42: slim the delivery choreography that survived Phase 4, using the TASK-35 delivery evidence. Attaching an existing checkout (including harness-created worktrees) becomes the documented default; change labels become agent-chosen and operator-renameable; the handoff verifies the notification result instead of assuming it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deliver-change documents attach-existing-checkout as the default path when a checkout already exists, including harness-created worktrees
- [x] #2 Change labels are agent-chosen and operator-renameable, and the CONCEPTS.md work-session definition matches
- [x] #3 The handoff step verifies the notification result and, when notifications are disabled, plainly reports the browser-only fallback instead of claiming a notification was sent
- [x] #4 Repository suites pass
- [x] #5 After the handoff, the accountable agent arms a harness-native background disposition watch on the open pull request — a single-notification until-loop covering both merged and closed states — so the disposition wakes it for post-merge synchronization and follow-on dispatch without the operator typing a confirmation; deliver-change documents this in the handoff step
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered doc-42 Change 2 with in-flight operator amendments. AC1: deliver-change step 1 makes attaching an existing checkout (including harness-created worktrees) the default, creation the fallback with explicit base; safety requirements (label uniqueness, linked-worktree verification, qq-herdr-pull adoption, never inheriting incidental HEAD) preserved. AC2: labels are agent-chosen and operator-renameable in deliver-change and the CONCEPTS.md work-session definition. AC3: the handoff verifies the notification result and plainly reports the browser-only fallback when notifications are disabled or the command fails. AC4: shell suite 7/7 PASS and BPMN 16 pass/0 fail/2 skipped, rerun by the owner outside the codex sandbox on the reconciled head (worker's in-sandbox BPMN failure was the sandbox's nested-Node EPERM denial, diagnosed in the envelope). AC5: step 9 arms a harness-native single-notification disposition watch — GitHub CLI until-loop polling every 5 seconds by operator decision, exiting on MERGED or CLOSED — and step 10 treats the watch wake as a resume trigger. Superseded during the Change by operator UAT: the observability-pane criterion was withdrawn after two live rendering variants proved too noisy; its skill prose was removed, a negative test guard blocks reintroduction, and TASK-42 now owns delegate visibility as a status-surface design round (doc-42 Amendments record both decisions). Review loop: round 1 returned one finding (stale implementation note claiming the withdrawn pane and an unverified BPMN status); this notes rewrite is the prescribed fix, applied at finalization. Implemented by a gpt-5.6-sol delegate from a work-order brief; envelope verified claim-by-claim; owner reconciliation applied the operator's 5-second and pane-withdrawal decisions before review.
<!-- SECTION:NOTES:END -->
