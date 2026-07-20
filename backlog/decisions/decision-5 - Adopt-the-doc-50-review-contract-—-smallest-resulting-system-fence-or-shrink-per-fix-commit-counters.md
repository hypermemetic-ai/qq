---
id: decision-5
title: >-
  Adopt the doc-50 review contract — smallest resulting system, fence-or-shrink,
  per-fix-commit counters
date: '2026-07-20 17:09'
status: accepted
---
## Context

Measured 2026-07-17 across the eight linked repositories: 89% of 166 fix
commits net-add lines; the protocol priced remedies on the diff, so point
guards were free and state-space-shrinking restructures cost an operator
turn (doc-50's root cause). Settled by operator alignment 2026-07-17 and
captured in doc-50; T-85 encodes the contract into REVIEW.md, the skills,
and the CONCEPTS.md glossary.

## Decision

Adopt doc-50's review contract as qq's settled review doctrine:

- **Smallest resulting system.** "Smallest remedy" measures the post-Change
  system, not the diff; diff size only breaks ties.
- **In-boundary simplification is pre-authorized.** A remedy that shrinks or
  preserves the state space inside the agreed boundary proceeds without a
  realignment turn, visible in the completion envelope; boundary changes
  still align.
- **Fence-or-shrink by boundary citation.** A fence is legitimate only at a
  trust boundary the Change's brief cited; an empty citation means shrink.
  No addition-shaped prescriptions; an interior guard surviving the
  mechanical test stands, labeled.
- **Two parallel counters, never blended:** net production-LOC delta and net
  decision-point delta per fix commit, displayed always. On growth in
  either, spend one mechanical same-fix-smaller regeneration: Checks pass
  and strictly smaller takes it, otherwise the original stands.
- **Blocking only at shape.** Merge-boundary gates are only-down shape
  budgets; trend gauges gate nothing.
- **Placement principle.** Obligations only where retry is cheap or firing
  is rare; information elsewhere.

## Consequences

- REVIEW.md carries the contract as owned reviewer rules, including the
  recurrence rules doc-51 assigns to it.
- delegate-batch's completion envelope carries the two counters and the
  regeneration trigger; code-review's brief declares trust boundaries
  beside the threat model; deliver-change pre-authorizes in-boundary
  simplification.
- CONCEPTS.md gains canonical entries for "smallest resulting system" and
  "fence-or-shrink".
- Review cadence revisit stays deferred until the fix-net gauge has data
  (doc-51).
