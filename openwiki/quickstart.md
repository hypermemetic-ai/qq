---
type: Repository guide
title: QQ Quickstart
description: Practical entrypoint to QQ's Pi runtime, roles, workshop delegation and review, durable messaging, safety guards, telemetry, Event Plane, and focused tests.
tags: [quickstart, repository-map]
openwiki:
  roles: [repository]
  source_paths: [extensions/index.ts, package.json]
  validation_commands: [npm test]
---

# QQ Quickstart

QQ is a machine-local Pi coding-agent runtime. `extensions/index.ts` composes [roles and execution profiles](agent-runtime/execution-profiles.md), durable [agent messaging](agent-messaging/extension.md), [workshop delegation and review](workflows/workshops.md), and [session safety guards](agent-runtime/session-safety.md). A Python [Event Plane](event-plane/service.md) provides messaging custody. [Provider telemetry](operations/telemetry.md) and the [operations runbook](operations/runbook.md) are operator surfaces. See the [architecture map](architecture/overview.md) for boundaries and flow.

## Task routing

| Change area or intent | Wiki page | Exact source entry points | Important symbols or types | Focused tests | Minimal validation |
|---|---|---|---|---|---|
| Roles, prompts, models, context cap, `/profile` | [Execution profiles](agent-runtime/execution-profiles.md) | `extensions/execution-profiles.ts`; `bin/lib/execution-profiles.mjs`; `bin/qq-profile` | `registerExecutionProfiles`, `validateExecutionPolicy`, `composeSystemPrompt` | `tests/test-execution-profiles.mjs` | `node --experimental-strip-types tests/test-execution-profiles.mjs .` |
| Presence, agent messages, busy cards, delivery | [Agent messaging](agent-messaging/extension.md) | `extensions/agent-messages.ts` | `register`, `start`, `receiveOne`, `presenceCard` | `tests/test-agent-messages.mjs`; live suite | `node --experimental-strip-types tests/test-agent-messages.mjs .` |
| Board tools, exact-brief approval, runner startup | [Workshops](workflows/workshops.md) | `extensions/workshop.ts`; `bin/lib/workshop.mjs`; `plugins/brief-gate/` | `makeBrief`, `awaitBriefGate`, `spawnWorkshop` | `tests/test-workshop.mjs`; `tests/test-brief-gate.mjs` | run both focused tests |
| Runner `done`, QA, architect review, merge/cleanup | [Workshops](workflows/workshops.md) | `extensions/review-flow.ts`; `bin/lib/review.mjs` | `prepareDone`, `conductReview`, `landHandoff` | `tests/test-review-flow.mjs` | `node --experimental-strip-types tests/test-review-flow.mjs .` |
| Operator staging, privacy, Backlog guard, Grok recovery | [Session safety](agent-runtime/session-safety.md) | matching `extensions/<capability>.ts` | registered tool or lifecycle handler | matching `tests/test-<capability>.mjs` | run the matching Node test |
| Provider usage or Qwen cookie gate | [Telemetry](operations/telemetry.md) | `bin/qq-telemetry`; `bin/qq-telemetry-cookies` | `validate_profiles_file`, `gateway_roundtrip` | `tests/test-telemetry.sh` | `tests/test-telemetry.sh` |
| Journal, schema, retries, retention | [Event Plane service](event-plane/service.md) | `bin/lib/event_plane_service.py` | `SCHEMA_OBJECTS`, `Store` | `tests/event_plane_test.py` | `tests/test-event-plane.sh` |
| Wire operation, client, or admin CLI | [Protocol and clients](event-plane/protocol-and-clients.md) | `EventPlane.dispatch`; both client modules; `bin/event-plane-admin` | both `EventPlaneClient` classes | Event Plane parity suites | `tests/test-event-plane.sh` |
| Start, inspect, back up, test, or refresh wiki | [Operations](operations/runbook.md) | `bin/event-plane*`; `systemd/user/qq-openwiki.*`; `package.json` | `serve`, `backup`, `shutdown` | relevant focused suite | inspect first; use `npm test` only for cross-system changes |
| Migrate Backlog and handoffs from `TASK-*` to `T-*` | [Operations](operations/runbook.md#task-prefix-migration) | `bin/lib/task-prefix.mjs`; `bin/qq-migrate-task-prefix.mjs` | `migrateTaskPrefix` | `tests/test-task-prefix.mjs` | `node --experimental-strip-types tests/test-task-prefix.mjs .` |
| Understand shipped agent-facing surfaces | [Capability map](guides/agent-capabilities.md) | `extensions/index.ts`; `bin/` | registered tools, commands, shortcuts | `package.json` test order | choose the focused route above |

## Change discipline

Start with the owning file and focused test. Preserve the closed `runner`/`architect` role set, exact policy/protocol schemas, private filesystem state, Event Plane acknowledgement-after-transcript-persistence, architect-only delegation/review, QA's two-look and test-only boundary, and operator-only execution boundaries. A change to `extensions/index.ts`, shared policy, role events, or packaging warrants `npm test`; ordinary component changes do not.

## Backlog

No evidence-blocked documentation gaps are known at this revision.