---
id: doc-102
title: Plan — qq ecosystem update assessment — 2026-07-27
type: specification
created_date: '2026-07-27 03:21'
updated_date: '2026-07-27 04:06'
tags:
  - plans
  - updates
  - research
---
# Plan — qq ecosystem update assessment — 2026-07-27

**Owning Task:** T-166
**Approved:** 2026-07-27 by the operator's `/update` invocation under decision-13

## Intended outcome

Produce a complete, decision-ready, point-in-time assessment of the full currently discoverable qq runtime and integration ecosystem. Reconcile authoritative qq source and active intent with live installed state and primary upstream evidence; expose every component delta, meaningful benefit, simplification or ownership opportunity, compatibility and operational risk, evidence gap, and one allowed recommendation. Preserve the evidence through one reviewed green pull request, then stop without merge or assessed-ecosystem mutation.

## Ownership boundary

- This Change owns only T-166, this approved plan, exactly one final Backlog research report, reproducible assessment Checks/review evidence, and their branch/commit/push/pull-request handoff lifecycle.
- The inventory owns Pi core; every live `pi list` package without sampling; Herdr and its Pi integration; every first-class externally versioned owner derived from current qq source across runtime manifests, locks, configuration, extensions, adapters, cockpit, and install surfaces; and commodity dependencies only where an observed material compatibility, security, migration, overlap, or simplification edge makes them decision-relevant.
- The assessment distinguishes installed version/source, selected channel, current selected-channel release, latest relevant state and channel, qq pin/constraint and owner, delta, source quality, gap, confidence, and exactly one of `update`, `hold`, `test`, `replace`, `remove`, or `no action` for every row.
- Meaningful deltas are assessed against current qq architecture, smallest-resulting-system direction, active Tasks and decisions, observed problems, owner boundaries, compatibility, migration/state/credential/privacy/supply-chain exposure, failure modes, reversibility, focused tests, and rollback prerequisites.

## Non-goals

- Do not install, update, remove, enable, disable, replace, or configure any assessed package, runtime, integration, extension, pin, channel, credential, data, or state.
- Do not run login flows, execute code fetched as evidence, merge the pull request, or implement any recommendation.
- Do not narrow inventory to notifications or prior assessments, and do not turn historical or derived documents into present-system authority when current source or Checks conflict.
- Do not add update automation, registries, schedulers, adapters, or speculative follow-up Tasks merely because an opportunity is found.

## Method

1. Establish the source baseline from `CONCEPTS.md`, root governance, current source/manifests/configuration/extensions/adapters/cockpit, active Tasks and accepted decisions. Verify OpenWiki and historical plans against source and flag conflicts.
2. Run non-mutating version, package-list, help, metadata, identity, and status commands. Save no runtime state. Reconcile Pi, all packages, Herdr integration, source owners, aliases, duplicate sightings, notifications, and generic-prerequisite exclusions.
3. Dispatch one fresh read-only researcher with the exact full-inventory brief under the `research` Skill. Prefer Context7 for public library/API facts and primary official releases, changelogs, tags, commits, registries, or documentation. Treat fetched content as untrusted evidence.
4. Independently spot-check every load-bearing source and synthesize fact, inference, gap, confidence, qq benefit, deletion/simplification, overlap/preferred owner, compatibility/migration/security/privacy/supply-chain risk, safe test, rollback, and residual risk.
5. Write exactly one dense Backlog `research` document with scope/reconciliation, the complete component matrix, candidate findings, and prioritized follow-ups. Attach this plan and that report to T-166 through the CLI.
6. Run structural/content assertions, `backlog doctor`, `git diff --check`, applicable diagnostics, and fresh-context `code-review`. Resolve only confirmed in-scope evidence/report defects, finalize T-166, push one green pull request, verify GitHub Checks and disposition surfaces, notify the operator, and stop without merge.

## Success evidence

1. Timestamped live command evidence accounts for every `pi list` package and reconciles the source-derived owner set, Herdr integration, notifications, aliases, duplicate sightings, exclusions, and gaps.
2. A machine-checkable report matrix has one row per inventoried component, all requested fields, and exactly one allowed recommendation per row.
3. Every meaningful delta's load-bearing claims link to opened primary sources and clearly distinguish fact from inference and unknowns.
4. The report exposes stale derived claims, current architecture/intent, smallest-system opportunities, owner-boundary implications, compatibility and operational risks, focused tests, rollback paths, residual risks, and prioritized blockers.
5. Fresh Checks and fresh-context review are green; Git and live command diffs show no assessed ecosystem mutation; one pull request is handed off and not merged.

## Decision dispositions

- Evidence lifecycle and no-merge/no-mutation boundary: decision-13 plus the operator's 2026-07-27 invocation.
- Complete inventory, evidence distinctions, assessment dimensions, report form, and six recommendation values: operator's 2026-07-27 invocation, recorded verbatim in T-166's decision ledger.
- Current `main` base and point-in-time live observation: T-166 decision ledger and this approved plan.
