---
id: T-63
title: >-
  delegate-batch: contain the codex startup wedge and fix dispatched-forever
  glass
status: Done
assignee: []
created_date: '2026-07-16 18:56'
updated_date: '2026-07-16 18:59'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-approved solution for T-58 findings (doc-45). Scope: (1) wrap the dispatch command in timeout -k 10 <bound> — kill-path probe 2026-07-16: plain timeout -k kills the full 3-process group (exit 124, no survivors), setsid breaks it (do not use); reconcile exit 124 as FAILED: startup wedge (timeout). (2) Dispatch delegates MCP-less (config override) so no npx network fetch gates spawn. (3) At every dispatcher-owned boundary, sweep ALL non-terminal delegates events files for thread.started (publish working + steering then); events still empty N minutes after dispatch escalates BLOCKED. (4) Align sidebar --ttl-ms to ~2x the dispatch bound. Touches skills/delegate-batch/SKILL.md and a doc-43 amendment (round 4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dispatch command shape carries the timeout wrapper and MCP-less override, with exit-124 reconciliation in the wake text
- [x] #2 Boundary sweep for thread.started and the no-thread escalation are in the status-surface section, recorded as a doc-43 amendment
- [x] #3 TTL guidance aligned to the dispatch bound
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Kill-path probe (2026-07-16, live): plain timeout -k reaps the full 3-process group (exit 124, no survivors); setsid detaches and leaks — excluded. MCP-less override syntax live-verified on the T-62 dispatch (thread.started within seconds). Boundary sweep and no-thread escalation recorded as doc-43 round 4; behaviorally adopted by the dispatching session mid-batch before this text landed. Environment note outside this Change: pinning context7 in ~/.codex/config.toml (replacing @latest) is recommended in doc-45 and left to the operator.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
delegate-batch dispatch is wedge-contained: timeout -k 10 3600 wrapper with exit-124 reconciled to FAILED: startup/turn wedge; delegates spawn MCP-less by default; every boundary sweeps all non-terminal delegates' events for thread.started with a 10-minute no-thread escalation; sidebar TTL aligned to twice the bound. Recorded as doc-43 round 4.
<!-- SECTION:FINAL_SUMMARY:END -->
