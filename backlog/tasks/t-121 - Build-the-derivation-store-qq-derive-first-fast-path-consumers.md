---
id: T-121
title: 'Build the derivation store: qq-derive + first fast-path consumers'
status: To Do
assignee: []
created_date: '2026-07-20 17:52'
labels: []
dependencies: []
priority: high
type: task
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Foundational fast-path capability (operator-approved design, 2026-07-20): one derivation store with three rails. Cache and preload share one shape — (key, artifact, pointer) where the key hashes the inputs (repo revision, intent text, brief body, model id); freshness holds by construction (recompute key: match = read, mismatch = regenerate; no invalidation protocol). Parallelism is the discipline that fills it: never queue independent derivations.

Machinery (deliberately small): bin/qq-derive adapter (put/get/has, key computation) storing plain files under ~/.cache/qq/derivations/<repo>/<key> — runtime state, never tracked. Everything else is skill amendments pointing at the store. No daemon, no service, no new skill.

First consumers: orientation digest (preloaded at session_start, read by every consumer — highest hit rate), reviewer-brief pre-generation during implementation, review-context package reuse across rounds, research fan-out by default (T-93 pattern), review fan-out by lens with owner reconciliation, deliver-change pipelining overlaps. Subagent-based preloading rides the T-95 substrate (pi-subagents background runs); the rails that work on codex today need not wait for it.

Guardrails (operator-settled): no semantic answer-reuse across different questions (doc-16 authority rule); speculation is read-only; the 3-5 writing-ticket cap stands (operator bandwidth); fresh-context independence preserved. Every speed claim rides a fresh Check: latency probes (session-start-to-first-turn, dispatch-to-envelope, review-round wall time, store hit rate) baselined before, demonstrated after.

Decision ledger:
- One-store/three-rails design, sequencing (T-94 unblock first, then T-95, then this), guardrails, and probe-based evidence: operator approval, asked-and-answered alignment exchange, 2026-07-20 project-home session ('Approve design and sequence').
- Cache/preload/parallelize definitions (artifact derivation store; subagent generation with stored pointers; no false serialization): operator reframe in the same exchange, 2026-07-20.
- Context-delivery architecture (cache as optimization, never authority; stable prefixes; capsule contracts): doc-16.
- Substrate dependence of subagent preloading: T-95 (unblocked by T-120 evidence, PR #160).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bin/qq-derive implements put/get/has with input-hashed keys and miss-regenerates semantics; shell tests green
- [ ] #2 At least the orientation-digest and reviewer-brief consumers live as skill amendments with latency-probe baselines and after measurements demonstrating improvement
- [ ] #3 Research and review fan-out defaults encoded in their skills with owner reconciliation preserved; probe evidence collected
<!-- AC:END -->
