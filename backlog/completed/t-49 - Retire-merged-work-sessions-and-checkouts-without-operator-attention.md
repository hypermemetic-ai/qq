---
id: T-49
title: Retire merged work sessions and checkouts without operator attention
status: Done
assignee: []
created_date: '2026-07-16 03:18'
updated_date: '2026-07-16 04:33'
labels: []
dependencies: []
documentation:
  - doc-44
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator ruling (2026-07-15): leftover work-session and checkout debt must not require operator thought. Audit evidence from that session: eight linked worktrees existed, seven merged and clean — strays from several different sessions — plus seven stale merged local branches; six checkouts and all seven branches were removed in a one-time manual sweep (the seventh merged checkout hosted a live working agent and was left). deliver-change step 12 currently leaves the accountable pane, work session, and checkout intact for explicit operator retirement — that rule is what produced the pile. Settle and land the owning mechanism: candidates are a deliver-change step-12 amendment (after a verified merged disposition the accountable session moves its pane back to the project home, removes its own merged clean checkout, and prunes the branch — the exact dance performed manually in the audit session) versus a scheduled or board-driven sweep. Account for the interplay with doc-43's AC #4 posture disposition (dispatch-only would prevent stranding entirely and is trigger-gated) and keep hard safety rails.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The owning mechanism is settled in a short design note and landed in the affected skill or docs
- [ ] #2 After a merged disposition, the Change's work session, checkout, and branch retire without operator action, observed live on a real Change
- [x] #3 Safety rails hold: unmerged, dirty, live-agent-occupied, and primary checkouts are never touched; operator-created panes and tabs are never closed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review round 1 (fresh codex, read-only): 3 confirmed findings — HEAD-attachment gap in rail 3, missing operator-focus rail, stale doc-44 status-pane allowance — all fixed minimally; delta review round 2: approve, all resolved, nothing new. T-48 reconciliation: retire-at-source applies only to verified merged dispositions; the no-focus doctrine is absorbed (no focus-board anywhere at disposition; sole exception: moving the executing session's own pane home with --no-focus in migrated posture); non-merged terminal dispositions keep leave-intact.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Settled retire-at-source in doc-44 and landed the amended deliver-change step 12: after steps 10-11 verify a merged disposition, six ordered fail-closed rails (registered linked worktree distinct from primary; clean status; branch tip ancestor of fresh origin/main WITH the checkout's HEAD attached to that branch; no other live agent; work session not operator-focused; explicable pane census) gate a three-step retire dance (own-pane move home --no-focus in migrated posture only; unforced herdr/git worktree remove; git branch -d), never changing operator focus; any tripped rail reports and leaves everything intact. AC #2 (observed live on a real Change) is deliberately unchecked: its observation window opens at this batch's own first merged disposition — the armed disposition watches will run the new step 12 live and the observation will be reported then.
<!-- SECTION:FINAL_SUMMARY:END -->
