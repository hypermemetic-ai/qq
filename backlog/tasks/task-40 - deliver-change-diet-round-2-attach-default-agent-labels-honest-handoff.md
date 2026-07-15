---
id: TASK-40
title: 'deliver-change diet round 2 (attach-default, agent labels, honest handoff)'
status: In Progress
assignee: []
created_date: '2026-07-14 22:47'
updated_date: '2026-07-15 00:53'
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
- [ ] #1 deliver-change documents attach-existing-checkout as the default path when a checkout already exists, including harness-created worktrees
- [ ] #2 Change labels are agent-chosen and operator-renameable, and the CONCEPTS.md work-session definition matches
- [ ] #3 The handoff step verifies the notification result and, when notifications are disabled, plainly reports the browser-only fallback instead of claiming a notification was sent
- [ ] #4 Repository suites pass
- [ ] #5 After the handoff, the accountable agent arms a harness-native background disposition watch on the open pull request — a single-notification until-loop covering both merged and closed states — so the disposition wakes it for post-merge synchronization and follow-on dispatch without the operator typing a confirmation; deliver-change documents this in the handoff step
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented attach-existing checkout as the default (including harness worktrees), agent-chosen/operator-renameable labels, verified notification fallback, optional delegate observability panes, and a GitHub CLI disposition watch. Added focused content pins. All seven tests/test-*.sh suites pass. The BPMN command was run after an offline lockfile install but is not green in this sandbox: nested Node spawnSync is denied with EPERM; the owner must rerun it outside the sandbox.
<!-- SECTION:NOTES:END -->
