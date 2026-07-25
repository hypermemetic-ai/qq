---
id: T-164
title: Codify low-risk delegate-shell and alignment rules
status: To Do
assignee: []
created_date: '2026-07-25 18:08'
labels: []
dependencies: []
priority: high
type: enhancement
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Encode the four instruction-only observer quick wins approved in the 2026-07-25 architect digest exchange:

- delegated shells use the provided `$TMPDIR` for scratch, logs, and helpers and never literal `/tmp`;
- after the first recognized `/dev/fd` process-substitution or nested-confinement failure, record it once as `inconclusive-under-substrate` and do not rerun it in the child;
- generic continuation such as “continue” cannot select among consequential options;
- when the operator asks about a broad class and supplies an example, restate the full class before narrowing.

Retain the smallest resulting system: instruction changes only. Do not add state, tools, gates, confinement-policy widening, observer-provenance machinery, convergence mechanics, browser/target verification, review redesign, or package-inventory capability.

Evidence: observer recurrence keys `delegate-confinement-no-writable-tmpdir`, `delegated-check-known-substrate-rerun`, `generic-continuation-used-as-consequential-disposition`, and `alignment-example-mistaken-for-class-boundary`.

Decision ledger:
- Four-rule bundle and instruction-only/no-design boundary — asked-and-answered architect digest exchange, 2026-07-25; operator approved the presented shortlist with “Approved.”
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Delegated confinement guidance requires scratch files, redirected logs, and generated helpers to live beneath `$TMPDIR`, never literal `/tmp`, without widening any role policy.
- [ ] #2 After the first recognized `/dev/fd` process-substitution or nested-confinement failure, the child records that Check once as `inconclusive-under-substrate` and does not rerun it; the owner native rerun plus CI remains binding.
- [ ] #3 Alignment governance states that generic continuation cannot select among consequential options; mutation waits for an explicit selected option or explicit approval of the named recommendation.
- [ ] #4 Alignment governance restates a requested broad class before narrowing when the operator supplies an example.
- [ ] #5 The Change modifies instruction surfaces only, adds no new state, tool, gate, or policy grant, and passes applicable skill validation, prose ratchet, and Repository Checks.
<!-- AC:END -->
