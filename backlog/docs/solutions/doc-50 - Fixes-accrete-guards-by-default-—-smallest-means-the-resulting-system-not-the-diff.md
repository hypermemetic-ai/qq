---
id: doc-50
title: >-
  Fixes accrete guards by default — smallest means the resulting system, not the
  diff
type: guide
created_date: '2026-07-17 16:39'
updated_date: '2026-07-17 16:39'
tags:
  - solution
  - review
  - complexity
  - measurement
---
# Fixes accrete guards by default — smallest means the resulting system, not the diff

## Symptom

Measured 2026-07-17 across the eight linked repositories: 89% of 166 fix
commits net-add lines. In deciq, 94% of `fix:` commits grow production code
(median +24 production lines; 97% net-positive overall) and 73.5% add
decision points (exact AST count), while the median non-fix commit adds zero
code lines. Fix vocabulary runs *harden, close gaps, bound*; commit
`8ee0250 "fix: harden review-fix seams"` hardens seams a prior review round
itself created. The operator's assessment, settled in alignment: the
findings were almost always valid — the systematic growth was the invalid
part.

## Root cause

A finding shaped (file, line, concrete failure path) frames every defect as
a point defect, and the cheapest discharge of a point defect is a point
guard: the guard is derivable from the failure alone with local knowledge,
while the simplifying restructure needs global knowledge of which states are
legal. The protocol then priced the remedies asymmetrically: "smallest
causal correction" was measured on the diff, and a state-space-shrinking
restructure read as materially widening the Change — a mandatory
stop-and-align — so the guard was free and the simplification cost an
operator turn.

Underneath: a bug is evidence the representation admits an illegal state. A
guard fences one path and preserves the state — O(paths), and guards compose
into new paths, which makes accretion self-accelerating. A representation
fix removes the admission — O(1) per invariant — and is necessarily a
simplification, which is why sound reasoning buys the solution and the
simplification together. Guards are correct where the illegal state is
externally injected (a trust boundary must fence); they are suspect in the
interior — and because origin is transitive, the distinction is only
decidable against declared boundaries, not by tracing.

## Resolution

Settled by operator alignment, 2026-07-17:

- **Smallest resulting system.** "Smallest remedy" means the smallest system
  after the change; diff size is only a tiebreaker.
- **In-boundary simplification is pre-authorized.** A remedy that shrinks or
  preserves the state space inside the agreed boundary proceeds without a
  realignment turn, visible in the completion envelope. Boundary changes
  still align.
- **Findings classify fence-or-shrink by boundary citation, not origin
  judgment.** The Change's brief declares its trust boundaries alongside its
  threat model. A fence is legitimate only at a cited declared boundary; a
  finding whose remedy wants a guard names that boundary, and an empty
  citation means shrink. Origin is a chain — most interior bad states trace
  to some input eventually — so the classification is a lookup against the
  declaration, settled once at alignment, never per-finding archaeology. No
  addition-shaped prescriptions; any prescription prices both the guard form
  and the removal form. An interior guard that survives the mechanical test
  stands, but stands labeled.
- **Two parallel counters, never blended:** net production-LOC delta and net
  decision-point delta, measured **per fix commit** (equal in practice to
  per declared-done delta). Displayed always — completion envelope and
  review surface. On growth in either, spend one "same fix, smaller"
  regeneration, accepted mechanically: Checks pass and strictly smaller
  takes it; otherwise the original stands with no justification prose.
- **Blocking only at shape.** Merge-boundary gates are shape ratchets —
  counts of functions above a complexity grade, files over a length bound —
  with budgets that only fall. Trend gauges (fix-net percentage, health
  composite) are read on a schedule and gate nothing.
- **Placement principle.** Obligation only where retry is cheap (the
  implementer's loop) or firing is rare (a shape budget); information
  everywhere else. Blends at a gate are gameable by trading and
  undiagnosable; per-change obligations firing at high base rates go rote.

## Verification

History measurement 2026-07-17 (fix-net analysis, eight repositories;
figures above). Delegated read-only codex investigation, same date: PR
reconstruction covered 93.8%/94.5% of non-merge commits; grow-then-cancel
inside multi-commit fix PRs occurred 0/13 (deciq production LOC), 0/13
(exact Python decision counts), 0/28 (qq production LOC) — commit-level
measurement is not noisy; deciq fix PRs median 6.5 commits because feature
PRs carry review-fix commits, so PR-unit measurement conflates fix growth
with feature growth, while per-commit isolates remedy deltas including
mid-PR review rounds. Field results relied on: Facebook Infer's diff-time
~70% versus near-zero batch fix rate; Google Tricorder's ignore-rate bar for
blocking checks; complexity-aware regeneration improving pass rates.
Related: doc-39 — sustained same-class findings signal an enforcement-layer
mistake; that lesson halts the repeated-finding loop, this one removes the
per-round bias toward additive remedies.
