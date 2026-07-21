---
id: T-135
title: Run a prospective natural-work pi-code-tool A/B trial
status: In Progress
assignee: []
created_date: '2026-07-21 07:27'
updated_date: '2026-07-21 07:32'
labels: []
dependencies:
  - T-127
documentation:
  - doc-76
priority: high
type: spike
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-approved direction, 2026-07-21: evaluate pi-code-tool as a performance intervention over ordinary qq work, without selecting tasks for apparent tool fit. The trial begins only after T-127 observation instrumentation is active and uses a fixed prospective assignment schedule.

Decision ledger:
- Prospective natural-work population; every idle, non-command operator input enrolled before treatment; 40 consecutive inputs; at least 10 distinct Changes; fixed pair-randomized 20/20 assignment; intention-to-treat analysis; no interim pruning — operator-approved asked-and-answered alignment exchanges, 2026-07-21 ("approved." for the original brief; "approved" for the pre-treatment enrollment correction); captured in doc-76.
- Treatment boundary: neutral availability, no prompting to use code mode, saved tools and HTTP helpers disabled, no automatic mutation approval, mutations remain on ordinary Pi tool paths — original approved exchange; captured in doc-76.
- Success gate: at least 10% active-wall-time reduction or 15% uncached-input-token reduction, with no worse completion, Checks, review, retry, evidence, or operator-interruption outcomes — original approved exchange; captured in doc-76.
- Permanent adoption is not authorized by this trial and requires a separate disposition; failed or immaterial treatment removes transient trial machinery — original approved exchange; captured in doc-76.

Non-goals: synthetic benchmarks, hand-picked favorable tasks, post-treatment enrollment based on tool use, replay-only evidence, expanding code mode into unapproved side effects, or changing qq lifecycle gates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A deterministic predeclared assignment ledger allocates exactly one treatment and one control in each consecutive pair, 20 of each, without inspecting task content
- [ ] #2 The treatment exposes a pinned pi-code-tool neutrally with saved tools and HTTP helpers disabled, auto-approval off, and mutations retained on ordinary Pi tool paths; the control changes no tool surface
- [ ] #3 After T-127 instrumentation is active, the next 40 idle non-command operator inputs are enrolled before treatment in arrival order, whether or not tools are later used, with at least 10 distinct Changes represented
- [ ] #4 A reproducible intention-to-treat report compares active wall time, uncached input tokens, model turns, tool calls, completion, Checks, review findings, retries, incomplete evidence, and operator interruptions without interim pruning
- [ ] #5 The report records adopt, narrow, hold, or reject against the approved threshold; transient trial machinery is removed unless permanent adoption is separately approved
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approved protocol and execution record: doc-76.
<!-- SECTION:PLAN:END -->
