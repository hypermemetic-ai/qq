---
id: decision-11
title: qq observation optimizes the harness, never the model
date: '2026-07-22'
status: accepted
---
## Context

The doc-80 sweep separated two families of "improvement" systems: harness
observers (find wasted work, tool gaps, instruction conflicts in how the
harness runs agents) and model/prompt optimizers (GEPA, MIPROv2, Trace,
TextGrad, Agent Lightning — all requiring a runnable target plus an
operator-supplied metric). The operator framed T-142's target explicitly:
"I'm not optimizing a language model. I'm optimizing my harness" — the
interest is work an agent does that a tool would collapse, and conflicts
in the instructions qq provides that cause wasted time.

## Decision

qq's observation and improvement discovery targets the harness: tools,
skills, instructions, work orders, workflow, orchestration. Model weights,
model evaluation, benchmark rigs, and prompt optimization against metrics
are out of scope. Approved by the operator 2026-07-22
(asked-and-answered alignment exchange; owning Task T-142; plan doc-81).

## Consequences

- The observer's episode taxonomy (doc-82) is harness-shaped: tool-gap
  (capability-unknown vs tool-missing), instruction-conflict,
  instruction-deficiency, tool-misuse, friction, waste, failure,
  substrate. Findings propose harness remedies (new/surfaced tool,
  instruction or skill edit, process change), never model changes.
- Adopting an optimizer framework later (e.g. for prompt text qq owns)
  is a separate alignment; it does not amend this record.
- No benchmark rig is reintroduced for observation; evidence comes from
  real delivered runs (doc-80's rejection of SWE-bench-class rigs for
  this role stands).
