---
id: decision-1
title: >-
  Adopt BPMN plan artifacts now (shape 1); defer execution-substrate choice to
  T-7 research
date: '2026-07-12 16:02'
status: accepted
---
## Context

T-6's smoke test (2026-07-12) proved an end-to-end BPMN toolchain on this repository's real workflows: deterministic bpmn-moddle codegen, bpmnlint gating, auto-layout, rendering, and lossless per-element evidence stamps. The operator judged the BPMN renders excellent and asked whether planning should generate BPMN before work begins and whether work should be executed as BPMN — versus an agent-native runtime such as LangGraph (idea preserved verbatim in T-7). Three shapes were identified: (1) plan-artifact-only, (2) BPMN-engine execution (Flowable/Camunda/Zeebe), (3) agent-native graph runtime.

## Decision

Adopt shape 1 now: planning emits evidence-stamped BPMN plan artifacts through the T-6 pipeline, stored as Backlog plans documents linked from their owning Tasks, presented to the operator at plan approval, and conformance-checked after the work lands (T-8). The choice of an execution substrate — shape 2, shape 3, or staying at shape 1 — is explicitly deferred to T-7's research round, which the operator has parked until deliberately picked up.

## Consequences

- Plans become reviewable diagrams with machine-checked evidence; plan and diagram cannot drift (same file).
- No new runtime enters the repository; the thin-harness boundary (openwiki/architecture.md) is preserved.
- Post-hoc conformance reports divergence instead of an engine preventing it; unexplained divergence blocks marking a Task Done (bpmn-plans Skill).
- If T-7 later selects an execution substrate, shape-1 artifacts remain valid inputs (same BPMN subset).

