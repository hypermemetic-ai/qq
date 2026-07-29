---
id: T-184
title: Delete delegate confinement and rebuild delegate lifecycle on one run dir
status: Done
assignee: []
created_date: '2026-07-28 06:30'
updated_date: '2026-07-29 03:08'
labels: []
dependencies: []
documentation:
  - doc-122
priority: high
type: enhancement
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Delete qq's confined-delegation layer and the writer role; rebuild delegate lifecycle on one durable run dir with an ENVELOPE.md result surface; make deliver-change six steps with Task finalization before any PR; delete REVIEW.md's per-fix-commit counter mandate; relax Observer intake identity to named-branch-checkout verification; land Observer integrity rules (one entry per evidence object, assembler sole writer of analysis.json, explicit run lineage); cut the architect/disposition pipeline's ceremony; and keep the named small capabilities (`backlog decision update --content`, atomic doc supersede with receipt, intercom single-flight, bash unknown-argument refusal, role startup validation, structured package-inventory command, session-edit-ledger-gated pi-lens autoformat). Reverses T-177's global confined-delegation posture per the operator's 2026-07-28 disposition. Approved plan: doc-122.

## Decision ledger

- D1 Cut list (Cuts 1–9: confinement and writer-role deletion, ENVELOPE.md run-dir lifecycle, six-step deliver-change with finalization-before-PR, counter deletion, intake relaxation, intercom single-flight, Observer one-entry/sole-writer/lineage) and the named keeps — disposition: operator-settled architect batch `batch-1d06da518a08f95d931c3a1a07fc2ae7`, immutable handoff `handoff-1d06da518a08f95d931c3a1a07fc2ae7`, 36 routed findings in scope (a), settled 2026-07-28.
- D2 Batch-2 folds (confinement/rerun/revival classes die with Cut 1; no-schema-at-all and ENVELOPE.md completeness with Cut 2; unloadable-tool startup refusal with Cut 3; brief-at-dispatch, one-resume-then-inconclusive, and only-layout run dir with Cut 4; retire-refuses-until-observer-package with Cut 5; run-dir Change boundary and explicit-lineage-only with Cut 9) plus new keeps (structured package-inventory command replacing the README display-parser, pi-lens turn-end autoformat gated by the session edit ledger or deleted, one materialization function for rebuildable derived stores) — disposition: operator-settled architect batch `batch-a997e8347fde61d4b394c0a3dccb0c5e`, immutable handoff `handoff-a997e8347fde61d4b394c0a3dccb0c5e`, 19 routed findings folded into this same Change, settled 2026-07-28.
- D3 Reversal of T-177 / `decision-19` (global confined delegation) — disposition: `decision-23` (minted in this Change), operator disposition in the 2026-07-28 architect alignment session, recorded in settled batch scope (a) ("Reverses T-177 per operator disposition").
- D4 REVIEW.md per-fix-commit counter deletion (counter portion of `decision-5` reversed; smallest-resulting-system and fence-or-shrink retained) — disposition: `decision-24` (minted in this Change), Cut 6 of the settled batch plus the operator's 2026-07-28 alignment session (counter deletion).
- D5 Architect/disposition-pipeline ceremony bundle (generic validation rejections, in-memory context loss, stale-evidence refusals, exact-phrase retry rituals, hand-cranked pending intakes) — disposition: `decision-25` (minted in this Change), operator bundle directive given verbally in the architect session 2026-07-28 after the first handoff was confirmed.
- D6 Cross-Change decision records minted in this Change's checkout: `decision-23` (worktree-only boundary, T-177 reversal), `decision-24` (counter deletion), `decision-25` (architect ceremony cut) — disposition: align decision-record rule, executed 2026-07-28 via `bin/qq-backlog decision update --content`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Delegate confinement (Landlock/Landstrip, confined tool parity, tmpdir machinery) and the writer role are deleted from dispatch, extensions, manifests, and skills; delegates run as plain headless children in the Change worktree with the git worktree as the only boundary; role startup validation still refuses unavailable declared tools.
- [x] #2 The structured-output schema pipeline is deleted; one durable run dir per delegate holds brief, ENVELOPE.md result, and terminal state from creation, and the parent incorporates async terminal wakes from that record.
- [x] #3 deliver-change reads as six steps with Task finalization before PR open; created-locally vs mergeable-now vocabulary lands; the PR watch is retained for post-handoff drift.
- [x] #4 REVIEW.md contains no per-fix-commit counter mandate; T-177's global confined-delegation posture is reversed in CONCEPTS.md, README, and docs.
- [x] #5 Observer integrity lands: one entry per evidence object, assembler sole writer of analysis.json, explicit run lineage; intake verifies a named-branch checkout without the deleted identity rejections.
- [x] #6 Architect/disposition ceremony (generic validation rejections, in-memory context loss, stale-evidence refusals, exact-phrase retry rituals, hand-cranked pending intakes) is deleted while settled-batch immutability and verified intake results remain.
- [x] #7 Keeps work: backlog decision update --content authors a decision body noninteractively; atomic doc supersede re-ids a colliding unmerged document with an append-only receipt; a second concurrent intercom ask is an ordinary tool error; send with a pending inbound ask refuses; bash refuses unsupported arguments.
- [x] #8 Focused tests, full ratchet, shellcheck, and extension tests green; fresh-context review PASS; exactly one PR.
- [x] #9 Batch-2 folds and keeps work: the structured package-inventory command replaces the README display-parser; pi-lens turn-end autoformat fires only with a session edit ledger or is deleted; retire refuses while its observer package is absent; a delegate without ENVELOPE.md is not complete and one ending on a user message is failed; the brief exists in the run dir at dispatch by construction.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed as PRs #279+#280 (merged, main a354d17): Landlock/Landstrip confinement and writer role deleted (worktree-only boundary, decision-23); structured-output pipeline replaced by run-dir ENVELOPE.md; one owner-created run dir derived from the Read-and-perform reference (brief at dispatch by construction, TERMINAL at exit, unsealed continuation); deliver-change six steps with finalization-before-PR and two-state vocabulary; REVIEW.md counters deleted (decision-24); intake relaxed to named-branch verification; observer one-entry evidence at acceptance gates with historical analyses tolerated (#280 regression fix), finalize sole analysis writer, explicit lineage only; architect ceremony cut to durable confirm (decision-25); keeps landed: qq-backlog decision update --content + atomic doc supersede (main-side id union), intercom single-flight install-time patch (applied), extension-aware startup tool validation, bash arg refusal, qq-pi-inventory replacing the README display parser, retire refusing until guided observer package, derived-store materialization prose, pi-lens autoformat deleted via config. T-177 reversed. resolve-task recorded MERGED against both origin batches. Checks: full tests/*.sh sweep green, ratchet clean (budget to 8071 under approved plan), shellcheck clean; fresh-context review 3 findings all fixed and verified closed plus 2 integration hygiene fixes; CI green on both PRs. Observer pr-279 and pr-280 packages assembled, analyses validated and finalized.
<!-- SECTION:FINAL_SUMMARY:END -->
