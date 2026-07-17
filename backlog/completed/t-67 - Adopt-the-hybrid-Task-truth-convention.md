---
id: T-67
title: Adopt the hybrid Task-truth convention
status: Done
assignee: []
created_date: '2026-07-17 01:27'
updated_date: '2026-07-17 01:33'
labels: []
dependencies: []
priority: medium
type: chore
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator decision (2026-07-16, closing the doc-46 open question): adopt the hybrid convention. Task records are born and kept current (mint, status flips, in-flight notes) in the primary main checkout working tree so the board renders live truth for active work; at finalization the owning Actor moves the record into the Change checkout with a single mv, and Done + final summary + AC checks land in the same pull request as the code.

Land: a Task-truth section in doc-48; the disposition recorded in doc-46; deliver-change step 2/5 amendments; a delegate-batch work-order constraint clarification; t-66 record carried in; Done-sweep of t-65/t-66 behind a doctor run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc-48 records the hybrid convention and doc-46's open decision is closed with the operator disposition
- [x] #2 deliver-change and delegate-batch text match the convention
- [x] #3 The Change itself follows the convention (minted in primary, record moved at finalization)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landed per the operator's verbatim decision (hybrid it is): doc-48 Task-truth section, doc-46 disposition (+T-66 repaint verdict and interim restart rule), deliver-change steps 2/5, delegate-batch work-order constraint. This Change is itself the first full hybrid lifecycle: minted and flipped In Progress in primary (visible on the freshly restarted board), record moved in at finalization alongside T-66's.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hybrid Task-truth convention adopted and recorded across doc-48, doc-46, deliver-change, and delegate-batch: records live in primary while work is active (live board) and ride their Change at finalization. Review: one vocabulary finding, fixed; verdict otherwise clean.
<!-- SECTION:FINAL_SUMMARY:END -->
