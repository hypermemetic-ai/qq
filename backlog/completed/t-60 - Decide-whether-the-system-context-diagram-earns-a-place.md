---
id: T-60
title: Decide whether the system context diagram earns a place
status: Done
assignee: []
created_date: '2026-07-16 16:43'
updated_date: '2026-07-16 18:54'
labels: []
dependencies: []
priority: low
type: spike
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From Ideas doc-1 (2026-07-12 11:09): "the system context diagram was the only tolerable one. figure out why and whether we can justify including it."

Context: T-55 removed BPMN and diagram tooling entirely; doc-17/doc-18 hold the diagram research; the OpenWiki formerly carried generated diagrams. Investigate what made the system context diagram tolerable where others failed (scope? stability? abstraction level?), and produce a recommendation with criteria: include it (where, generated how, maintained by whom) or leave diagrams out. Read-only research; decision is the operators.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The analysis explains why the system context diagram outperformed the other diagrams, grounded in the repo history and docs
- [x] #2 A concrete include-or-omit recommendation with maintenance cost is recorded for operator disposition
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Operator disposition (2026-07-16): retired — BPMN and the diagram question are closed; no diagram work was wanted from this idea. The read-only research that ran before this disposition is parked outside the Repository (session scratchpad) and deliberately not landed as a Knowledge item.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Retired by the operator: with BPMN removed (T-55) the diagram question is closed; no inclusion, no research doc landed.
<!-- SECTION:FINAL_SUMMARY:END -->
