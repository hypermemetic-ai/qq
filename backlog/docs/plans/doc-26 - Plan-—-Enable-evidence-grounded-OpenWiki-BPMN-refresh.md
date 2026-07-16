---
id: doc-26
title: Plan — Enable evidence-grounded OpenWiki BPMN refresh
type: other
created_date: '2026-07-13 02:31'
updated_date: '2026-07-13 02:46'
---
# Plan — Enable evidence-grounded OpenWiki BPMN refresh

**Owning Task:** T-6 — Living architecture model + rendered diagrams in OpenWiki

## Intent

Deliver the first of two Changes for T-6: make sequence-flow evidence a backward-compatible capability of the shared BPMN pipeline, and define the dedicated OpenWiki maintainer's deterministic diagram-refresh procedure.

![T-6 source enablement plan](assets/doc-26/plan.png)

## Ownership boundary

This plan ends when the source enablement pull request is green for handoff. It does not modify `openwiki/`, invoke the dedicated maintainer procedure, wait for merge, or perform the documentation-only refresh.

After this Change lands, the current agent will explicitly switch into the dedicated OpenWiki maintainer role, create a separate plan, and deliver the actual evidence-grounded OpenWiki models, attributed PNG renders, and wiki embeds in an `openwiki/update` Change.

## Artifacts

- Plan specification: `backlog/docs/plans/assets/doc-26/plan-spec.json`
- Evidence-stamped BPMN: `backlog/docs/plans/assets/doc-26/plan.bpmn`
- Rendered approval diagram: `backlog/docs/plans/assets/doc-26/plan.png`

## Conformance

# BPMN conformance report

Plan: backlog/docs/plans/assets/doc-26/plan.bpmn

## Summary

- Flow nodes: 15
- Accounted: 15
- Unaccounted: 0
- Diverged: 0
- Unknown completion IDs: 0
- Strict verdict: PASS

## Per-element status

| ID | Name | Type | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| source_change_authorized | Source Change approved | StartEvent | done | Evidence: backlog/tasks/task-6 - Build-diagram-generation-skill-model-toolchain-selection.md |
| extend_flow_evidence | Add optional flow evidence | ServiceTask | done | Evidence: skills/bpmn-plans/pipeline/lib/generate.mjs |
| update_maintainer_contract | Define wiki diagram refresh | ServiceTask | done | Evidence: skills/openwiki-maintainer/SKILL.md |
| update_tests_docs | Update pipeline tests and docs | ServiceTask | done | Evidence: skills/bpmn-plans/pipeline/test/pipeline.test.mjs and skills/bpmn-plans/pipeline/README.md |
| run_checks | Run focused checks | ServiceTask | done | Evidence: npm test: 14/14 pass; both changed Skills valid; git diff --check clean |
| verification_entry | Verification entry | ExclusiveGateway | done | Evidence: backlog/tasks/task-6 - Build-diagram-generation-skill-model-toolchain-selection.md#implementation-notes |
| checks_green | Checks green? | ExclusiveGateway | done | Evidence: npm test: 14/14 pass with rendering enabled |
| fix_check_failures | Fix check failures | ServiceTask | done | Evidence: skills/bpmn-plans/pipeline/test/pipeline.test.mjs:201 |
| fresh_context_review | Run fresh-context review | ServiceTask | done | Evidence: backlog/tasks/task-6 - Build-diagram-generation-skill-model-toolchain-selection.md#implementation-notes |
| confirmed_findings | Confirmed findings? | ExclusiveGateway | done | Evidence: backlog/docs/plans/assets/doc-26/plan-spec.json |
| fix_review_findings | Fix confirmed findings | ServiceTask | done | Evidence: backlog/docs/plans/assets/doc-26/plan-spec.json and plan.bpmn |
| open_source_pr | Open source enablement PR | ServiceTask | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/51 |
| pr_green | PR green? | ExclusiveGateway | done | Evidence: PR #51 mergeStateStatus=CLEAN, mergeable=MERGEABLE, statusCheckRollup=[] |
| fix_pr_failures | Fix PR failures | ServiceTask | skipped | Note: PR #51 was immediately mergeable and clean with no configured GitHub checks. |
| green_handoff | Source PR green for handoff | EndEvent | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/51 |

## Unaccounted elements

None.

## Unknown completion IDs

None.

## Divergence summary

No elements diverged.
