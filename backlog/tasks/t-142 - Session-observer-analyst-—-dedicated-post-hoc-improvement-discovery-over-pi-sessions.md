---
id: T-142
title: >-
  Session-observer analyst — dedicated post-hoc improvement discovery over pi
  sessions
status: To Do
assignee: []
created_date: '2026-07-22 22:46'
updated_date: '2026-07-23 00:59'
labels: []
dependencies: []
documentation:
  - doc-80
  - doc-81
  - doc-82
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator idea (2026-07-22, accountable project-home session): retire the performance/benchmarking rig (span store and TRACEPARENT machinery — bin/qq-observe emission side, qq-trace-context extension) and replace performance evaluation with a dedicated observer agent that follows sessions end-to-end — reading the complete post-hoc pi session record including reasoning blocks — and for every end-to-end run emits an analysis document identifying and RANKING improvement opportunities (skills, prompts, tools, harness, workflow). Driver: every run produces too many candidate improvements; a dedicated analyzer must rank which are most worth doing.

Status: plan APPROVED (doc-81, skill core doc-82, operator approval 2026-07-22). Build Change ① (defensive transcript reader + deterministic pre-pass + decision records) is queued behind the inception PR's merge.

Decision ledger: commissioning the research sweep — operator instruction, accountable project-home session 2026-07-22 (asked-and-answered alignment exchange); minting this Task and persisting the research report — operator answer in the same exchange; capture mode (post-hoc session JSONL only) — decision-10; optimization target (harness, not model) — decision-11; cadence (per delivered Change + periodic digest), scope (whole run tree), build shape (qq-native v1) — asked-and-answered alignment exchange, same session 2026-07-22; v1 plan including derived-data storage, deliver-change post-land trigger, analyzer output contract, taxonomy v1 — approved plan doc-81 with skill core doc-82, same session; retirement of the trace rig itself — separate later Change, OPEN. decision-10 and decision-11 minted in build Change ①.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existing-implementations sweep persisted as a research document attached to this Task (delivered by the birth Change)
- [x] #2 Operator disposition recorded for capture mode (post-hoc vs live) and adopt-vs-build direction
- [ ] #3 Observer v1 (if build): given a real completed qq session, emits a ranked analysis document over the full record including reasoning, with the research doc's pitfall mitigations demonstrably applied (analyzer-failure isolation, real impact/recurrence ranking, defensive transcript parsing, verified analysis delivery)
<!-- AC:END -->
