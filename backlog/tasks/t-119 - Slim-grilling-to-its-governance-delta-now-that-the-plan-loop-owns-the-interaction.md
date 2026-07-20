---
id: T-119
title: >-
  Slim grilling to its governance delta now that the plan loop owns the
  interaction
status: Done
assignee: []
created_date: '2026-07-20 15:41'
updated_date: '2026-07-20 17:10'
labels: []
dependencies: []
priority: medium
type: task
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fast-follow to T-118 (approved in the same 2026-07-19 alignment exchange: grilling slimming is a separate Change, sequenced AFTER the loop lands). The all-terminal plan loop now owns grilling's interaction layer: structured questions ride @juicesharp/rpiv-ask-user-question's cards, plan review rides the qq-plan-loop bridge + hunk, approval is the bridge's explicit select, and the enactment gate is enforced by construction (fail-closed planning phase). What must SURVIVE in grilling's shrunken body: role gating (only the operator-facing accountable owner aligns; delegated Actors treat bounded assignments as aligned), disposition discipline (no transfer; citations; opt-outs verbatim), the decision-ledger requirement and Backlog decision-record minting, and realignment on scope change. The interview/brief mechanics (question batching, presentation, approval question) delete or shrink to pointers at the loop. Evidence: doc-68 (researcher + owning-agent decomposition converged), doc-69 + addendum (trial + operator verdict), T-118 (landed loop).

Decision ledger:
- Slimming grilling (mechanics to the loop, governance stays) as a fast-follow after T-118: approved in the T-118 alignment exchange, 2026-07-19 ('approved, yes' to the brief naming this sequencing).
- What survives (role gating, dispositions, ledger, decision records, realignment): doc-68's decomposition, unchallenged through the T-117 trial and T-118 approval.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 grilling SKILL.md shrunk to the governance delta (role gating, disposition discipline, ledger/records, realignment); interview/brief mechanics removed or pointed at the plan loop; deliver-change's ledger binding unaffected; ratchet budgets updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final: grilling 63→40 lines = governance delta only (role gate, disposition discipline incl. no-transfer/verbatim opt-outs, decision-ledger requirement + decision-record minting incl. mint-in-Change rule, realignment on scope change). Interview/brief mechanics point at the all-terminal plan loop (qq-plan-loop bridge, hunk, rpiv-ask-user-question). deliver-change step-1 ledger binding unchanged; ratchet budgets re-measured down. Reviewer-approved round 2.
<!-- SECTION:NOTES:END -->
