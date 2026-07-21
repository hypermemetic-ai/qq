---
id: T-126
title: Align research and compound doc flows with born-in-worktree
status: Done
assignee: []
created_date: '2026-07-21 02:15'
updated_date: '2026-07-21 15:20'
labels: []
dependencies: []
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-on to T-88 (born-in-worktree, PR #170). Observed 2026-07-21: the research flow creates durable docs and --doc attaches in primary main (doc-70/doc-71 + t-121/t-125 doc links), which the clean-primary land rail now refuses by construction. The flows must route the new way: research/compound docs born in the owning Task's Change worktree; for unstarted work, ride chore PRs (the #171 pattern). Same for any --doc attach editing a Task record outside its Change branch.

Aligns with decision-6's rule: work touching Task-record lifecycle conforms to the born-in-worktree model when landing after enactment.

Decision ledger:
- Routing rule (docs born in owning Change worktrees; chore PRs for unstarted work; --doc attaches ride the owning Change branch): owner analysis of the 2026-07-21 primary-dirt incident, recorded at ticketing — operator approval, alignment brief asked-and-answered exchange 2026-07-21.
- Underlying model: decision-6 (born-in-worktree Task-truth model, T-88).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 research and compound skill text routes doc creation and --doc attaches through Change worktrees or chore PRs, never primary main
- [x] #2 Prose ratchet re-measured in the same Change
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered 2026-07-21 via wave-2 delegate batch: 562fad5 routes research/compound durable writes (creation, updates, --doc attaches) through the owning Task's open Change worktree or a chore branch/PR when none is open, explicitly prohibiting primary main. AC#2: prose ratchet re-measured in the same Change (7516→7623, budget + comment updated). Implementer left the tree uncommitted; owner verified natively (full suite + ratchet green) and committed as integration. Confined review APPROVE: independent measurement reproduced 7516→7623, record integrity verified, counters 0/0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered via PR #191 (2026-07-21): research and compound skills now route all durable writes (creation, updates, --doc attaches) through the owning Task's open Change worktree or a chore branch/PR when none is open, with primary main explicitly prohibited; prose ratchet re-measured in the same Change (7516→7623). Implementer delegate + owner integration commit; confined review APPROVE with independently reproduced measurement.
<!-- SECTION:FINAL_SUMMARY:END -->
