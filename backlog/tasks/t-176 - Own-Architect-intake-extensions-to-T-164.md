---
id: T-176
title: Own Architect intake extensions to T-164
status: In Progress
assignee: []
created_date: '2026-07-27 08:20'
updated_date: '2026-07-27 09:52'
labels: []
dependencies: []
references:
  - batch-861f1e8f2428e0025ff75a8ae27d5fc4
  - handoff-861f1e8f2428e0025ff75a8ae27d5fc4
  - T-164
  - T-164.1
documentation:
  - doc-112
modified_files:
  - skills/delegate-batch/SKILL.md
  - skills/code-review/SKILL.md
priority: high
type: enhancement
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the two routed decisions from Architect batch `batch-861f1e8f2428e0025ff75a8ae27d5fc4` through their verified structured intake-result seam and the joint T-164 Change:

- `decision-c57b48e36e9bd16bc2f340abf13ce406`: every delegate and reviewer work order requires temporary files, redirected logs, generated helpers, npm caches, and reviewer-runnable test scratch beneath confinement-provided `$TMPDIR`, never literal `/tmp` or worktree-local scratch;
- `decision-45d8a6f24d19be579a4323daf59f654b`: a Check warning naming an in-scope corrective action must be resolved or reported in the Completion Envelope as an unresolved risk and cannot be represented only as `pass`.

T-164.1 implements these rules; T-164 owns four previously approved rules. The exact intake-result receipt maps both decisions to this Task, and `qq-observe record-handoff-result` returned `status: verified`. All three Tasks share approved landing plan doc-112 and one instruction-only Change. The earlier local doc-110 remains untouched only as exact receipt evidence and is excluded from delivery.

Retain the smallest resulting system: no additional implementation scope, state, tool, gate, schema, policy grant, confinement widening, or unrelated cleanup.

## Decision ledger

- “For T-164 only, do not land a Backlog decision record; approved doc-112 and this exchange settle the six-rule contract and boundary” — verbatim operator opt-out, 2026-07-27.
- The six rules, joint delivery, instruction-only boundary, and append-only plan recovery are settled in approved doc-112 and its cited asked-and-answered exchanges.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both routed Architect decision IDs are mapped to this born-in-worktree integer-ID Task by a verified `qq-handoff intake-result` receipt and recorded through `qq-observe record-handoff-result`.
- [ ] #2 T-164.1 delivers the confined `$TMPDIR` work-order contract and warning-bearing Completion Envelope rule exactly as approved.
- [ ] #3 This Task, T-164.1, and T-164 ship in one instruction-only Change with no additional runtime, state, tool, gate, schema, or policy scope.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The exact structured intake mapping is recorded for Architect batch `batch-861f1e8f2428e0025ff75a8ae27d5fc4`: both routed decision IDs map to T-176; `qq-handoff intake-result` produced a verified receipt and `qq-observe record-handoff-result` returned `status: verified`.

The confined implementer could not write the protected Skill paths and returned a blocked envelope without mutation. The accountable owner implemented only the three approved Skill edits directly. All six focused assertions pass; Skill Creator validates all three Skills; the prose ratchet remains exactly at budget without a baseline change; all 41 top-level Repository suites and diff hygiene pass. Expected empty-repository fixture warnings and the external npm version notice name no in-scope corrective action.

Fresh review `ea533aa8-e9b9-43ca-b897-05c7a2cf1ba0` found two material record/canon regressions. The owner restored `exact orientation paths`, `verified facts`, and `exact Checks`. Fresh fix-delta review `0290a861-a368-4fa6-94f2-7a78ec2357c8` accepted an explicit decision title bound to doc-112; the operator subsequently used grilling’s verbatim opt-out path because Backlog’s decision-create-only surface generated unfixable diff-hygiene whitespace. Decision-18 and decision-19 are excluded; the exact operator opt-out and every settled decision now live in doc-112 and each Task ledger.

Concurrent doc-110 collision recovery follows the explicit operator disposition: approved landing plan doc-112 is attached and will land; receipt-bound local doc-110 remains byte-identical at SHA-256 `8184ad34db91b7a3b8688cd1cea4dfb3c5910d6644ba9d4583daea40c09ce4a2` and is excluded from every commit/PR. Automatic worktree retirement may therefore refuse and preserve the checkout after merge. Markdown-only implementation has zero production-LOC and decision-point delta.
<!-- SECTION:NOTES:END -->
