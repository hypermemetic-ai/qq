---
id: TASK-24
title: Restrict grilling to the operator-facing owning Actor
status: Done
assignee:
  - '@codex'
created_date: '2026-07-14 01:05'
updated_date: '2026-07-14 01:31'
labels:
  - grilling-owner
  - skill
  - bug
dependencies: []
references:
  - skills/grilling/SKILL.md
  - tests
documentation:
  - doc-33
modified_files:
  - skills/grilling/SKILL.md
  - tests/test-grilling.sh
  - >-
    backlog/tasks/task-24 -
    Restrict-grilling-to-the-operator-facing-owning-Actor.md
  - >-
    backlog/docs/plans/doc-33 -
    Plan-—-Restrict-grilling-to-the-operator-facing-owning-Actor.md
  - backlog/docs/plans/assets/doc-33/plan-spec.json
  - backlog/docs/plans/assets/doc-33/plan.bpmn
  - backlog/docs/plans/assets/doc-33/plan.png
  - backlog/docs/plans/assets/doc-33/completions.json
  - backlog/docs/plans/assets/doc-33/conformance.md
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prevent Actor-boundary regressions in which a spawned, delegated, review, research, maintainer, or event-triggered agent reopens alignment for a bounded assignment. The operator-facing owning agent alone may invoke grilling; non-owning agents treat bounded assignments as aligned and return any new consequential decision or scope gap to their assigning or owning Actor. Live RED evidence: OpenWiki maintainer Codex session 019f5e0f-9a35-7b71-9203-03457d271bb2 (2026-07-13) announced a required alignment check, asked "Proceed with this interpretation?", and then declared alignment closed after receiving only the bounded maintainer event assignment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The grilling Skill unambiguously limits invocation to the operator-facing accountable owner of a new work item.
- [x] #2 Spawned, delegated, review, research, maintainer, and event-triggered agents treat bounded assignments as aligned and return new consequential decisions or scope gaps to their assigning or owning Actor.
- [x] #3 A regression Check fails against the pre-change Skill boundary and passes against the corrected Skill.
- [x] #4 Fresh forward-tests show a bounded delegate skips grilling while an operator-facing owner still invokes grilling for genuinely new work.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Follow doc-33: preserve the live maintainer RED transcript; add and run the regression Check against the pre-change Skill; encode the owner-only grilling boundary; run Skill Creator validation, affected and full Checks, bounded-delegate and owner-facing forward-tests, independent review, operator UAT, strict BPMN conformance, and normal one-PR delivery.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
RED established before the grilling Skill edit. Live maintainer transcript: Codex session 019f5e0f-9a35-7b71-9203-03457d271bb2 announced a repository-required alignment check, asked the operator to proceed, and declared alignment closed for the bounded event-triggered assignment. Mechanical Check: git diff --exit-code origin/main -- skills/grilling/SKILL.md passed, proving the Skill was unchanged; tests/test-grilling.sh then exited 1 with missing grilling trigger boundary: used only by the accountable owning agent.

Fresh forward-tests passed in the owning Herdr work session. Bounded delegate session 019f5e2e-0608-7972-9a15-91bae05cb753 stated that the expressly bounded assignment authorized its scope, proceeded without reopening alignment, returned the requested test summary, and made no changes. Operator-facing owner session 019f5e2e-0656-7e43-a381-5f44a9fe363a identified itself as the correct grilling Actor, said delegated agents would not be, preserved the existing dirty Change, remained read-only, and ended with one recommended alignment question about a bounded proposed outcome.

Independent read-only review session 019f5e33-7c31-75d2-9cdd-fc9413ea6111 found one P2: Task-backed BPMN evidence coordinates had drifted after structured metadata expansion. The finding was reproduced, the complete eventual file inventory was stabilized, all nine coordinates were refreshed, BPMN was regenerated with zero lint findings and lossless evidence round trip, affected Checks passed, and exact-delta re-review returned No material findings. The revised PNG remained byte-identical and was surfaced persistently.

Operator UAT accepted on 2026-07-13. The operator reviewed the updated grilling Skill and explicitly replied accepted to the owner-only invocation, bounded-assignment execution, and assigning-or-owning-Actor return path.

Same-PR BPMN conformance: 19/19 flow nodes accounted, 0 unaccounted, 0 diverged, 0 unknown, strict PASS. Initial PR #65 state at commit 966debe: OPEN, MERGEABLE, CLEAN, no configured GitHub Checks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restricted grilling to the operator-facing accountable owner and made bounded non-owning Actors execute within scope or return new consequential decisions and scope gaps to their assigning or owning Actor. Added a focused regression Check and evidence-stamped plan. Verified live and mechanical RED, Skill Creator validation, all 8 shell and 18 BPMN tests, two fresh forward-tests, independent review with exact-delta closure, operator UAT acceptance, and strict 19/19 BPMN conformance in PR #65.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Skill Creator validation passes for the edited grilling Skill.
- [x] #2 Affected and full Repository Checks pass.
- [x] #3 Independent review reports no unresolved material findings.
- [x] #4 Operator UAT disposition is recorded.
<!-- DOD:END -->
