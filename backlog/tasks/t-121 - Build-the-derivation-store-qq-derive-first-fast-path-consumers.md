---
id: T-121
title: >-
  Derivation store qq-derive — candidate intervention pending observation
  evidence
status: To Do
assignee: []
created_date: '2026-07-20 17:52'
updated_date: '2026-07-22 00:16'
labels: []
dependencies:
  - T-127
documentation:
  - doc-71
priority: medium
type: task
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
REFRAMED 2026-07-21 (operator rulings, accountable project-home session; reshape plan = doc-73): the derivation store is no longer foundational. It is one candidate latency intervention that T-127's observation evidence will select, reshape, or kill. Blocked by T-127, whose baseline measurements are the selecting evidence.

The 2026-07-20 operator-approved design stays on file below; its pre-chosen consumer list (orientation digest, reviewer-brief pre-generation, review-context reuse, research/review fan-outs, deliver-change pipelining) and its 'foundational fast-path capability' framing were DE-APPROVED 2026-07-21 in favor of observation-first: measure where wall-time actually goes, then build only what the data selects.

Design on file (2026-07-20): one derivation store with three rails. Cache and preload share one shape — (key, artifact, pointer) where the key hashes the inputs (repo revision, intent text, brief body, model id); freshness holds by construction (recompute key: match = read, mismatch = regenerate; no invalidation protocol). Parallelism is the discipline that fills it: never queue independent derivations. Machinery (deliberately small): bin/qq-derive adapter (put/get/has, key computation) storing plain files under ~/.cache/qq/derivations/<repo>/<key> — runtime state, never tracked. No daemon, no service, no new skill.

Guardrails (still binding if activated): no semantic answer-reuse across different questions (doc-16 authority rule); speculation is read-only; the 3-5 writing-ticket cap stands; fresh-context independence preserved. Every speed claim rides a fresh Check: baselines before, demonstrated after.

Decision ledger:
- 2026-07-20 design (one-store/three-rails, guardrails, probe evidence) — operator approval, asked-and-answered exchange 2026-07-20; retained on file.
- Observation-first reframe; store-as-candidate; pre-chosen consumers and foundational framing de-approved; blocked by T-127 — operator rulings, asked-and-answered exchange 2026-07-21; reshape plan doc-73.
- Market verdict: nothing off the shelf measures cross-session multi-agent SDLC-phase latency locally (hybrid leaning build) — doc-71.
- Cache/preload/parallelize definitions; cache as optimization, never authority — doc-16.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dormant until T-127's baseline evidence exists; activation requires the observation data to rank artifact reuse (cache/preload) among the top measured interventions — otherwise this task is realigned or killed
- [ ] #2 If activated: bin/qq-derive implements put/get/has with input-hashed keys and miss-regenerates semantics; shell tests green
- [ ] #3 If activated: consumers selected by measured impact (not the de-approved 2026-07-20 list), each with before/after latency evidence
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-22: baseline doc-79 delivered the evidence T-121's AC#1 gate requires — artifact reuse cannot rank among the top measured interventions (all measured cost is agent wall time). Operator disposition (asked-and-answered exchange): keep parked; revisit after further measurement windows (T-140/T-141 improve the evidence base). Not killed; not activated.
<!-- SECTION:NOTES:END -->
