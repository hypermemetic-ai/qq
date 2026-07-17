---
id: T-79
title: Relocate the reduction plan into the Repository as the base-batch plans doc
status: Done
assignee: []
created_date: '2026-07-17 17:15'
updated_date: '2026-07-17 17:19'
labels:
  - base-batch
dependencies: []
priority: high
type: docs
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make ~/Documents/qq-reduction-plan-2026-07-17.md entirely redundant: relocate its living content into backlog/docs/plans, updated with the 2026-07-17 settled dispositions, then mint the base batch as board Tasks. The three loose copies (Documents + two Downloads) are deleted as this Change's post-merge step.

Decision ledger:
- Relocate rather than update the loose doc; repo surfaces become the only truth — asked-and-answered alignment exchange, this session, 2026-07-17 (operator: 'or make that doc entirely redundant.' / 'approved.').
- Structure: one plans doc for rationale + dispositions, lean Tasks with ledgers for the work items — same exchange (brief approved).
- Old plan item 7 dissolves (all sub-decisions settled: ledger kept; FYI-briefs rejected; cadence deferred until the gauge has data) — exchanges of 2026-07-17.
- Old plan item 8 superseded: reaper deletes stale docs (reversal of tag-only, operator 2026-07-17); AGENTS.md managed block accepted until the pi migration rewrites it — same exchanges.
- Review-contract and measurement set as settled in doc-50 — cited, not restated.
- deciq-side shape-ratchets Task minted in deciq's own backlog — approved in the same brief.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A plans document exists under backlog/docs/plans via the Backlog CLI carrying the relocated plan updated with the 2026-07-17 dispositions and their citations
- [x] #2 The base-batch Tasks are minted on the board with decision ledgers, the base-batch label, priorities, and dependencies; backlog doctor is clean
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
doc-51 created under docs/plans carrying the relocated plan updated with all 2026-07-17 dispositions (doc-50 cited; prose budget; reaper delete-reversal; AGENTS.md deferral; cadence deferral; item-7 dissolution; hybrid convention explicitly open). Batch minted as T-80..T-89 with ledgers, base-batch label, priorities, and dependencies; deciq TASK-38 minted in deciq's backlog; backlog doctor clean in both repos. Loose-copy deletion executes post-merge. Delivered on PR #129.
<!-- SECTION:FINAL_SUMMARY:END -->
