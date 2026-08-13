---
type: Architecture overview
title: QQ Architecture
description: Runtime map of QQ's composed Pi extensions, workshop workflow, provider operations, and durable machine-local Event Plane.
tags: [architecture, pi-extension, event-plane, workshops]
openwiki:
  roles: [architecture, repository]
  source_paths: [extensions/index.ts, package.json]
  symbols: [registerQQ]
  validation_commands: [npm test]
---

# QQ Architecture

QQ has four cooperating areas: a composed Pi runtime, asynchronous [workshops](../workflows/workshops.md), provider [telemetry](../operations/telemetry.md), and the durable [Event Plane](../event-plane/service.md). `extensions/index.ts:registerQQ` is the Pi composition root; registration order starts with [execution profiles](../agent-runtime/execution-profiles.md), then messaging and independent safety/workflow extensions.

## Runtime map

```mermaid
flowchart TD
    Pi["Pi session"] --> Root["extensions/index.ts registerQQ"]
    Root --> Profiles["Roles and execution profiles"]
    Root --> Messaging["Agent messaging"]
    Root --> Safety["Session safety extensions"]
    Root --> Workshop["Workshop tools"]
    Profiles --> Messaging
    Profiles --> Workshop
    Messaging --> Plane["Event Plane service"]
    Plane --> Db["Private SQLite journal"]
    Workshop --> Backlog["Backlog CLI"]
    Workshop --> Worktree["Git worktree"]
    Workshop --> Herdr["Herdr runner pane"]
    Telemetry["qq-telemetry"] --> Policy["Execution-profile policy"]
    Profiles --> Policy
```

*Role selection is shared runtime state; messaging persists through Event Plane, while workshops provision isolated runners through Backlog, Git, and Herdr.*

## Ownership

| Area | Entrypoint | Owns |
|---|---|---|
| Pi composition | `extensions/index.ts` | Extension registration order only |
| Roles/profiles | `extensions/execution-profiles.ts`, `bin/qq-profile` | Activation, model/effort binding, prompt replacement, profile policy |
| Messaging | `extensions/agent-messages.ts` | Presence, discovery, Pi injection, receipt-aware acknowledgement |
| Session safety | `extensions/operator-stage.ts` and sibling guards | Operator execution boundary, privacy markers, managed-file and loop guards |
| Workshops | `extensions/workshop.ts`, `bin/lib/workshop.mjs` | Backlog tools, brief generation, worktree and Herdr runner startup |
| Event Plane | `bin/event-plane` -> `event_plane_service.py:main` | Generic journal, obligations, retries, leases, retention |
| Operations | `bin/qq-telemetry*`, `bin/event-plane-admin`, systemd units | Usage display, cookie gate, service administration, wiki refresh |

## Cross-system invariants

- `runner` and `architect` are the only roles. Profile selection emits `qq:role-selected`; messaging refreshes presence and workshops update role gating.
- Agent addressing always uses canonical Pi session IDs. Presence metadata—including role, tasks, pane, and busy card—is discovery only.
- Event Plane owns durable custody; Pi transcript evidence gates acknowledgement.
- Workshop delegation creates isolated state and returns after startup; it does not merge or claim completion.
- Private filesystem ownership and modes protect Event Plane, profile, workshop, privacy, telemetry, and cookie state.
- Operator staging inserts text but never executes it; transcript scrub touches only an identity-matched finalized previous session.

Use the component page linked above for exact symbols and focused checks. Run `npm test` for composition-root, shared-role, or multi-area changes.