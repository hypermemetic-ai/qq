---
id: T-84
title: Slim the protocol skills to judgment
status: Done
assignee: []
created_date: '2026-07-17 17:18'
updated_date: '2026-07-20 17:10'
labels:
  - base-batch
dependencies:
  - T-83
priority: medium
type: task
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
deliver-change, delegate-batch, code-review, research call the engines with unconditional prose; degradation is the engines' job; cockpit never blocks delivery; browser-persistence verification dropped; disposition watch retained but non-load-bearing atop idempotent qq-change land.

Decision ledger:
- All five slimming decisions — doc-51 (operator-approved plan, 2026-07-17). Targets: deliver-change 196→~100, delegate-batch 243→~120, code-review 147→~110, research 80→~60.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Skill line counts meet doc-51 targets and conformance tests are replaced by engine contract tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final: deliver-change 204→57, delegate-batch 205→70, code-review 141→60, research 74→57 lines — at/under doc-51 targets with judgment content reviewer-verified. Sentence-level wording assertions in tests/test-qq-herdr-home.sh dissolved per AC; engine contract tests (qq-dispatch/qq-status/qq-change/qq-pr-watch) carry the behavior. Review round 1: 2 findings (retire identity wiring, doc-51 reviewer rules) fixed in f9a750f; round 2 approved. prose_words 11192→7578.
<!-- SECTION:NOTES:END -->
