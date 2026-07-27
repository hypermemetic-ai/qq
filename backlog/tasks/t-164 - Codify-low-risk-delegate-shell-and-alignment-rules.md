---
id: T-164
title: Codify low-risk delegate-shell and alignment rules
status: Done
assignee: []
created_date: '2026-07-25 18:08'
updated_date: '2026-07-27 09:59'
labels: []
dependencies: []
references:
  - batch-861f1e8f2428e0025ff75a8ae27d5fc4
  - handoff-861f1e8f2428e0025ff75a8ae27d5fc4
  - T-176
  - 'https://github.com/hypermemetic-ai/qq/pull/269'
documentation:
  - doc-112
modified_files:
  - skills/delegate-batch/SKILL.md
  - skills/grilling/SKILL.md
priority: high
type: enhancement
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Encode the four instruction-only observer quick wins approved in the 2026-07-25 architect digest exchange:

- delegated shells use the confinement-provided `$TMPDIR` for scratch, logs, and helpers and never literal `/tmp`;
- after the first recognized `/dev/fd` process-substitution or nested-confinement failure, record it once as `inconclusive-under-substrate` and do not rerun it in the child;
- generic continuation such as “continue” cannot select among consequential options;
- when the operator asks about a broad class and supplies an example, restate the full class before narrowing.

T-164.1 implements the two confirmed 2026-07-27 Architect-intake extensions; T-176 owns their structured intake mapping. All three Tasks share approved landing plan doc-112 and one instruction-only Change. The earlier local doc-110 remains untouched only as exact receipt evidence and is excluded from delivery.

Retain the smallest resulting system: instruction changes only. Do not add state, tools, gates, confinement-policy widening, observer-provenance machinery, convergence mechanics, browser/target verification, review redesign, package-inventory capability, or unrelated cleanup.

Evidence: observer recurrence keys `delegate-confinement-no-writable-tmpdir`, `delegated-check-known-substrate-rerun`, `generic-continuation-used-as-consequential-disposition`, and `alignment-example-mistaken-for-class-boundary`.

## Decision ledger

- “For T-164 only, do not land a Backlog decision record; approved doc-112 and this exchange settle the six-rule contract and boundary” — verbatim operator opt-out, 2026-07-27.
- The six rules, joint delivery, instruction-only boundary, and append-only plan recovery are settled in approved doc-112 and its cited asked-and-answered exchanges.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Delegated confinement guidance requires scratch files, redirected logs, and generated helpers to live beneath confinement-provided `$TMPDIR`, never literal `/tmp`, without widening any role policy.
- [x] #2 After the first recognized `/dev/fd` process-substitution or nested-confinement failure, the child records that Check once as `inconclusive-under-substrate` and does not rerun it; the owner native rerun plus CI remains binding.
- [x] #3 Alignment governance states that generic continuation cannot select among consequential options; mutation waits for an explicit selected option or explicit approval of the named recommendation.
- [x] #4 Alignment governance restates a requested broad class before narrowing when the operator supplies an example.
- [x] #5 T-164 and T-164.1 ship in one instruction-only Change that adds no state, tool, gate, schema, or policy grant and passes applicable Skill validation, focused scenario checks, prose ratchet, Repository Checks, diff hygiene, and fresh-context review.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The exact structured intake mapping is recorded for Architect batch `batch-861f1e8f2428e0025ff75a8ae27d5fc4`: both routed decision IDs map to T-176; `qq-handoff intake-result` produced a verified receipt and `qq-observe record-handoff-result` returned `status: verified`.

The confined implementer could not write the protected Skill paths and returned a blocked envelope without mutation. The accountable owner implemented only the three approved Skill edits directly. All six focused assertions pass; Skill Creator validates all three Skills; the prose ratchet remains exactly at budget without a baseline change; all 41 top-level Repository suites and diff hygiene pass. Expected empty-repository fixture warnings and the external npm version notice name no in-scope corrective action.

Fresh review `ea533aa8-e9b9-43ca-b897-05c7a2cf1ba0` found two material record/canon regressions. The owner restored `exact orientation paths`, `verified facts`, and `exact Checks`. Fresh fix-delta review `0290a861-a368-4fa6-94f2-7a78ec2357c8` accepted an explicit decision title bound to doc-112; the operator subsequently used grilling’s verbatim opt-out path because Backlog’s decision-create-only surface generated unfixable diff-hygiene whitespace. Decision-18 and decision-19 are excluded; the exact operator opt-out and every settled decision now live in doc-112 and each Task ledger.

Concurrent doc-110 collision recovery follows the explicit operator disposition: approved landing plan doc-112 is attached and will land; receipt-bound local doc-110 remains byte-identical at SHA-256 `8184ad34db91b7a3b8688cd1cea4dfb3c5910d6644ba9d4583daea40c09ce4a2` and is excluded from every commit/PR. Automatic worktree retirement may therefore refuse and preserve the checkout after merge. Markdown-only implementation has zero production-LOC and decision-point delta.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered the four previously approved delegate-substrate/alignment rules together with T-164.1/T-176 in PR #269. Delegate guidance now uses confinement-provided `$TMPDIR`, stops repeated recognized substrate failures, and preserves exact work-order evidence; grilling now refuses generic consequential continuation and restates broad classes before example narrowing. All three Skills validate, the prose ratchet remains exact, all 41 top-level suites pass, and fresh review plus both correction-delta reviews are green. The Change is instruction-only with zero production-LOC and decision-point delta.
<!-- SECTION:FINAL_SUMMARY:END -->
