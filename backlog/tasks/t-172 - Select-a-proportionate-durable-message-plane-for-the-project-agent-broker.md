---
id: T-172
title: Select a proportionate durable message plane for the project agent broker
status: Done
assignee: []
created_date: '2026-07-27 06:05'
updated_date: '2026-07-27 09:05'
labels: []
dependencies: []
documentation:
  - doc-111
  - doc-110
priority: high
type: spike
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Design the smallest credible deterministic message plane beneath an intelligent communication broker. The intended production system has one logical broker agent per project home, project-scoped durable queues on one machine-local bus, broker-to-broker cross-project coordination, and broker adjudication of every agent communication request. This spike compares proportionate transports and proves their load-bearing failure semantics before production implementation.

The expected use is single-operator, single-machine, human-scale agent coordination—normally single-digit to low-dozens live sessions and modest message rates. Validate that envelope rather than importing infrastructure sized for a distributed service fleet. Reject operational complexity that is not justified by this workload.

Decision ledger:
- Build a dedicated intelligent communication broker to stop peer-to-peer question storms, preserve the useful intercom visual experience, and let the broker gather information itself: operator alignment exchange, 2026-07-27.
- Treat recipient reachability, receivability, answerability, acceptance, and resolution as distinct states: operator alignment exchange, 2026-07-27.
- Require the broker to adjudicate every agent communication request; deterministic shortcuts may operate inside the broker but never create an agent bypass: operator alignment exchange, 2026-07-27.
- Use one logical broker agent per project home and broker-to-broker coordination across projects: operator alignment exchange, 2026-07-27.
- Separate a traditional deterministic message plane from the intelligent broker plane; the former owns durable ingress/egress, acknowledgements, retries, and failure states while the agent decides what should be communicated: operator alignment exchange, 2026-07-27.
- Use one machine-local message bus with project-scoped queues rather than one transport stack per project: operator answer “System bus, project queues”, 2026-07-27.
- Target durable at-least-once processing with idempotent deduplication, not an exactly-once claim; keep the broker non-owning and retain an operator-only direct-message escape hatch: approved alignment brief, 2026-07-27.
- Start with a bounded design-and-transport spike before production implementation: operator answer “Approve spike”, 2026-07-27.
- Prefer the simplest proven tool commensurate with the actual small message volume; do not adopt a large operational system merely because it is feature-rich: operator amendment, 2026-07-27.
- Execute the realigned spike through plan doc-111 and preserve its evidence in doc-110: approved alignment and scope realignment, 2026-07-27.
- BullMQ/Redis is one probed candidate, not an adopted or operator-approved recommendation: operator correction after review of the candidate findings, 2026-07-27.
- The deterministic plane must preserve accepted requests across broker/session crashes: operator answer “Survive crashes”, 2026-07-27.
- NATS JetStream must receive an equivalent executable probe before T-172 recommends a transport: operator answer “Probe NATS too”, 2026-07-27.
- Recommend NATS JetStream as the deterministic plane because it is the smallest raw broker surface after equivalent executable comparison; its custom durable terminal reconciliation, results, exact-key fan-in, and waiter recovery remain explicit broker-core responsibilities: operator answer “NATS JetStream”, 2026-07-27.
- Place transport, coordinator, protocol/state, broker runtime interface, SDK, and failure harness in a separate broker-core Repository; retain the pinned Pi/Herdr methodology adapter, project identity, authority policy, Skill/tool, and qq-specific UI in qq: operator answer “Core repo + qq adapter”, 2026-07-27.
- BullMQ/Redis is not selected because its larger raw dependency/lifecycle surface is not justified for this use; retain it as assessed fallback evidence, not an adopted production dependency: operator disposition and doc-110, 2026-07-27.
- Specify the future system boundary without authorizing implementation, Repository creation, dependency adoption, or remaining model/lifecycle choices: plan doc-111 and evidence doc-110.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A measured or conservatively evidenced traffic and lifecycle envelope defines the actual single-machine project workload before candidates are judged.
- [x] #2 Established message-plane candidates are compared against crash durability, acknowledgement, lease/retry, deduplication, project isolation, broker-to-broker routing, Pi integration, operational burden, and failure observability using primary sources.
- [x] #3 Equivalent executable probes test BullMQ/Redis and NATS JetStream across durable restart, worker death/redelivery, recipient idempotency, disconnected-recipient truthfulness, project isolation, four-to-one in-flight fan-in/results, footprint, and exact cleanup.
- [x] #4 The final recommendation compares each complete system—including custom application machinery—and selects the smallest proven option without implying production adoption.
- [x] #5 A production design specifies intent envelopes, project identity, capability and delivery states, topology, intelligent-broker authority limits, the Repository ownership boundary, and the first implementation Change without shipping a partial replacement.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Selected result: recommend NATS JetStream from the equivalent crash-durable comparison and place the future broker core in a separate Repository with a thin qq Pi/Herdr adapter. T-172 records evidence/design only; it does not create the Repository, adopt the dependency, or ship messaging.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research round 1 completed via fresh read-only researcher run 3d08bb7c after infrastructure-timeout resume. The accountable owner reproduced aggregate event counts/burst peaks and spot-checked BullMQ, Redis, and NATS load-bearing claims against primary sources. Measured envelope: 10–11 live sessions, 145 records/24h, peak 25/five minutes, p95 below 1 KiB.

BullMQ/Redis candidate probe delegate run 17f28117 was reproduced by the owner. The first owner run exposed a stale terminal Job snapshot and failed honestly; the helper was narrowed to reload and re-assert terminal jobs. Subsequent full runs passed seven scenarios and exact cleanup. Measured local footprint: 37,645,543-byte Redis image, 11,045,465-byte probe dependency tree, about 22 MiB Redis process RSS, and one Redis process plus the Node probe process.

Fresh review round 1 (dd221f68) found four supported failures. Corrections removed unobserved delivered/answered/resolved claims, removed the outer scenario Promise.race, tracked Docker creation attempts before commands, made exact-name cleanup prove absence, replaced the false BullMQ singleton claim with an OS-lock-singleton coordinator and epoch fencing, and reconciled pre-probe report gaps. Production LOC/decision points remain 0/0; the pilot fix candidate shrank 1640→1630 physical lines and 126→124 lexical decisions, versus the pre-fix pilot's 1625 lines/124 decisions.

Fresh fix-delta review timed out once and completed after infrastructure recovery as run f529ce83. It passed three corrected classes and found one material remaining failure: BullMQ Worker.waitUntilReady paths use unbounded Redis retries, so Redis unavailability during readiness can prevent scenario settlement and SIGINT/SIGTERM cleanup. The BullMQ probe is therefore not green until readiness is bounded/cancelled and the failure path is reproduced.

The operator then reopened the transport judgment rather than accepting the agent's BullMQ recommendation. Crash durability remains required, and T-172 is expanded to give NATS JetStream an equivalent executable probe before any recommendation. Plan identifier doc-109 collided with current main and was replaced by doc-111; evidence report remains doc-110. The first-production design and Repository boundary are provisional until side-by-side complexity evidence is reviewed. No production adoption, Repository split, model, license, or lifecycle choice is authorized.

BullMQ readiness correction completed after review f529ce83: every Redis connection now has a finite retry policy, BullMQ readiness has a disconnect-and-join watchdog, and a live Redis-absent Worker readiness assertion rejected in 208–213 ms under 2.5 seconds without the watchdog. Two fresh owner runs passed 7/7 and exact cleanup; targeted SIGTERM exited 143 with no exact resources.

NATS research recovery run 33d7831a selected exact evidence versions NATS Server 2.14.3 and @nats-io transport-node/jetstream 3.4.0, verified by the owner against the official release, registry, stream, and consumer sources. Implementation run 8570db14 produced the spike-only NATS subtree. Two fresh owner runs passed equivalent 7/7 scenarios and exact cleanup; targeted SIGTERM exited 143 cleanly; native ratchet and four-file LSP pass. Local NATS measurements: 6,867,594-byte image, 1,341,227-byte dependency tree, about 18,400–19,304 KiB RSS, two steady processes including Node. The probe explicitly counts custom terminal materialization, results, fan-in, and waiters, and exposes non-durable MaxDeliver advisory plus immediate confirmed-ACK floor caveats. No candidate or Repository boundary is selected pending operator review of doc-110's side-by-side evidence.

Fresh full review 564a6499 found one supported exact-stack reporting failure: BullMQ 5.81.2 had installed its nested ioredis 5.11.1 while probe-authored clients used direct 5.8.2. The direct pin is now 5.11.1. Fresh install asserts BullMQ declares 5.11.1, top-level resolution is 5.11.1, and no nested duplicate exists. Two final unified-stack runs pass 7/7 plus exact cleanup; targeted SIGTERM and native ratchet pass. Final dependency footprint is 10,209,246 bytes. Redis RSS varied from 8,160 to 22,188 KiB in these two runs, so memory is not used as the deciding simplicity metric. Review fix awaits fresh fix-delta review.

Fresh full review 564a6499 reviewed the complete expanded Change and found only the mixed ioredis identity issue. Fresh fix-delta review 0bf0d6e0 passed the unified-stack correction with no material findings. Acceptance criterion 3 is now checked from two fresh owner runs of each exact candidate, both targeted signal cleanups, package identity assertions, native ratchet, and four-file LSP.

Operator disposition after reviewed side-by-side evidence: select NATS JetStream and the core-repo-plus-qq-adapter boundary. Doc-110 now records the rationale, NATS-specific durable topology, explicit advisory/terminal reconciliation responsibility, separate broker-core first Change, and later qq integration Change. BullMQ/Redis remains fallback evidence only. Production adoption, Repository creation, model/cost, and lifecycle remain separately alignable work.

Fresh final design review 1316372f found one supported ownership contradiction: legacy candidate wording still assigned terminal/results to qq and reopened NATS lifecycle ownership despite the selected broker-core boundary. Doc-110 now assigns all transport/application correctness work to broker-core, limits qq to methodology integration/UI, and leaves only Repository naming/hosting plus lifecycle mechanism—not responsibility—open. Fix awaits fresh design-delta re-review.

Fresh ownership fix review dd57da3a found one remaining legacy sentence assigning semantic transport/lifecycle correctness to qq. Doc-110 now assigns message IDs, recipient idempotency, deadlines, and delivery/answer/resolution state to broker-core; qq only declares Pi/Herdr capability/presence facts and retains methodology authority. The candidate gate likewise refers to broker-core, not qq, inventing a queue protocol. Fix awaits final wording re-review.

Final ownership wording re-review 7a75a5d0 passed with no material findings. All five acceptance criteria now have fresh evidence.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Selected NATS JetStream as the proportionate crash-durable deterministic message plane after equivalent BullMQ/Redis and NATS probes. Both passed durable restart, redelivery, recipient idempotency, unavailable-recipient truthfulness, project isolation, four-to-one fan-in/results, footprint, and exact cleanup; NATS won on raw deterministic simplicity (6.9 MB image and 1.34 MB client tree versus 37.6 MB and 10.2 MB) while its custom terminal/result/fan-in responsibilities remain explicit. Specified a separate broker-core Repository owning NATS lifecycle, coordinator, protocol/state, terminal reconciliation, SDK/runtime, and failure tests, with qq retaining a thin Pi/Herdr methodology adapter and UI. This spike ships evidence/design only—no production transport, Repository, service, dependency, or cutover.
<!-- SECTION:FINAL_SUMMARY:END -->
