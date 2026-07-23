---
id: T-141
title: >-
  Close the pi-subagents trace-parenting gap so cross-session phases are
  measurable
status: Done
assignee: []
created_date: '2026-07-22 00:15'
updated_date: '2026-07-22 17:40'
labels: []
dependencies: []
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-79 follow-on (SELECT #2). 21 baseline spans form 21 distinct traces; orientation/alignment/delivery carry zero spans. AC#2 documented the substrate gap; closing it unlocks cross-session phase latency. Decision ledger: doc-79 ranking, owner analysis 2026-07-22; qq-side approach (option A — extension-minted session root context, no pi-subagents change) after owner investigation showed pi-subagents passes env through faithfully and the accountable session simply never had root context to pass — asked-and-answered exchange with the operator, accountable project-home session 2026-07-22.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered via branch t141-trace-parenting. New project extension .pi/extensions/qq-trace-context.ts: at accountable-session load it mints per-session QQ_TRACE_ID (32 hex) + a fresh session-marker span id (absent-only; explicit values always win; nested delegates no-op on inherited context), sets PI_ROOT_SPAN_ID/PI_PARENT_SPAN_ID so top-level dispatch spans parent under the session marker, and records a zero-duration phase-less invoke_workflow structural marker via bin/qq-observe (emission non-fatal). Marker context is passed explicitly after scrubbing inherited trace vars from the observer child. Partial pre-set context coherence: anchor = first pre-set of (parent, root); root fills to anchor ?? marker; parent fills to the fresh marker; all-set is a complete no-op. README documents the behavior and the post-hoc `qq-observe read-session <session.jsonl> --trace-id <trace> --parent-span-id <root>` join; residual honesty: the session's own phases remain one coarse span, not per-phase splits.

One confined review round: partial-context coherence finding (parent-only root≠parent; root-only marker id collision) — owner-reproduced, repaired in db59455 with the pinned anchor rule; fix-delta review ACCEPT. REVIEW.md counters discharged: fix commit +6 production LOC / +4 decision points after one same-fix-smaller regeneration (+11/+4 → +6/+4, green, retained). Owner evidence: native full suite 0 failures at HEAD; five-case partial-context matrix probe passes; regression tests fail pre-fix (parent-only/root-only matrix cases), pass at HEAD. Live end-to-end proof (next post-merge dispatch shows one trace with dispatch spans parented under the session marker) owner-pending at merge.
<!-- SECTION:NOTES:END -->
