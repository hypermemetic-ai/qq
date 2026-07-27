---
id: T-178
title: Deliver the first opt-in project-agent broker pilot
status: To Do
assignee: []
created_date: '2026-07-27 09:21'
updated_date: '2026-07-27 18:31'
labels: []
dependencies: []
references:
  - T-172
  - T-180
documentation:
  - doc-110
priority: high
type: feature
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deliver the first opt-in project-agent broker pilot as one human-sized umbrella outcome spanning a separately owned generic broker-core Change and a later qq integration/local-pilot Change. This Task remains the durable pickup point; it authorizes neither child merely by existing. Each child requires its own explicit alignment and approved plan before external side effects, dependency adoption, or implementation.

Decision ledger:
- Use one direct child level; child suffixes are stable non-ordinal identities; parentage expresses membership; dependencies express genuine prerequisites; actual concurrency comes only from a dependency-ready frontier plus ownership/conflict review — decision-21.
- A Change's Task stays in the Repository containing that Change; the broker-core child receives its native Task in the future core Repository and T-178 links it by qualified coordinate once that Repository and Task exist; the later qq adapter/pilot child may use a native T-178 decimal identity — decision-21.
- Recommend NATS JetStream as the deterministic plane after equivalent BullMQ/Redis and NATS probes: T-172 and doc-110.
- Put NATS lifecycle, protocol/state, coordinator and epoch fencing, terminal reconciliation, results/fan-in/waiter recovery, SDK/runtime interface, diagnostics, and failure tests in a separate core Repository: operator answer “Core repo + qq adapter” recorded by T-172 and doc-110.
- Preserve accepted requests across broker/session process crashes and use at-least-once processing with recipient-side idempotency, never an exactly-once claim: T-172 and doc-110.
- Keep Pi/Herdr methodology integration, project identity, authority/prompt policy, Skill/tool, and qq-specific UI in qq: T-172 and doc-110.
- Repository name/hosting and the NATS lifecycle mechanism remain operator-owned choices to settle during alignment: doc-110.

Delivery boundary: the external core child owns only the generic broker-core vertical slice under “First production Changes” in doc-110. The later qq child depends on a released, green core slice and owns pinning/integration plus an opt-in local pilot, UAT, and rollback evidence. Cross-project traffic, default enablement, pi-intercom retirement, permanent model/service choices, hostile-tenant isolation, and broader rollout remain outside this umbrella.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The external core child receives an explicitly approved Repository-local plan that settles Repository name/hosting and NATS lifecycle before any external side effect.
- [ ] #2 The released green core child pins and verifies the selected NATS Server and NATS.js versions and proves the loopback-only file-backed lifecycle, protocol/state, fencing, reconciliation, results/fan-in/waiter recovery, narrow SDK/runtime interface, diagnostics, teardown, and failure matrix required by doc-110.
- [ ] #3 A separately aligned direct qq child pins the released core, delivers an opt-in local project-agent pilot, and supplies UAT plus rollback evidence without default enablement or pi-intercom retirement.
- [ ] #4 The core and qq children remain in their owning Repositories, the umbrella records exact qualified external coordinates once they exist, and genuine prerequisites are represented as dependencies rather than identifier order.
- [ ] #5 End-to-end acceptance proves the first local pilot while cross-project traffic, permanent model/service choices, hostile-tenant isolation, and broader rollout remain out of scope.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reshaped under T-180/decision-21 from the unstarted core-only follow-up into the umbrella outcome; no implementation, Repository creation, dependency adoption, or lifecycle choice has begun.

Child delivery map:
- External core child — pending Repository creation and local Task allocation. Add the exact qualified `<owner>/<repo>:<Task-ID>` coordinate here only after its own alignment creates both.
- Native qq adapter/local-pilot child — create as a direct T-178 child only after its scope is aligned; it genuinely depends on the released green external core child.
- The final/integrating child verifies the umbrella acceptance and closes T-178.
<!-- SECTION:NOTES:END -->
