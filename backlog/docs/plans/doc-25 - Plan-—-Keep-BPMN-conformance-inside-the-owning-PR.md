---
id: doc-25
title: Plan — Keep BPMN conformance inside the owning PR
type: other
created_date: '2026-07-13 00:25'
updated_date: '2026-07-13 00:37'
tags:
  - plan
  - bpmn
  - conformance
  - delivery
---
# Plan — Keep BPMN conformance inside the owning PR

## Intent

Revise `bpmn-plans` prospectively so planned execution ends when the implementation Change is green in its owning pull request. Conformance artifacts and Task finalization are same-PR closeout metadata outside the BPMN nodes; operator disposition and local-main synchronization remain delivery activities outside conformance. Historical plan records remain unchanged.

## Diagram

![BPMN plan](assets/doc-25/plan.png)

## Artifacts

- Plan spec: `assets/doc-25/plan-spec.json`
- Semantic BPMN: `assets/doc-25/plan.bpmn`
- Published render: `assets/doc-25/plan.png`
- Executed completions: `assets/doc-25/completions.json`
- Conformance report: `assets/doc-25/conformance.md`

The diagram is the approved execution contract. Conformance and Task finalization are same-PR closeout metadata outside its flow nodes.

## Conformance report (same-PR closeout, 2026-07-13)

Plan: `backlog/docs/plans/assets/doc-25/plan.bpmn`

## Summary

- Flow nodes: 12
- Accounted: 12
- Unaccounted: 0
- Diverged: 0
- Unknown completion IDs: 0
- Strict verdict: PASS

## Per-element status

| ID | Name | Type | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| scope_approved | One-PR conformance scope approved | StartEvent | done | Evidence: T-15 notes record operator approval of the persistently displayed doc-25 plan before implementation |
| update_skill | Update bpmn-plans boundary | ServiceTask | done | Evidence: Commit 5f69cbe updates bpmn-plans prospectively to same-PR conformance and preserves historical records |
| verification_entry | Enter verification | ExclusiveGateway | done | Evidence: Verification ran after initial implementation and again after correcting the reviewed plan evidence citation |
| validate_skill | Validate Skill and metadata | ServiceTask | done | Evidence: skill-creator quick_validate reported Skill is valid; trigger/body coherence and diff hygiene were inspected |
| forward_test | Exercise one-PR closeout | ServiceTask | done | Evidence: A valid fresh-context test read the revised Skill and selected one owning PR, strict pre-Done conformance, same-PR closeout, final rechecks, and no post-merge conformance Change |
| review_change | Run fresh-context review | ServiceTask | done | Evidence: Independent read-only review inspected the Skill, T-15, and doc-25 plan artifacts before commit and publication |
| review_decision | Implementation green? | ExclusiveGateway | done | Evidence: The findings branch was taken once for a pre-closeout gateway evidence cycle, then the green branch after correction |
| fix_findings | Fix in-scope findings | ServiceTask | done | Evidence: The owning-PR green gateway now cites deliver-change lines 29-31; regenerated BPMN passes lint/round trip and the exact delta has no material findings |
| publish_pr | Publish the owning PR | ServiceTask | done | Evidence: Reviewed commit 5f69cbe was pushed and published in the single owning PR #47 |
| pr_decision | Owning PR green? | ExclusiveGateway | done | Evidence: PR #47 at head 5f69cbe was OPEN, CLEAN, MERGEABLE, with no configured status checks and matching local/remote head SHAs |
| fix_pr_failure | Correct failed PR checks | ServiceTask | skipped | Note: The initial owning-PR head was green, so no failed GitHub check required another behavioral correction |
| green_pr_handoff | Change green for PR handoff | EndEvent | done | Evidence: The planned implementation reached a green owning-PR state before conformance closeout; PR #47 remained open for same-PR conformance and Task finalization |

## Unaccounted elements

None.

## Unknown completion IDs

None.

## Divergence summary

No elements diverged.
