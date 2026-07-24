---
id: T-152
title: Evaluate role-based model routing for qq Pi
status: Done
assignee: []
created_date: '2026-07-24 05:26'
updated_date: '2026-07-24 06:19'
labels: []
dependencies: []
references:
  - 'https://github.com/hypermemetic-ai/qq/pull/233'
documentation:
  - doc-87
  - doc-88
type: spike
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Evaluate whether qq should adopt, adapt, build, or upstream the smallest system that assigns an execution profile to every canonical role in this operator-owned Pi installation. The first Change is research-only: establish decision-grade evidence and return an implementation disposition; do not implement routing.

Decision ledger:
- Approved semantic contract, research method, success evidence, and non-goals — doc-87, approved by the operator in the project-home accountable session on 2026-07-24.
- Canonical roles are orchestrator, architect, implementer, reviewer, researcher, and observer; a role is a recurring workflow seat admitted only when substitution would violate a recurring authority, independence, evidence, or lifecycle invariant; agent names and capabilities do not define roles — asked-and-answered operator alignment exchange, 2026-07-24; captured in doc-87.
- Role occupancy is immutable; delegated roles are explicit, the architect role belongs only to the dedicated architect tab, and every other non-child root Pi session defaults to orchestrator — asked-and-answered operator alignment exchange, 2026-07-24; captured in doc-87.
- This Pi installation is the qq harness, so every Pi model execution in it has exactly one qq role; other harnesses or deliberately separate Pi installations are outside the boundary — asked-and-answered operator alignment exchange, 2026-07-24; captured in doc-87.
- One install-wide operator configuration defines all six complete typed profiles using model, effort, and service class; repositories and agent manifests cannot override it — asked-and-answered operator alignment exchange, 2026-07-24; captured in doc-87.
- Unsupported or invalid combinations refuse the next request; there is no silent omission, clamping, stale continuation, automatic fallback, provider-options escape hatch, or occupancy override — asked-and-answered operator alignment exchange, 2026-07-24; captured in doc-87.
- The complete profile hot-resolves before each logical agent request and remains pinned through that prompt's tool loop; a valid edit can change every field, including model, for the next prompt across running sessions — asked-and-answered operator alignment exchange, 2026-07-24; captured in doc-87.
- Existing Pi footer and pi-subagents displays remain the visibility surfaces; add no new UI unless research proves a material service-class visibility gap — asked-and-answered operator alignment exchange, 2026-07-24; captured in doc-87.
- First Change is a cited adopt/adapt/build/upstream evaluation only, with no implementation, user-setting change, live paid API probe, access-policy change, or role expansion — approved operator alignment brief, 2026-07-24; captured in doc-87.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The approved six-role and install-wide routing contract is captured in the owning Task and attached plan document.
- [x] #2 A cited research report verifies current Pi, pi-subagents, package, and Codex service-tier capabilities against every load-bearing requirement, separating fact, inference, confidence, and gaps.
- [x] #3 The report compares adopt, adapt, small qq extension, and upstream-gap options and recommends the smallest resulting system with a bounded implementation brief.
- [x] #4 The research-only Change contains no routing implementation or machine-setting mutation, passes applicable Checks, and receives fresh-context review.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Research current Pi and package capabilities against the approved role-routing contract; verify load-bearing behavior from primary documentation/source and safe local probes; compare adopt, adapt, build, and upstream-gap options; deliver one cited recommendation and minimal implementation brief.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research disposition (doc-88): UPSTREAM-FIRST, then build a thin qq-owned resolver. Current public Pi hooks cannot provide exact request-local, fail-closed profiles across ordinary and auxiliary executions; no surveyed package satisfies the complete contract, and adapting one would amount to a rewrite.

Bounded next Change: upstream a typed execution-profile seam in Pi; after that release is pinned, add the install-wide six-role qq resolver, trusted occupancy assertions, locked pi-subagents compute selection, and service-class telemetry in existing displays. No routing implementation belongs to T-152.

Review correction: current PI_SUBAGENT_CHILD_AGENT is not a trusted role assertion. pi-subagents project discovery can replace qq's same-name user-source manifest, then passes only the selected agent name. The bounded next Change must reserve canonical seats to verified trusted qq manifest-source metadata and derive a dedicated role assertion from that source; same-name project agents cannot claim occupancy.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the research-only role-routing evaluation. The cited report (doc-88) recommends UPSTREAM-FIRST, then a thin qq-owned resolver: Pi must add a fail-fast request-local execution-profile seam; qq must retain six-role policy and trusted occupancy; pi-subagents must reserve canonical delegated seats to verified qq manifest-source metadata; existing displays need service-class telemetry. No routing, settings, access policy, role catalog, or UI was changed. All repository tests, native delegate enforcement, Backlog validation, diff checks, and fresh-context review passed.
<!-- SECTION:FINAL_SUMMARY:END -->
