---
id: T-180
title: Make one-level Task decomposition and configurable identities first-class
status: In Progress
assignee: []
created_date: '2026-07-27 18:27'
updated_date: '2026-07-27 18:30'
labels: []
dependencies: []
references:
  - >-
    backlog/tasks/t-178 -
    Create-the-broker-core-Repository-and-prove-the-first-NATS-message-plane-slice.md
documentation:
  - doc-119
priority: high
type: enhancement
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: make one-level umbrella/child decomposition a first-class qq methodology and runtime capability so related Changes are grouped for human reasoning while prerequisite graphs still expose a safe parallel ready frontier.

Scope: define non-ordinal child identities, prerequisite-only dependencies, ownership/conflict-checked concurrency, and Repository-local cross-Repository children; derive active Task identity grammar from each Repository's configured Backlog prefix; update qq board, handoff, Observer/Architect, branch parsing, tests, and generic guidance; reshape T-178 as the umbrella for the first opt-in project-agent broker pilot without implementing that pilot.

Non-goals: no grandchildren, scheduler, durable parallel_with relation, Backlog upstream changes, broker-core creation, NATS adoption or implementation, cross-Repository workflow database, or OpenWiki refresh.

Decision ledger:
- One child level; decimal child suffixes are stable non-ordinal identities; parentage is membership; depends_on is genuine prerequisite only; ready-frontier children may run concurrently only after an ownership/conflict check; no durable parallel_with field — decision-21 (operator asked-and-answered alignment exchange, 2026-07-27: "Let's proceed with this plan" and subsequent parallelism approval).
- Each Repository's configured Backlog task_prefix is authoritative for active Task identities; qq derives <PREFIX>-N and one-level <PREFIX>-N.M rather than hardcoding T/t — decision-21 (operator selection "Config-derived (Recommended)", same alignment exchange).
- A Task remains with the Repository containing its Change; external children are linked from the umbrella by qualified Repository/native-Task coordinates — decision-21 (operator selection "Repository-local (Recommended)", same alignment exchange).
- T-178 becomes the umbrella outcome while its current broker-core slice becomes an external Repository-local child once broker-core exists; the later qq pilot adapter may become a native child — decision-21 and operator approval of the complete enactment brief, same alignment exchange.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Guidance defines exactly one child level; decimal suffixes are non-ordinal; parentage expresses membership; depends_on expresses prerequisites; the ready frontier and ownership/conflict check govern parallel dispatch; grandchildren and parallel_with are excluded.
- [ ] #2 qq derives each active Task identity from the Repository configured Backlog prefix and accepts only <PREFIX>-N or <PREFIX>-N.M while refusing mismatched prefixes, malformed identities, zero/leading-zero segments, and deeper descendants.
- [ ] #3 Affected board, branch, handoff, Architect/Observer intake and resolution surfaces support parent and child identities without surrogate top-level Tasks, with focused non-t prefix and refusal regressions.
- [ ] #4 Cross-Repository children retain Repository-local Tasks and are linked by qualified Repository/native-Task coordinates; no cross-Repository workflow state is introduced.
- [ ] #5 T-178 preserves its settled intent as the umbrella for the first opt-in project-agent broker pilot and records its broker-core and later qq integration delivery boundaries without implementing either slice.
- [ ] #6 Focused checks, full Repository checks, diagnostics, diff hygiene, and fresh-context review pass in one unmerged pull request.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement the approved one-level decomposition model and configured-prefix Task identity parser across qq's board, handoff, Observer/Architect, branch, test, and guidance surfaces; reshape T-178 through Backlog CLI; delegate implementation under one complete bounded work order; verify focused and full Checks; run fresh-context review; deliver one unmerged pull request.
<!-- SECTION:PLAN:END -->
