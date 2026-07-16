---
id: TASK-49
title: Retire merged work sessions and checkouts without operator attention
status: To Do
assignee: []
created_date: '2026-07-16 03:18'
labels: []
dependencies: []
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator ruling (2026-07-15): leftover work-session and checkout debt must not require operator thought. Audit evidence from that session: eight linked worktrees existed, seven merged and clean — strays from several different sessions — plus seven stale merged local branches; six checkouts and all seven branches were removed in a one-time manual sweep (the seventh merged checkout hosted a live working agent and was left). deliver-change step 12 currently leaves the accountable pane, work session, and checkout intact for explicit operator retirement — that rule is what produced the pile. Settle and land the owning mechanism: candidates are a deliver-change step-12 amendment (after a verified merged disposition the accountable session moves its pane back to the project home, removes its own merged clean checkout, and prunes the branch — the exact dance performed manually in the audit session) versus a scheduled or board-driven sweep. Account for the interplay with doc-43's AC #4 posture disposition (dispatch-only would prevent stranding entirely and is trigger-gated) and keep hard safety rails.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The owning mechanism is settled in a short design note and landed in the affected skill or docs
- [ ] #2 After a merged disposition, the Change's work session, checkout, and branch retire without operator action, observed live on a real Change
- [ ] #3 Safety rails hold: unmerged, dirty, live-agent-occupied, and primary checkouts are never touched; operator-created panes and tabs are never closed
<!-- AC:END -->
