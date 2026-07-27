---
id: doc-119
title: Plan — One-level Task decomposition and configurable identities
type: specification
created_date: '2026-07-27 18:29'
updated_date: '2026-07-27 18:30'
---
# Plan — One-level Task decomposition and configurable identities

## Disposition

decision-21 records the operator-approved system-wide model encoded by this plan.

## Outcome

Make a single parent/child level the system-wide grouping primitive for human-sized outcomes without turning identifiers into schedules. A parent is the umbrella outcome. A child is one independently deliverable Change. Dependencies expose the ready frontier; actual concurrency is selected only after an ownership and conflict check.

## Settled model

- `<PREFIX>-N` is an umbrella or standalone Task.
- `<PREFIX>-N.M` is a direct child; `.M` is a stable, non-ordinal identity assigned at creation.
- Grandchildren are not supported. Steps that do not own a separate Change remain in the child plan or checklist.
- Parentage means membership. `depends_on` means a genuine prerequisite and nothing else.
- The ready frontier is the set of incomplete children whose prerequisites are satisfied.
- Ready children are only concurrency candidates. The accountable owner checks Repository/worktree ownership, files, invariants, external resources, and integration order before dispatch.
- Do not add durable `parallel_with`; transient contention belongs in the approved execution plan rather than as a fake outcome dependency.
- Each child owns one coherent Change. The parent carries the umbrella outcome, non-goals, shared consequential decisions, and end-to-end acceptance; the integrating/final child verifies the umbrella.

## Task identity contract

Each Repository's Backlog `task_prefix` is authoritative. qq centralizes interpretation so active identities are exactly `<CONFIGURED-PREFIX>-N` or `<CONFIGURED-PREFIX>-N.M`, with uppercase display identity and lowercase filename/branch token. Zero and leading-zero segments, mismatched prefixes, malformed values, and deeper descendants refuse. Generic qq guidance uses `<Task-ID>` or `<PREFIX>-N.M`; qq's own `t` configuration remains unchanged. Historical identifiers, commits, branches, quoted examples, and evidence are not migrated.

The Pi command extension performs generic single-token input-safety checks and defers Repository-specific prefix validation to the qq engine. Shell, Python, and TypeScript surfaces do not reproduce separate configured-prefix grammars.

## Cross-Repository ownership

A Task remains in the Repository containing its Change. Same-Repository children use the umbrella's decimal identity. A child whose Change belongs elsewhere receives that Repository's native local Task identity and is linked from the umbrella by a qualified coordinate such as `owner/repo:FEAT-12.3`. This Change introduces no cross-Repository scheduler, registry, mirrored Task, or workflow state.

## T-178 reshaping

Repurpose unstarted T-178 as the umbrella outcome for delivering the first opt-in project-agent broker pilot while preserving its settled intent and constraints.

- The broker-core creation and first NATS transport slice is an external Repository-local child once broker-core exists; T-178 records the intended qualified link rather than fabricating a qq-local Task for another Repository's Change.
- The later qq pin/integration/local-pilot Change may become a native T-178 child and depends on the released green broker-core slice.
- Cross-project traffic, default enablement, later model/service choices, and implementation of either slice remain out of scope.

## Implementation

1. Add one qq-owned Task-identity helper usable by the runtime surfaces, deriving the configured prefix from `backlog/config.yml` and validating/normalizing parent plus one child level.
2. Update board aggregation and branch parsing to preserve full parent/child identity and avoid collisions between a parent and child.
3. Update handoff engine and `/handoff` extension so child Tasks resolve without surrogate integer Tasks; keep authoritative Repository validation in the engine.
4. Update Observer/Architect intake validation, mapping, sorting, resolution filenames, help, and focused schemas/guidance where they encode integer-only identities.
5. Update generic methodology and workflow guidance to define the grouping/dependency/ready-frontier/concurrency contract without implying decimal order.
6. Reshape T-178 through Backlog CLI and record external/local child boundaries without creating broker-core or implementing the pilot.
7. Add focused `t` and non-`t` fixtures for parents, children, mismatched prefixes, malformed values, grandchildren, board/branch distinction, handoff, intake, and resolution.
8. Run focused checks, all Repository checks, diagnostics, diff hygiene, and fresh-context review. Fix only confirmed in-scope findings and review every fix delta.

## Boundary and non-goals

No Backlog upstream patch; no grandchildren; no scheduler; no `parallel_with`; no dependency inference; no auto-dispatch; no cross-Repository workflow database; no broker-core creation; no NATS adoption or implementation; no qq pilot implementation; no default enablement; no historical ID migration; no unrelated cleanup; no OpenWiki refresh.

## Success evidence

- Valid configured-prefix parents and direct children traverse each affected qq surface.
- Mismatched prefixes, zero/leading-zero segments, malformed identities, and deeper descendants refuse without mutation.
- Board and branch derivation distinguish the parent from every child and preserve complete identities.
- Handoff and Observer/Architect intake/resolution work for children without surrogate Tasks.
- A fresh non-`t` Backlog fixture proves configuration-derived behavior and a changed fixture prefix takes effect without source edits.
- Guidance makes membership, prerequisites, ready-frontier eligibility, conflict checks, and execution constraints distinct.
- T-178 remains recognizable as the settled pilot outcome while recording Repository-local child ownership.
- Focused and full Checks, diagnostics, `git diff --check`, completion-envelope verification, fresh-context review, and final GitHub Checks pass.
