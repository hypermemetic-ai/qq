---
id: T-81
title: 'Ratchet baselines: prose budget and grep tripwires in qq CI'
status: Done
assignee: []
created_date: '2026-07-17 17:18'
updated_date: '2026-07-17 18:45'
labels:
  - base-batch
dependencies: []
priority: high
type: task
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Land ratchet.sh and snapshot budgets at today's measured counts: one only-down word budget over the mandatory-read set (AGENTS.md, CONCEPTS.md, REVIEW.md, skills/*/SKILL.md, doc-48) plus grep tripwires (codex exec occurrences in skills/, runtime-specific flags in skill prose, shell-parser idioms in policy code). Improvements auto-lower budgets; raises are operator-approved commits only.

Decision ledger:
- Single total budget over the mandatory-read set, not per-skill files — asked-and-answered exchange 2026-07-17 (rationale in doc-51).
- Tripwires snapshot at current counts and lock downward — same exchange.
- Placement: qq CI required checks — same exchange.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Budgets exist at measured snapshot values and CI fails when any count exceeds its budget
- [x] #2 An improvement automatically lowers its budget file
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented tools/ratchet.sh (check/update), tools/ratchet-baselines.conf (mandatory-read glob set + three grep tripwires with scope/match-kind/pattern + four snapshot counts), and tests/test-ratchet.sh (in the required shell-tests glob). Snapshot: prose 11658 words (LC_ALL=C wc -w over AGENTS/CONCEPTS/REVIEW/skills/*/SKILL.md/doc-48); codex-exec 9; runtime flags 14; shell-parser idioms 5. Owner verification: 8/8 shell tests green; check exits 0 at snapshot; counts independently reproduced; auto-lower proven in-tree (99->9) and raise refused. Code-review: one P2 false-green (grep NUL-byte binary suppression) fixed with --binary-files=text on both scoped greps plus a regression test that a NUL-containing file carrying the idiom still trips the tripwire.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ratchet baselines land at today's measured counts, enforced on the required shell-tests CI path. AC#1: budgets exist at snapshot values and check fails when any count exceeds its budget (proven for all four counts). AC#2: an improvement auto-lowers its budget via update, which refuses to raise. Delivered on PR #132.
<!-- SECTION:FINAL_SUMMARY:END -->
