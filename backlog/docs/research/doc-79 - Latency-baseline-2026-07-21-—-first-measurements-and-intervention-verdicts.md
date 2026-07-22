---
id: doc-79
title: Latency baseline 2026-07-21 — first measurements and intervention verdicts
type: other
created_date: '2026-07-22 00:15'
---
# Latency baseline 2026-07-21 — first measurements and intervention verdicts

**Owning Task:** T-127 (AC#5, baseline report). **Method:** owner analysis
of the local span store (`$XDG_STATE_HOME/qq/spans/qq/spans.jsonl`) via
`qq-observe summarize` plus per-span attribute inspection; no external
sources. Confidence: HIGH on what the store contains, MEDIUM on the
interpretations flagged below, LOW on any phase the store does not cover.

## Dataset

21 spans, all `invoke_agent`, recorded 2026-07-21 across **7 delivered
Changes** (T-106, T-126, T-136, T-137, T-127, T-130, T-139) — AC#5's
"at least 5 delivered Changes" threshold met. 13 reviewer + 8 implementer
spans; phases present: review and implementation only. Zero cross-session
correlation: 21 spans form 21 distinct traces (AC#2's documented substrate
gaps; TRACEPARENT injection is not yet honored by the pi-subagents
substrate).

## Measurements

| phase | spans | total | mean | p50 | p95 |
|---|---|---|---|---|---|
| review | 13 | 79.5 min | 6.1 min | 4.3 min | 30.0 min |
| implementation | 8 | 69.8 min | 8.7 min | 6.6 min | 15.5 min |

Statuses: 19 error / 2 ok. The error signal is **not** work failure:
17 spans end on exit=143 (SIGTERM at run teardown, including runs whose
structured envelopes were complete — today's four acceptance-rejected
dispatches and even the acceptance:none T-139 probe), 1 on exit=124
(a 30-minute reviewer timeout kill), and only the 2 exit=0 spans ended
without teardown signals. Run outcome truth lives in the run's
status/envelope, not in the span's exit-code mapping (MEDIUM confidence,
established by cross-checking four runs whose envelopes I verified today).

## What the evidence does and does not show

The entire measured cost is agent wall time inside `invoke_agent` spans.
No span anywhere measures artifact construction or reuse: no board
materialization, no dispatch preload, no pi/extension startup, no
derivation of any kind. Either those costs are negligible, or they are
uninstrumented — the store cannot distinguish, but at the granularity a
derivation store would address (seconds), nothing competes with the
minute-scale agent wall time that dominates every Change observed.

Phases orientation, alignment, and delivery carry **zero** spans: the
accountable-session work (grilling, verification, land/retire) is
unmeasured today.

## Intervention candidates, ranked by measured impact

1. **Span status semantics (SELECT).** Exit-143-at-teardown maps to
   `error`, making the error rate (19/21) useless as a health signal.
   Map teardown SIGTERM on envelope-complete runs to ok-with-note, or
   record run outcome from status.json instead of exit code. Cheap, and
   every later verdict depends on it.
2. **Trace-context propagation (SELECT).** 21 spans / 21 traces means no
   cross-session latency is actually observable yet; closing the
   pi-subagents parenting gap (AC#2's documented limit) unlocks
   orientation/alignment/delivery measurement.
3. **Reviewer timeout shape (WATCH).** One 30-minute kill (p95 review =
   30 min vs the 15-minute reviewer dispatch budget in the skill snippet
   — the discrepancy itself wants a look); n=1, no action yet.
4. **Artifact reuse — the derivation store, T-121 (KILL recommended).**
   T-121's AC#1 gates activation on observation ranking artifact reuse
   among the top measured interventions. The baseline shows minute-scale
   agent wall time as 100% of measured cost and zero measurable
   artifact-construction cost. Artifact reuse cannot rank; per T-121's
   own gate this task should be killed rather than parked again.
   **Operator disposition required** — realign-vs-kill is the operator's
   call; the evidence position is kill.

## Caveats

n=21 spans from a single day and a single operator's machine; error
semantics are repaired by candidate 1 before rates are quotable; phase
coverage is partial by construction today; delegate spans record only the
dispatch chokepoint, not per-turn cost.
