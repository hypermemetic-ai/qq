---
id: T-178
title: Create the broker-core Repository and prove the first NATS message-plane slice
status: To Do
assignee: []
created_date: '2026-07-27 09:21'
labels: []
dependencies: []
references:
  - T-172
documentation:
  - doc-110
priority: high
type: feature
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the separate broker-core Repository selected by T-172 and deliver its first transport-only NATS JetStream vertical slice. This Task is the durable pickup point for a fresh accountable session; it does not authorize work merely by existing. Start by aligning the remaining operator-owned Repository and lifecycle choices, then obtain explicit plan approval before any Repository creation, dependency adoption, or implementation.

Decision ledger:
- Recommend NATS JetStream as the deterministic plane after equivalent BullMQ/Redis and NATS probes: T-172 and doc-110.
- Put NATS lifecycle, protocol/state, coordinator and epoch fencing, terminal reconciliation, results/fan-in/waiter recovery, SDK/runtime interface, diagnostics, and failure tests in a separate broker-core Repository: operator answer “Core repo + qq adapter” recorded by T-172 and doc-110.
- Preserve accepted requests across broker/session process crashes and use at-least-once processing with recipient-side idempotency, never an exactly-once claim: T-172 and doc-110.
- Keep Pi/Herdr methodology integration, project identity, authority/prompt policy, Skill/tool, and qq-specific UI in qq: T-172 and doc-110.
- Repository name/hosting and the NATS lifecycle mechanism remain operator-owned choices to settle during alignment: doc-110.

Scope boundary: deliver only the generic broker-core transport vertical slice specified under “First production Changes” in doc-110. Do not implement the qq adapter, enable a broker by default, remove pi-intercom, add first-slice cross-project traffic, choose a permanent model/service class, or claim hostile-tenant isolation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An explicitly approved alignment plan settles the broker-core Repository name/hosting and NATS lifecycle mechanism before any external side effect.
- [ ] #2 The new Repository pins the selected NATS Server and NATS.js versions, verifies digest/version/license, and provides one loopback-only file-backed lifecycle wrapper.
- [ ] #3 Versioned envelopes, project/subject validation, bounded streams and consumers, the singleton coordinator with durable epochs, terminal reconciliation, retained results, exact-key waiter recovery, and a narrow generic SDK/runtime interface satisfy doc-110 without Pi, Herdr, qq Task, model-vendor, or UI dependencies.
- [ ] #4 Fresh failure tests cover restart, consumer death/redelivery, recipient idempotency, unavailable recipients, project isolation, fan-in/results, overlapping-coordinator refusal, malformed state, advisory/terminal crash windows, signal cleanup, and complete teardown.
- [ ] #5 The released and documented core slice exposes the contract needed by a separately aligned later qq adapter Change without adopting or cutting over that adapter here.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Minted as the unstarted follow-up requested after T-172. No implementation, Repository creation, dependency adoption, or lifecycle choice has begun.
<!-- SECTION:NOTES:END -->
