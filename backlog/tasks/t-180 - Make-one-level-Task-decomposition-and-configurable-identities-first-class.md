---
id: T-180
title: Make one-level Task decomposition and configurable identities first-class
status: Done
assignee: []
created_date: '2026-07-27 18:27'
updated_date: '2026-07-27 22:34'
labels: []
dependencies: []
references:
  - >-
    backlog/tasks/t-178 -
    Create-the-broker-core-Repository-and-prove-the-first-NATS-message-plane-slice.md
documentation:
  - doc-119
modified_files:
  - CONCEPTS.md
  - >-
    backlog/decisions/decision-21 -
    Use-one-level-non-ordinal-Task-children-prerequisite-derived-ready-frontiers-configured-Repository-prefixes-and-Repository-local-external-children.md
  - >-
    backlog/docs/plans/doc-119 -
    Plan-—-One-level-Task-decomposition-and-configurable-identities.md
  - >-
    backlog/tasks/t-178 -
    Create-the-broker-core-Repository-and-prove-the-first-NATS-message-plane-slice.md
  - >-
    backlog/tasks/t-180 -
    Make-one-level-Task-decomposition-and-configurable-identities-first-class.md
  - bin/lib/qq-handoff.py
  - bin/lib/qq_task_identity.py
  - bin/qq-board
  - bin/qq-observe
  - delegation/manifests/observer-intake-result.schema.json
  - extensions/qq-handoff.ts
  - skills/architect/SKILL.md
  - skills/delegate-batch/SKILL.md
  - skills/grilling/SKILL.md
  - tests/test-qq-board.sh
  - tests/test-qq-handoff-extension.sh
  - tests/test-qq-handoff.sh
  - tests/test-qq-observe-routing.sh
  - tests/test-qq-task-identity.sh
  - tools/ratchet-baselines.conf
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
- [x] #1 Guidance defines exactly one child level; decimal suffixes are non-ordinal; parentage expresses membership; depends_on expresses prerequisites; the ready frontier and ownership/conflict check govern parallel dispatch; grandchildren and parallel_with are excluded.
- [x] #2 qq derives each active Task identity from the Repository configured Backlog prefix and accepts only <PREFIX>-N or <PREFIX>-N.M while refusing mismatched prefixes, malformed identities, zero/leading-zero segments, and deeper descendants.
- [x] #3 Affected board, branch, handoff, Architect/Observer intake and resolution surfaces support parent and child identities without surrogate top-level Tasks, with focused non-t prefix and refusal regressions.
- [x] #4 Cross-Repository children retain Repository-local Tasks and are linked by qualified Repository/native-Task coordinates; no cross-Repository workflow state is introduced.
- [x] #5 T-178 preserves its settled intent as the umbrella for the first opt-in project-agent broker pilot and records its broker-core and later qq integration delivery boundaries without implementing either slice.
- [x] #6 Focused checks, full Repository checks, diagnostics, diff hygiene, and fresh-context review pass in one unmerged pull request.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement the approved one-level decomposition model and configured-prefix Task identity parser across qq's board, handoff, Observer/Architect, branch, test, and guidance surfaces; reshape T-178 through Backlog CLI; delegate implementation under one complete bounded work order; verify focused and full Checks; run fresh-context review; deliver one unmerged pull request.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fresh review: full Change review run 2f60bd76-b76e-4577-a319-ce1bba11d580; exact fix-delta review run 57d0b9b1-a0f1-40cc-9bdf-15d8bceac98a returned PASS. UAT: operator selected “Matches” after inspecting T-178 and T-180 in the project-home Backlog board on 2026-07-27.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered the approved one-level Task decomposition system. Decimal direct-child suffixes are non-ordinal; parentage means membership; dependencies expose the ready frontier; ownership/conflict review determines actual concurrency; no grandchildren or parallel_with state were added. External children retain Repository-local Tasks linked by qualified native coordinates. T-178 is now the umbrella for the first opt-in broker pilot.

qq now derives active parent/direct-child identities from each Repository's configured Backlog prefix through one shared helper. Board/branch aggregation, handoff, `/handoff`, Observer/Architect verified intake, result sorting, and merged-Task resolution preserve exact child identities and refuse malformed, mismatched, zero/leading-zero, deeper, or oversized identities. Focused t/non-t regressions and existing lifecycle refusals pass.

Evidence at final head e00e6cb81b19872d84abc2ab360a07e8768b432b: all 42 native Repository shell suites pass after `npm ci --ignore-scripts`; focused identity/board/handoff/extension/Observer/ratchet checks pass; `git diff --check` passes; Python and TypeScript primary LSP are clean; final pi-lens has no blocking finding. Fresh full review 2f60bd76 found only the undispatched same-fix-smaller obligation on the oversized-ID refusal. The exact failure was reproduced and fixed; fresh fix-delta review 57d0b9b1 passed with no residual risk. Operator UAT confirmed T-178 and T-180 render with the intended umbrella/decomposition meaning.

Mechanical counters: feature commit 72b37a7 is +403 net production LOC / +72 decision points. Ratchet correction ae99b55 is 0 / 0. The initial oversized-refusal fix 871b2f5 was +5 / +1; mandatory same-fix-smaller commit e00e6cb is -2 / 0, retaining the green +3 / +1 form relative to ae99b55. Delegated runs produced valid structured outputs, although the surrounding dispatcher repeatedly lost its execution-profile receipt; owner verification against the tree and native Checks is binding.
<!-- SECTION:FINAL_SUMMARY:END -->
