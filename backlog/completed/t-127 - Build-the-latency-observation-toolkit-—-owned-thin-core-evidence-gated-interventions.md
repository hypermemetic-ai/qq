---
id: T-127
title: >-
  Build the latency-observation toolkit — owned thin core, evidence-gated
  interventions
status: In Progress
assignee: []
created_date: '2026-07-21 03:24'
updated_date: '2026-07-22 00:14'
labels: []
dependencies: []
documentation:
  - doc-71
  - doc-73
  - doc-78
priority: high
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-approved direction (2026-07-21 reshape brief, approved in the accountable project-home session): build qq's latency-observation toolkit for the agentic SDLC. Market verdict (doc-71, owner spot-checked): nothing off the shelf measures cross-session, multi-agent SDLC-phase latency while staying local-first — hybrid leaning build is the only path.

Architecture direction (doc-71): an owned thin observation core — (a) pi session JSONL as the data seam (already written, offline by construction, timestamped entries verified); (b) TRACEPARENT-style trace-context injection at the qq-dispatch chokepoints so delegates and subagent runs parent spans under the accountable session's root (mount-don't-mirror: instrument the engines once, every skill covered by construction); (c) OTel-shaped span vocabulary so disposable local backends (Jaeger all-in-one or Phoenix, single-process, on-demand) can visualize during analysis sprints — nothing standing. Borrow: Claude Code's TRACEPARENT env propagation and the MIT Braintrust pi extension's span shape (PI_PARENT_SPAN_ID/PI_ROOT_SPAN_ID seam, verified). No T-95 substrate dependency — session JSONL and the engines exist today; this supersedes the 2026-07-20 T-94→T-95→T-121 sequencing for this work.

Doctrine: deliberately small machinery for our own surfaces. Observation first — interventions (T-121's derivation store, fan-outs, pipelining, context reduction, model routing) are candidates the baseline evidence selects or kills; nothing preempts need. Span correctness matters more than coverage.

Decision ledger:
- Observation-first direction; store-as-candidate; the T-121/T-127 split; architecture direction per doc-71; no-substrate sequencing amendment; disposable-backend posture — operator rulings + approved reshape brief, asked-and-answered exchange 2026-07-21 (plans doc attached in this Change).
- Cross-session stitching mechanism and local-first platform eliminations — doc-71 (owner spot-checked).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Observation core: phase-span records emitted at the qq-dispatch chokepoints plus a reader over pi session JSONL; append-only local span store under a runtime path, never tracked; shell tests green
- [x] #2 Cross-session correlation: trace-context injection at dispatch spawn points; delegate and subagent spans parent under the accountable root wherever the substrate allows; gaps documented
- [x] #3 Analysis surface: one command summarizing phase latencies and span recurrence over a window — the evidence surface that selects or kills intervention candidates, T-121 first among them
- [x] #4 Disposable backend: documented on-demand mount of Jaeger all-in-one or Phoenix for analysis sprints; nothing standing
- [ ] #5 Baseline report: first real measurements over at least 5 delivered Changes attached as a research doc; intervention candidates ranked by measured impact with explicit select/kill recommendations
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ticket 1 (AC#1+AC#2) delivered via the 2026-07-21 delegate batch: e7869e4 (observation core: append-only span store under XDG state, pi session-JSONL reader, dispatch span emission, trace-context propagation) + ad77a4a (review-round-1 fixes: signal-trap forwarding containment, store-leaf fencing, session version-3 guard, role-derived phases, repository-identity store). Two confined review rounds; round 2 verified all five substantive fixes and left three microsecond-window races, dispositioned as accepted residual risk by the operator 2026-07-21 (land now for the approved pi-code-tool A/B trial) and filed as T-136. Owner evidence: native full suite green at ad77a4a; new regression tests fail against e7869e4, pass at HEAD. Counter audits matched envelopes (+272 core; +67 LOC/+16 DP fix).

2026-07-21: AC#3 (qq-observe summarize) and AC#4 (doc-78) delivered via PR #199; fresh-context review passed after a four-finding fix round. AC#5 remains: baseline report over >=5 delivered Changes now that instrumentation is active.

Baseline 2026-07-21 (doc-79): 21 spans over 7 delivered Changes. All measured cost is minute-scale agent wall time; artifact-construction cost is unmeasurable-to-absent, so the evidence position on T-121 is KILL (operator disposition requested). Two follow-on SELECTs: teardown-SIGTERM status semantics (19/21 'error' is misleading) and trace-context propagation (21 spans / 21 traces).
<!-- SECTION:NOTES:END -->
