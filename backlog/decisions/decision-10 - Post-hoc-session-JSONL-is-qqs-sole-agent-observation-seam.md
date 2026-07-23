---
id: decision-10
title: Post-hoc session JSONL is qq's sole agent-observation seam
date: '2026-07-22'
status: accepted
---
## Context

qq's latency-observation rig (T-127/T-140/T-141: span store, TRACEPARENT
injection, qq-trace-context extension, bin/qq-observe emission) answered
"what do we optimize first" with phase latencies, and its baseline (doc-79)
found all measured cost was minute-scale agent wall time — too thin to aim
interventions. The operator's replacement direction (T-142): a dedicated
observer agent that reads complete sessions end-to-end — including
persisted reasoning blocks — and emits ranked harness-improvement analyses.

The capture-mode question (post-hoc session files vs live instrumentation)
was settled by inspection: pi session JSONL persists the full message tree
(text, thinking, toolCall, toolResult) with timestamps and usage by
construction, while every live-capture path in the doc-80 sweep had
documented silent-loss modes (unfired async scorers, dropped spans, dead
local agents, subagent internals omitted). Live capture's unique advantages
— sub-event timing and mid-run intervention — serve the retired latency
goal and a non-goal respectively.

## Decision

qq observes agent work exclusively through persisted session files (pi
session JSONL; delegate/subagent session files in their native formats)
read after the fact. No live hooks, span pipelines, or in-loop
instrumentation are added for observation purposes. Approved by the
operator 2026-07-22 (asked-and-answered alignment exchange; owning Task
T-142; plan doc-81).

## Consequences

- The span/TRACEPARENT rig retires in a later, separately aligned Change;
  the session-JSONL reader side of bin/qq-observe survives and is the
  mount point for the observer's pre-pass (mount, don't mirror).
- Observation completeness rests on the durable record, by construction;
  the failure mode shifts from silent capture loss to parsing correctness,
  which the defensive reader owns with measured precision (doc-81
  success evidence).
- Derivation of sub-event timing (TTFT, streaming) and mid-run
  intervention is out of scope for observation; a future need for either
  is a new alignment, not an exception.
- The run-tree assembler harvests volatile session files (e.g.
  /tmp/pi-subagent-sessions) into the durable XDG store at Change landing
  so post-hoc analysis never depends on /tmp lifetime.
