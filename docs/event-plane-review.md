# Event Plane messaging review

## Decision

Keep the Event Plane and agent-to-agent messaging capability, but do not import
its legacy identity and lifecycle coupling unchanged.

## What exists

The legacy implementation has four principal layers:

1. A dependency-free Python service over a private Unix socket and SQLite
   journal (`qq_event_plane_service.py`, 2,149 lines).
2. Matching Python and TypeScript clients (327 and 236 lines).
3. A Pi tool/receiver adapter named `actor_messaging` (1,252 lines).
4. An operator/admin CLI plus an inactive disposable integration probe.

The service supports:

- addressed `send` obligations;
- Product/kind `publish` facts;
- durable subscriptions and replay;
- guarded acknowledgement, retry, block, and disposition;
- idempotent producer request IDs;
- status and journal inspection;
- bounded retention, backup, singleton ownership, and restart recovery.

The Pi tool exposes `publish`, `send`, `question`, `reply`, `status`, and
`list_actors`. Inbound messages are injected into Pi as custom messages and are
acknowledged only after persisted-session readback proves delivery.

## What is good

- One machine-local authority owns SQLite and serializes concurrent operations.
- Durable addressed delivery survives process and service restarts.
- Producer request IDs provide idempotence and conflicting-content refusal.
- Transport state is separate from whether a question was answered or resolved.
- Recipients are logical identities; panes, sessions, attempts, and event IDs are
  diagnostics rather than addresses.
- The wire protocol is bounded and clients have no SQL access.
- The service uses only the Python standard library.

The retired full service proof matrix still passes all 24 executable proofs.
The retired adapter suite and the current disposable live probe also pass.

## What is coupled to legacy QQ

Most coupling is in the Pi adapter, not the Event Plane core:

- fixed Architect/Coordinator/Adaptive-owner/Bounded-owner roles;
- A/B Backlog task discovery and `Active`/assignee parsing;
- `qq-actor-binding` and A-189 source-fingerprint guards;
- enable records written around a particular role, task, pane, and session;
- Herdr-specific discovery of connected recipients;
- session lifecycle publications;
- critical-message run interruption;
- one-off reply custody and detailed correlation state;
- legacy Product naming throughout user-facing language.

The core also implements generalized subscriptions, gap reconstruction,
retention, administrative disposition, and backup. These are coherent, but are
more than the first agent-communication slice needs.

## Recommended fresh boundary

Keep the proven service and clients initially, then replace the adapter with a
small identity-neutral Pi extension, tentatively named `agent_messages`.

The first usable slice should provide:

- a stable agent identity supplied by Pi/session configuration;
- `list`, `send`, `reply`, and `status` tool actions;
- a background addressed receiver;
- custom-message injection into Pi;
- acknowledgement after Pi accepts/persists the message;
- default and urgent priority only;
- durable idempotent delivery through the Event Plane.

Defer from the first slice:

- personas and fixed roles;
- A/B task and Product authority discovery;
- actor-binding/source-fingerprint machinery;
- critical aborts;
- general fact publication in the model-facing tool;
- subscription/replay controls in the model-facing tool;
- automatic lifecycle facts;
- application-level `resolved` workflow.

Service administration can retain inspect, backup, and recovery operations
without exposing them to agents.

## Behavioral guidance

Agents should self-service from durable source first. Messaging is for a fact
that must reach another live agent or a question whose answer is not available
from durable evidence. Direct addressing is acceptable; the old mandatory
Coordinator brokerage is not a transport requirement and should not be rebuilt
implicitly.
