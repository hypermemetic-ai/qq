---
id: T-130
title: >-
  qq-plan-loop: review tab carries no call-to-action and the approval select
  surfaces only in the pi tab
status: To Do
assignee: []
created_date: '2026-07-21 05:57'
labels: []
dependencies: []
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator report, verbatim 2026-07-21: 'The fact is I just don't understand this plan loop. I enabled it. You open the plan in another tab, which isn't very helpful because I had to move to that tab. And there was nothing for me to do in this tab except read the plan.'

Observed mechanics (cockpit/pi/qq-plan-loop.ts:640-730, this session): plan_loop_submit snapshots the plan and opens the hunk review surface in a NEW tab; pollForReview then waits for that tab to close; only then does the Approve-plan / Request-changes / Abandon select appear — back in the pi tab. The review tab itself offers no indication that the decision happens elsewhere. In the 2026-07-21 incident the operator read the plan, found nothing actionable, and the submit was aborted ('The operation was aborted'), which silently dropped the loop from planning back to idle; the agent's resubmit was then refused with 'available only in the planning phase'.

Consequence in that session: an approved plan (t-129's) could not record its approval through the loop; approval fell back to a cited chat exchange.

Fix shape is NOT aligned — needs its own alignment when picked up. Candidate directions (not exhaustive): render a call-to-action inside the review surface; surface the decision select without requiring the review tab to close first; make an aborted submit stay in planning with a visible state instead of idling silently.
<!-- SECTION:DESCRIPTION:END -->
