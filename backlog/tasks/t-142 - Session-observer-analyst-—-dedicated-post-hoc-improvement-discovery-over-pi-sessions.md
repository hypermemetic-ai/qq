---
id: T-142
title: >-
  Session-observer analyst — dedicated post-hoc improvement discovery over pi
  sessions
status: To Do
assignee: []
created_date: '2026-07-22 22:46'
updated_date: '2026-07-22 22:48'
labels: []
dependencies: []
documentation:
  - doc-80
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator idea (2026-07-22, accountable project-home session): retire the performance/benchmarking rig (span store and TRACEPARENT machinery — bin/qq-observe emission side, qq-trace-context extension) and replace performance evaluation with a dedicated observer agent that follows sessions end-to-end — reading the complete post-hoc pi session record including reasoning blocks — and for every end-to-end run emits an analysis document identifying and RANKING improvement opportunities (skills, prompts, tools, harness, workflow). Driver: every run produces too many candidate improvements; a dedicated analyzer must rank which are most worth doing.

Status at birth: existing-implementations sweep complete (attached research doc): no adoptable drop-in exists; evidence favors build/adapt borrowing validated patterns (Claude /insights facet→aggregate→coach; claude-improve tier/confidence/recurrence ranking; MAST failure taxonomy; HarnessScope defensive transcript parsing; documented pitfall list in the research doc). Direction decisions open with the operator: capture mode (post-hoc JSONL vs live instrumentation) and adopt-components-vs-full-build.

Decision ledger: commissioning the research sweep — operator instruction, accountable project-home session 2026-07-22 (asked-and-answered alignment exchange); minting this Task and persisting the research report as a chore Change — operator answer in the same exchange, 2026-07-22; retirement of the trace rig itself and the observer's adopt/build direction — OPEN, not yet dispositioned.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Existing-implementations sweep persisted as a research document attached to this Task (delivered by the birth Change)
- [ ] #2 Operator disposition recorded for capture mode (post-hoc vs live) and adopt-vs-build direction
- [ ] #3 Observer v1 (if build): given a real completed qq session, emits a ranked analysis document over the full record including reasoning, with the research doc's pitfall mitigations demonstrably applied (analyzer-failure isolation, real impact/recurrence ranking, defensive transcript parsing, verified analysis delivery)
<!-- AC:END -->
