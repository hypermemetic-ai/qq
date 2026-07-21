---
id: T-126
title: Align research and compound doc flows with born-in-worktree
status: To Do
assignee: []
created_date: '2026-07-21 02:15'
labels: []
dependencies: []
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-on to T-88 (born-in-worktree, PR #170). Observed 2026-07-21: the research flow creates durable docs and --doc attaches in primary main (doc-70/doc-71 + t-121/t-125 doc links), which the clean-primary land rail now refuses by construction. The flows must route the new way: research/compound docs born in the owning Task's Change worktree; for unstarted work, ride chore PRs (the #171 pattern). Same for any --doc attach editing a Task record outside its Change branch.

Aligns with decision-6's rule: work touching Task-record lifecycle conforms to the born-in-worktree model when landing after enactment.

Decision ledger:
- Gap diagnosis and routing rule (docs born in owning Change worktrees; chore PRs for unstarted work): owner analysis of the 2026-07-21 primary-dirt incident, recorded at ticketing; operator review at alignment before enactment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 research and compound skill text routes doc creation and --doc attaches through Change worktrees or chore PRs, never primary main
- [ ] #2 Prose ratchet re-measured in the same Change
<!-- AC:END -->
