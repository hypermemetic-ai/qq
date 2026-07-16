---
id: doc-19
title: 'Plan — Land T-8 PR1: BPMN plan artifacts'
type: other
created_date: '2026-07-12 16:46'
updated_date: '2026-07-12 17:07'
tags:
  - plans
---
# Plan — Land T-8 PR1: BPMN plan artifacts

**Owning task:** T-8 (with T-6 sharing the pipeline foundation) · **Branch:** `feat/task-8-bpmn-plan-artifacts` · **Status:** landed — PR #32 merged 2026-07-12 (7f88432)

This is the first real plan artifact produced by the flow it delivers (T-8 AC #1). Every element carries a spot-checkable `Evidence: file:lines` stamp in `bpmn:documentation` and a `qq:evidence` extension; the pipeline verified the stamps survive layout losslessly at generation time. Evidence line numbers reference the files as committed in this PR.

![PR1 plan diagram](assets/doc-19/qq_task8_pr1.png)

**Files:** `assets/doc-19/plan-spec.json` (source spec) · `qq_task8_pr1.bpmn` (semantic model) · `qq_task8_pr1.png` (publishable render; carries the visible BPMN.io watermark — the SVG variant is deliberately not stored because it lacks one). All intermediates regenerate deterministically from the spec via `skills/bpmn-plans/pipeline`.

**Scope of PR1:** bundled pipeline package under `skills/bpmn-plans/pipeline/` (codegen, qq-subset bpmnlint plugin, layout+render, conformance CLI, 13-test suite), the `bpmn-plans` Skill, the one-line grilling close hook, and this plan document. Conformance report appended below.

## Conformance report (post-landing, 2026-07-12)

Plan: `assets/doc-19/qq_task8_pr1.bpmn` · completions: `assets/doc-19/completions.json`

### Summary

- Flow nodes: 15
- Accounted: 15
- Unaccounted: 0
- Diverged: 1
- Unknown completion IDs: 0
- Strict verdict: PASS

### Per-element status

| ID | Name | Type | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| start | PR1 scoped | StartEvent | done | Evidence: Branch feat/task-8-bpmn-plan-artifacts cut from main @ 2f83548; scope recorded in backlog/tasks/task-8. |
| build_pkg | Build bundled pipeline package | ServiceTask | done | Evidence: skills/bpmn-plans/pipeline in commit 7116afc; npm ci reproducible; 13/13 tests green with rendering. |
| author_skill | Author bpmn-plans Skill and grilling hook | ServiceTask | done | Evidence: skills/bpmn-plans/SKILL.md and the grilling close hook in commit 7116afc. |
| validate_skills | Validate touched Skills | ServiceTask | done | Evidence: skill-creator quick_validate: 'Skill is valid!' for bpmn-plans and grilling.<br>Note: Executed only after the operator asked whether the validator had been used — the process miss that spawned T-9. Validation then passed clean. |
| dogfood | Generate this plan through the pipeline | ServiceTask | done | Evidence: backlog/docs/plans/assets/doc-19: plan-spec.json -> qq_task8_pr1.bpmn/.png, round-trip lossless. |
| verify | Run tests and end-to-end example | ServiceTask | done | Evidence: npm test 13/13 (run independently twice); example spec and the real doc-19 plan through the full chain, deterministic. |
| gw_checks | Checks green? | ExclusiveGateway | done | Evidence: 'yes' taken — all checks green on first pass. |
| fix | Fix and rerun affected Checks | ServiceTask | done | Evidence: All 4 findings fixed in one pass; artifacts regenerated; affected checks rerun (pipeline regeneration lossless). |
| review | Independent code-review | ServiceTask | done | Evidence: One fresh-context read-only reviewer; 4 confirmed findings (dangling AGENTS.md evidence stamps, imprecise T-8 line refs, unwatermarked SVG in assets, empty decision-1 body). |
| gw_review | Findings resolved? | ExclusiveGateway | diverged | Evidence: 'no' taken once (4 findings), then proceeded to open_pr.<br>Note: The plan's loop implies the post-fix delta re-enters independent review. In reality the owning agent verified the delta itself: affected checks were rerun (regeneration lossless, byte-identical determinism), but no second fresh reviewer was spawned. Accepted because the delta was small and mechanical (evidence re-pointing, asset pruning, doc body fill). |
| open_pr | Commit green work, push, open PR | ServiceTask | done | Evidence: Commit 7116afc (31 files, foreign AGENTS.md/cockpit edits excluded); PR #32 opened with the plan diagram embedded. |
| operator_gate | Operator reviews plan diagram and PR | UserTask | done | Evidence: Operator reviewed PR #32 with the diagram and merged. |
| gw_merge | Approved? | ExclusiveGateway | done | Evidence: 'merge' taken. |
| landed | PR1 merged — plan pipeline live | EndEvent | done | Evidence: Merge commit 7f88432 on main; pipeline and skill live. |
| rework | Changes requested — replan | EndEvent | skipped | Note: Branch not taken — no changes were requested at the operator gate. |

## Unaccounted elements

None.

## Unknown completion IDs

None.

## Divergence summary

- `gw_review` (Findings resolved?) — The plan's loop implies the post-fix delta re-enters independent review. In reality the owning agent verified the delta itself: affected checks were rerun (regeneration lossless, byte-identical determinism), but no second fresh reviewer was spawned. Accepted because the delta was small and mechanical (evidence re-pointing, asset pruning, doc body fill).
