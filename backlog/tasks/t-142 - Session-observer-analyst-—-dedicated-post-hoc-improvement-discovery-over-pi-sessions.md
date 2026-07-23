---
id: T-142
title: >-
  Session-observer analyst — dedicated post-hoc improvement discovery over pi
  sessions
status: To Do
assignee: []
created_date: '2026-07-22 22:46'
updated_date: '2026-07-23 03:16'
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

Note 2026-07-23 (operator direction, accountable project-home session) — aim widened: design questions, not only performance; the observer as harness architect. (1) The observer must face genuine design questions, not only performance/efficiency improvement. Operator-cited motive: session 019f8ce2 (herder tab, 2026-07-23, delivering T-145) burned ~50k chars of reasoning on manual word-level arithmetic to hold the only-down prose ratchet exactly at its 7606-word budget — counting candidate replacement words one at a time, hunting slack in already-brevity-passed doctrine, weighing trimming doctrine against requesting an operator-approved raise. The agent's reasoning was sound; the harness's own logic (exact-equality budget, net-zero-or-approved-raise acceptance shape, no deterministic counting/drafting tool) created the tight spot, and its resolution is not obviously what is best for the system. Self-referentially sharp: doc-82's core principle holds LLM counting unreliable, yet the ratchet's current design forces exactly that work. (2) Role: the observer acts as architect of the harness (operator's word; custodian considered, set aside). It sees all the data and gets the tools the job needs; it answers "what is best for the system?" and may propose changes to the harness itself on all levels. Beyond the necessary rails — read-only analysis, findings are proposals, nothing auto-applies, the operator disposes — the scope of suggestions it may offer is deliberately unrestricted. (3) Consequence for the approved plan: doc-81/doc-82 currently bind remedies to a closed enum (new-tool | surface-tool | edit-instruction | edit-skill | process) under smallest-remedy doctrine, and taxonomy v1 has no design-question class — signal-anchored discovery alone would score the ratchet episode green. The build Changes carry the amendment: a design-question/system-design episode class, reasoning-volume/contortion signals in the pre-pass, and an open remedy contract for harness-level proposals, still cited, ranked, and operator-disposed.

Decision ledger: commissioning the research sweep — operator instruction, accountable project-home session 2026-07-22 (asked-and-answered alignment exchange); minting this Task and persisting the research report — operator answer in the same exchange; capture mode (post-hoc session JSONL only) — decision-10; optimization target (harness, not model) — decision-11; cadence (per delivered Change + periodic digest), scope (whole run tree), build shape (qq-native v1) — asked-and-answered alignment exchange, same session 2026-07-22; v1 plan including derived-data storage, deliver-change post-land trigger, analyzer output contract, taxonomy v1 — approved plan doc-81 with skill core doc-82, same session; retirement of the trace rig itself — separate later Change, OPEN; pre-pass scope cut to pi-only and codex slated for removal from qq — operator directive, asked-and-answered exchange 2026-07-22 (amends the pi+codex lines of doc-81 via its same-day Amendment section). decision-10 and decision-11 minted in build Change ①. Observer-aim widening (design questions; architect role; suggestion scope unrestricted beyond the cited rails) — operator directive 2026-07-23, accountable project-home session, recorded in the note above; doc-81 amendment and taxonomy/remedy-contract changes land in the build Changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existing-implementations sweep persisted as a research document attached to this Task (delivered by the birth Change)
- [x] #2 Operator disposition recorded for capture mode (post-hoc vs live) and adopt-vs-build direction
- [ ] #3 Observer v1 (if build): given a real completed qq session, emits a ranked analysis document over the full record including reasoning, with the research doc's pitfall mitigations demonstrably applied (analyzer-failure isolation, real impact/recurrence ranking, defensive transcript parsing, verified analysis delivery)
<!-- AC:END -->
