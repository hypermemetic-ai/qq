---
id: T-104
title: Fix deliver-change/qq-pr-watch polling divergence
status: Done
assignee: []
created_date: '2026-07-19 16:42'
updated_date: '2026-07-19 19:53'
labels: []
dependencies: []
documentation:
  - doc-55
priority: medium
type: bug
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Drift found by the sweep (evidence: doc-55, verified against source): skills/deliver-change/SKILL.md:110 prescribes polling PR state every 5 seconds with 'no owned machinery', while bin/qq-pr-watch:21 enforces --interval <30-60>. The skill and the command describe different procedures; one of them is silently wrong at every delivery.

Decision ledger:
- Bug existence and both contract citations: doc-55 verified by owning agent, ticketed per operator instruction in the T-93 follow-up session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reproduce the disagreement against current source before fixing
- [x] #2 Skill and command agree; the fixed path is demonstrated fresh end-to-end on a real or fixture PR
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-19 18:08
---
Fix direction dispositioned at alignment 2026-07-19: converge on the owned command — deliver-change step 9 is updated to name the qq-pr-watch contract and the hand-rolled 5-second prose loop dies; the command keeps its tested exactly-once/inspect semantics and 30-60s interval; T-99 may later swap the implementation behind the same contract. Operator approval, this session.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Skill step 9 converged on the owned bin/qq-pr-watch contract (exactly-once wake, inspect, 30-60s policy, MERGED/CLOSED); hand-rolled 5s prose loop removed. Guard test pins the new contract incl. the 30s default + a negative guard against reintroducing 5s polling. AC #1 reproduced from current source before fixing; AC #2 demonstrated on a fixture PR (QQ_GH_BIN fake): OPEN inspect no wake, MERGED and CLOSED exactly one wake each. Fresh-context review: one verified P2 (default unpinned) fixed; delta review pass. PR #148.
<!-- SECTION:FINAL_SUMMARY:END -->
