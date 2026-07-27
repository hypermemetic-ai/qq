---
id: T-177
title: Make qq methodology and confined delegation global
status: In Progress
assignee: []
created_date: '2026-07-27 09:00'
updated_date: '2026-07-27 09:44'
labels: []
dependencies: []
documentation:
  - doc-112
modified_files:
  - CONCEPTS.md
  - README.md
  - bin/qq-dispatch
  - extensions/qq-subagent-env.ts
  - tests/test-qq-dispatch.sh
  - tests/test-qq-subagent-env.sh
  - >-
    backlog/decisions/decision-19 -
    Apply-qq-methodology-and-confined-delegation-globally-to-every-Git-Repository-on-this-operator-owned-Pi-installation.md
  - >-
    backlog/docs/plans/doc-112 -
    Plan-—-Make-qq-methodology-and-confined-delegation-global.md
priority: high
type: bug
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DecIQ and every other Repository on this operator-owned Pi installation must be able to use qq's confined delegation without a per-Repository activation marker. The global extension currently selects canonical qq dispatch for a Repository carrying the canonical `AGENTS.md` symlink, but the dispatcher rejects that Repository because its Git common directory differs from qq's. DecIQ's production-readback assignment is blocked before child or provider start.

Outcome: make qq methodology and confined delegation global for every Git Repository, preserve Pi project trust and Landstrip scope, activate canonical global context after merge, and restore the unchanged DecIQ assignment.

## Decision ledger

- D1 Harness scope: qq methodology and confined delegation apply globally to every Git Repository on this operator-owned Pi installation; Repository `AGENTS.md` is optional additive context, not activation — disposition: `decision-19`, operator-approved asked-and-answered alignment exchange 2026-07-27.
- D2 Trust and refusal boundary: Pi project trust remains authoritative for project-supplied settings/extensions, Landstrip stays scoped to the assigned Repository, and non-Git delegation refuses — disposition: approved plan doc-112 in the same 2026-07-27 alignment exchange.
- D3 Recovery objective: do not mutate or bypass DecIQ; land and activate qq, then retry its unchanged bounded assignment — disposition: operator directive 2026-07-27, “not losing track of the higher level like the original objective… allow other projects to do their work without being blocked.”
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A separate Git Repository with no qq AGENTS.md marker receives canonical qq role manifests from primary authority and launches a confined delegate whose policy is scoped to that Repository.
- [ ] #2 qq linked worktrees continue using checkout-local adapter and manifests for their own Git common directory, refuse external Repositories before child launch, and a non-Git child cwd still refuses.
- [ ] #3 Pi project trust, trusted role and execution-profile authority, authentication staging, structured-output, timeout, signal, and process-tree confinement behavior remain unchanged and green.
- [ ] #4 The documented bootstrap mounts canonical qq AGENTS.md through Pi's global context path without requiring per-Repository activation.
- [ ] #5 Canonical-primary markerless external dispatch and feature-worktree cross-authority refusal are proven before merge; the actual DecIQ supported-role retry remains explicit post-merge land follow-through without config/package changes or unconstrained fallback.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the exact DecIQ exit-65 reproducer.
2. Make canonical qq context and delegation global while retaining qq-worktree self-hosting, project trust, non-Git refusal, and Repository-scoped Landstrip grants.
3. Add an end-to-end external-Repository regression fixture without an `AGENTS.md` marker and update current operating documentation/vocabulary.
4. Run focused confinement Checks and fresh-context review, publish one green PR, and leave merge to the operator.
5. After merge, activate the global context mount and signal DecIQ to retry the unchanged assignment.
<!-- SECTION:PLAN:END -->
