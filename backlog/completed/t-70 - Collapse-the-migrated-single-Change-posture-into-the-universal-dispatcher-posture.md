---
id: T-70
title: >-
  Collapse the migrated single-Change posture into the universal dispatcher
  posture
status: Done
assignee: []
created_date: '2026-07-17 01:50'
updated_date: '2026-07-17 02:31'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-aligned this session (2026-07-16): "it should all collapse into the simplest path." T-48 collapsed the execution split (single Changes run codex-first like batch tickets) but deliberately kept the session-topology split: deliver-change step 1 still migrates the accountable session into the Change's work session via qq-herdr-pull, and delegate-batch still models board-driven dispatch as "an explicit exception to deliver-change step 1" with a separate "migrated single-Change mode" on the status surface. After T-48 the migrated posture is vestigial: the accountable session only composes plans, briefs, and verdicts while codex executes in the checkout, so the pane migration buys nothing and costs the step-12a move-back ceremony.

Collapse to one universal posture: the accountable session always dispatches from the project home; a single Change is a batch of one. A work session hosts only its checkout, its root placeholder pane, and delegated agents. Consequences swept in this Change: deliver-change step 1 (no qq-herdr-pull, no migration; stop if the work session cannot be attached or created), step 12 rails 4-5 and the retire order (no migrated posture, no pane move-back); delegate-batch (no exception framing, placeholder-pane presence reporting in both modes, accountable-pane stage-token channel removed, doc-43 pointer bumped to round 5); cockpit/README.md (dispatcher-only flow; qq-herdr-pull --workspace reframed as operator-invocable, tool itself unchanged); CONCEPTS.md work-session definition; conformance tests (positive assertions plus negative tripwires per the T-48 pattern); doc-42 amendment and doc-43 round-5 amendment superseding migrated mode by name. openwiki/operations.md is derived and deferred to an assigned wiki refresh.

Process note: this Change itself is delivered in the collapsed posture (dispatcher stays home, no migration), per the operator alignment it implements.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deliver-change step 1 binds the work session without moving the accountable pane: no qq-herdr-pull occurrence remains anywhere in the skill, the accountable session explicitly stays in the project home, and every subsequent tool runs against the checkout path
- [x] #2 deliver-change step 12 carries no migrated posture: rail 4 requires no live agent in the work session in every mode, rail 5's census is the root placeholder pane only, and the retire order contains no pane move
- [x] #3 delegate-batch models one posture: board-driven dispatch is no longer an exception to deliver-change step 1, per-delegate placeholder-pane presence reporting applies in both modes, and the accountable-pane stage-token channel (report/clear on <own-pane-id>) is gone
- [x] #4 cockpit/README.md describes the dispatcher-only flow and reframes qq-herdr-pull --workspace as operator-invocable; CONCEPTS.md's work session definition no longer places the accountable conversation in the work session
- [x] #5 Conformance tests assert the new contract and trip on reintroduced qq-herdr-pull or migrated-posture language in the skills; the full test suite passes
- [x] #6 doc-43 carries a round-5 amendment withdrawing migrated single-Change mode and doc-42 an amendment superseding its migration statement by name; delegate-batch points at doc-43 round 5
- [x] #7 This Change's implementation is executed codex-first with a completion envelope verified against the tree
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Owner composes exact old-to-new work order covering skills/deliver-change/SKILL.md (step 1 no-migration, step 12 rails and retire order), skills/delegate-batch/SKILL.md (one posture, both-modes presence reporting, accountable-pane channel removal, doc-43 round-5 pointer), cockpit/README.md, CONCEPTS.md, and tests/test-qq-herdr-home.sh tripwires; dispatches codex exec in the Change checkout (dispatcher posture, no migration); owner authors doc-42/doc-43 amendments directly (delegates never edit backlog/); verify envelope against tree; full test suite; code-review; commit, push, PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Executed codex-first in three delegated rounds from owner-composed exact old-to-new work orders, no delegate commits, every envelope verified against the tree: (1) the five-file posture sweep; (2) review-fix widening the conformance guard (exception framing, accountable pane, cockpit positive phrase) with mandatory trip-probes; (3) review-fix adding the cockpit additive-reintroduction tripwire (SHA-verified restore). Owner authored the doc-42 amendment and doc-43 round 5; delta review caught that round 5 initially left round 2's AC #4 keep-both-postures disposition standing — superseded by name. Fresh read-only codex review: round 1 two confirmed findings (both fixed), round 2 delta review one finding (fixed verbatim), all tripwires owner-probe-verified. Full 9-file suite passes; rebased onto a878167 (T-68) mid-flight with no hunk overlap. Process: this Change was itself delivered in the collapsed posture (dispatcher stayed in the project home; no qq-herdr-pull). Out of scope, escalated separately: step-11 empty-status rail vs doc-48 untracked in-flight records contradiction; stray skills/writing-for-clients/SKILL.md provenance; openwiki refresh deferred to assigned wiki maintenance.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The migrated single-Change posture is withdrawn: the accountable session always dispatches from the project home and a single Change is a batch of one. deliver-change step 1 binds the work session without qq-herdr-pull or any pane move; step 12 requires an agentless work session and retires without moving panes. delegate-batch models one posture with placeholder-pane presence reporting in both modes and no accountable-pane token channel; cockpit/README and CONCEPTS align; doc-42/doc-43 supersede the old posture by name (round 5 also supersedes round 2's AC #4 trigger-gated disposition). Conformance tests trip on every probed reintroduction path. Delivered through PR #120.
<!-- SECTION:FINAL_SUMMARY:END -->
