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
small Pi extension, tentatively named `agent_messages`.

### Live identity and presence

The registry is machine-wide and cross-project. Every live session has:

- a durable session identity used as the address;
- a readable role: `architect`, `runner`, `reviewer`, `researcher`, or
  `observer`;
- its project;
- an optional work-item/ticket label;
- reachability and lease freshness;
- runtime details such as pane and session as diagnostics, not addresses.

The optional ticket is a data point, not an embedded task system. Another
component may later maintain the live source of truth for which pane owns which
work. An unlabeled session is valid. A readable display can therefore be, for
example, `deciq / architect / A-90`, while its stable address remains independent
of a ticket that may change.

Registration occurs at session start with the known project, role, and optional
initial ticket. The session must be able to update its ticket association later.
Short leases remove dead sessions. Multiple sessions with the same project and
role are disambiguated by their stable session identity and optional ticket.

### Agent-facing operations

The first usable slice provides:

- `list` — return live agents across all projects, including project, role,
  optional ticket, stable address, and reachability. Optional filters may narrow
  by project, role, or ticket.
- `send` — durably address one agent with a message and one of three urgency
  tiers: default, urgent, or critical. It returns a message ID and current
  transport status.
- `status` — inspect one sent message as queued, delivering, delivered, blocked,
  expired, or failed, with a concise reason and timestamps. This lets agents
  troubleshoot delivery without investigating the Event Plane internals.

A response is another ordinary `send`; a special reply/correlation workflow is
not part of the first interface.

The adapter also provides:

- background addressed receiving;
- custom-message injection into Pi;
- acknowledgement after Pi accepts/persists the message;
- durable idempotent delivery through the Event Plane;
- critical interruption, retained from the legacy adapter: a critical message
  may interrupt the recipient's current run so the message is seen promptly.

### Publication

`publish` means broadcasting a durable fact to every subscription for a
project/kind rather than addressing one agent. Examples are lifecycle or
“attention needed” events. The Event Plane may retain this capability for other
components, but it is not initially exposed to agents: ordinary agent
communication uses direct `send`.

### Deferred from the first adapter

- A/B Backlog parsing and the legacy Product authority schema;
- fixed legacy owner roles and persona prompts;
- `qq-actor-binding` source-fingerprint machinery as currently implemented;
- general fact publication in the model-facing tool;
- subscription/replay controls in the model-facing tool;
- automatic lifecycle facts beyond presence leases;
- application-level `answered`/`resolved` workflow;
- mandatory Coordinator brokerage.

Here, “legacy task identity” means the old requirement that recipients be
proven from A/B Backlog records and addressed as Product task owners. It does
not mean dropping the optional ticket/work association described above.

Service administration can retain inspect, backup, and recovery operations
without exposing them to agents.

## Behavioral guidance

Agents should self-service from durable source first. Messaging is for a fact
that must reach another live agent or a question whose answer is not available
from durable evidence. Direct addressing is acceptable; the old mandatory
Coordinator brokerage is not a transport requirement and should not be rebuilt
implicitly.
