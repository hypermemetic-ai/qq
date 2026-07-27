---
id: doc-111
title: Plan — T-172 proportionate message plane for the project agent broker
type: specification
created_date: '2026-07-27 07:47'
updated_date: '2026-07-27 08:57'
---
# Plan — T-172 proportionate message plane for the project agent broker

## Intended outcome

Select and prove the smallest established deterministic message plane that can safely carry communication requests for an intelligent project broker. The result must match a single-operator, single-machine, human-scale workload rather than import infrastructure designed for a distributed service fleet.

The production direction approved by the operator is one machine-local message bus with project-scoped queues, one logical intelligent broker agent per project home, and broker-to-broker cross-project coordination. Every agent communication request is adjudicated by its project broker. The deterministic plane owns durable movement and explicit state; it never makes semantic routing decisions. Accepted requests must survive broker/session process crashes.

T-172 compared BullMQ/Redis and NATS JetStream through equivalent executable evidence. After reviewing that evidence, the operator selected NATS JetStream as the recommendation and selected a separate broker-core Repository with a thin qq Pi/Herdr adapter. Neither candidate is adopted and no production Repository or dependency is created by this spike.

## Approved decisions

- A separate broker-core Repository will own the deterministic transport, coordinator, protocol/state, broker runtime interface, SDK, and failure harness; qq will own the pinned Pi/Herdr methodology adapter, role/authority policy, Skill/tool, and qq-specific UI.
- Every agent communication request enters the intelligent broker path; deterministic shortcuts may exist inside that path but agents have no peer-to-peer bypass.
- One logical broker agent serves each project home. Cross-project requests travel broker-to-broker.
- One machine-local deterministic bus supplies project-scoped durable queues.
- Reachability, receivability, answerability, acceptance, and resolution are separate states.
- Accepted communication requests must survive broker/session process crashes.
- The transport target is durable at-least-once processing with idempotent deduplication, not an exactly-once claim.
- Broker agents are non-owning Actors: they may inspect allowed evidence read-only and route or synthesize it, but may not settle operator decisions, expand scope, or mutate project work.
- Operator-initiated direct messaging remains a visible manual escape hatch.
- The adoption choice must be proportionate to the expected message volume. Feature richness or enterprise scale is not a benefit unless this use case needs it.
- Recommend NATS JetStream because it supplies the smallest raw deterministic broker surface under the measured envelope; broker-core must explicitly own durable terminal reconciliation, retained results, exact-key fan-in, and waiter recovery.
- Reject BullMQ/Redis for this use because its larger Redis/BullMQ dependency and lifecycle surface is not justified by the job machinery it adds; retain it as evidence/fallback, not an adopted choice.
- Production implementation waits for separately aligned broker-core and qq integration Changes.

Citations: operator asked-and-answered alignment exchanges on 2026-07-27, including selections “System bus, project queues,” “Approve spike,” “Survive crashes,” “Probe NATS too,” “NATS JetStream,” and “Core repo + qq adapter,” plus the amendment to keep the deterministic system simple and present candidate findings before adoption judgment.

## Assumption to verify first

The workload is one operator on one machine, usually a single-digit to low-dozens set of live Pi sessions, with human-scale bursts rather than sustained high-throughput traffic. The measured envelope is 10–11 live sessions, 145 communication records in 24 hours, a peak of 25 records per five minutes, and p95 payloads below 1 KiB. If later evidence materially contradicts this envelope, stop and realign rather than silently widening the infrastructure target.

## Work plan

1. **Establish the workload and failure contract.** Inspect current qq/Pi/intercom session topology and available local evidence. Define a conservative session count, burst shape, message size, retention need, and recovery window. Define observable semantics for durable acceptance, lease, acknowledgement, retry, duplicate suppression, disconnect, expiry, and terminal failure.
2. **Bound the candidate set by simplicity.** Compare a small set of credible established options spanning embedded/local durable queues and lightweight brokers. Treat current pi-intercom as the live best-effort baseline. Screen out systems requiring unjustified clusters, multiple production services, ongoing administration, or broad infrastructure expertise.
3. **Compare candidates on common requirements.** Evaluate durability, acknowledgement/lease/retry behavior, idempotency support, project namespace isolation, broker-to-broker routing, TypeScript/Pi integration, macOS/Linux lifecycle, install/update burden, observability, recovery behavior, and total operational footprint. Separate native guarantees from behavior the application would have to invent.
4. **Correct and retain the BullMQ/Redis probe.** Bound all worker readiness and cleanup paths, including Redis unavailability during setup. Re-run crash recovery, duplicate redelivery, disconnected-recipient truthfulness, isolation, fan-in, footprint, normal cleanup, and interrupted cleanup.
5. **Build an equivalent NATS JetStream probe.** Use an exact released version and the same message/failure contract. Demonstrate durable restart, worker death/redelivery, stable recipient-side idempotency, disconnected-recipient terminal truth, project isolation, four-to-one in-flight fan-in/results, measured footprint, and exact cleanup. Do not add production messaging code.
6. **Recommend only after side-by-side evidence.** Compare total system simplicity: daemon/binary and dependency footprint, configuration, lifecycle, custom state machinery, failure observability, and exact semantics. Prefer the smallest complete system, not the smallest component or largest feature list. Present the recommendation and rejected alternatives for operator disposition; do not imply adoption.
7. **Specify the production boundary.** Define the intent envelope, stable Repository/project-home identity, queue topology, broker singleton/coordinator lifecycle, capability heartbeat, delivery-state machine, cross-project protocol, intelligent-broker authority limits, operator escape hatch, Repository ownership boundary, and exact first production Change. Do not ship a partial replacement.
8. **Verify and review.** Run both probes and repository Checks, obtain fresh-context review, fix only confirmed in-scope failures, and review each fix delta.
9. **Deliver through one qq PR.** Preserve the cited assessment and design in T-172, complete the Task only when every acceptance criterion has fresh evidence, and hand the green spike PR to the operator without merging it.

## Non-goals

- Production communication replacement in this Change.
- Creating the selected production Repository or adding a production dependency.
- Remote or multi-machine messaging.
- A general chat room or delegation lifecycle engine.
- Exactly-once delivery claims.
- Enterprise clustering, high availability, or throughput optimization unsupported by the measured workload.
- Broker authority over operator intent, consequential decisions, or Repository mutation.

## Success evidence

- The workload envelope is explicit and precedes candidate scoring.
- Primary-source evidence distinguishes native guarantees from application-authored machinery.
- Both BullMQ/Redis and NATS JetStream pass equivalent fresh probes, or a candidate fails openly with a bounded, reproducible reason.
- The final recommendation compares complete operational surface and custom correctness machinery and records the operator-selected NATS direction without implying adoption.
- The final design records a separate broker-core Repository plus thin qq adapter, with the exact first broker-core and later qq integration Change boundaries, without authorizing or shipping either.
