---
id: TASK-62
title: 'qq-herdr-snap: jump to the project home orchestrator when the space has none'
status: Done
assignee: []
created_date: '2026-07-16 18:56'
updated_date: '2026-07-16 19:09'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator clarification on the alt+o bug (2026-07-16): the real defect is that snap does not JUMP anywhere useful — in a space with no claude orchestrator it must jump to the project home orchestrator, not merely report accurate text (TASK-56 fixed only the false message).

Desired target resolution order: (1) claude agent in the focused space; (2) the claude agent in the repo project home workspace — resolved WITHOUT qq-herdr-home inspect (which requires a running board pane): from the focused workspace worktree, find the herdr workspace whose checkout is the repo primary main checkout (is_linked_worktree false, same repo_root) and take its claude agent; (3) existing first-agent-in-space fallback; (4) accurate dead-end message. Bounce-back must work cross-space: key the state file by the TARGET pane workspace (identical to today for same-space snaps).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 From a workspace with no claude agent, alt+o focuses the repo project home's claude orchestrator (covered by a mock test that fails pre-fix)
- [x] #2 Bounce-back returns to the origin pane after a cross-space snap
- [x] #3 Same-space snap, bounce, dry-run, and exit-0 semantics are preserved by existing tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Resolution order landed: local claude, then the repo project home's claude (home = the non-linked workspace sharing the focused worktree's repo_root, resolved from herdr workspace list — no board dependency), then first agent in space, then accurate message. Bounce state keyed by the target pane's workspace so cross-space bounce works both directions (mock-tested). Delegate decision, owner-accepted: workspace-list parse failures notify and exit 0. First Change dispatched under the TASK-63 contained command shape (timeout -k, MCP-less).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
alt+o now jumps to the project home orchestrator from spaces that lack one, with working cross-space bounce-back; same-space snap, bounce, dry-run, and exit-0 semantics preserved. Regression test observed failing pre-fix; full suite green; fresh-context review verdict: pass, no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
