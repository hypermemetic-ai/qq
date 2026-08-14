---
type: Repository guide
title: QQ Quickstart
description: Practical entrypoint to QQ's Pi runtime, roles, board delegation and run review, messaging, safety guards, Dashboard integration, Herdr, Event Plane, and focused tests.
tags: [quickstart, repository-map]
openwiki:
  roles: [repository]
  source_paths: [extensions/index.ts, package.json]
  validation_commands: [npm test]
---

# QQ Quickstart

QQ is a machine-local Pi coding-agent runtime. `extensions/index.ts` composes [roles and pane profiles](agent-runtime/execution-profiles.md), durable [agent messaging](agent-messaging/extension.md), [board delegation and run review](workflows/workshops.md), and [session safety](agent-runtime/session-safety.md). A Python [Event Plane](event-plane/service.md) owns messaging custody; [protocol clients](event-plane/protocol-and-clients.md), the [QQ Dashboard integration](operations/telemetry.md), and the [operations runbook](operations/runbook.md) cover integration and operator surfaces. Start with the [architecture map](architecture/overview.md); use the [capability map](guides/agent-capabilities.md) to confirm shipped commands.

## Task routing

| Change area or intent | Wiki page | Exact source entry points | Important symbols or types | Focused tests | Minimal validation |
|---|---|---|---|---|---|
| Repository activation, roles, prompts, pane profile, public profile list | [Execution profiles](agent-runtime/execution-profiles.md) | `bin/qq-methodology`; `extensions/execution-profiles.ts`; `bin/lib/execution-profiles.mjs`; `bin/qq-profile` | `registerExecutionProfiles`, `validateExecutionPolicy`, `profileListDocument` | `tests/test-methodology.sh`; `tests/test-execution-profiles.mjs` | run the changed surface's focused test |
| Presence, messages, busy cards, delivery | [Agent messaging](agent-messaging/extension.md) | `extensions/agent-messages.ts` | `register`, `start`, `receiveOne`, `presenceCard` | unit and live messaging suites | `node --experimental-strip-types tests/test-agent-messages.mjs .` |
| Board tools, admission, operator gate, run startup | [Board/run workflow](workflows/workshops.md) | `extensions/board.ts`; `bin/lib/admission.mjs`; `bin/lib/run.mjs` | `admitDelegate`, `makeNote`, `prepareRun`, `startRun` | `tests/test-delegation.mjs`; `tests/test-brief-gate.mjs` | run both focused tests |
| Runner `done`, QA, review, clean landing | [Board/run workflow](workflows/workshops.md) | `extensions/review-flow.ts`; `bin/lib/review.mjs` | `prepareDone`, `conductReview`, `isQaPassedProposal`, `landHandoff` | `tests/test-review-flow.mjs` | `node --experimental-strip-types tests/test-review-flow.mjs .` |
| Operator staging, transcript scrub, Backlog or Grok guard | [Session safety](agent-runtime/session-safety.md) | matching `extensions/<capability>.ts` | registered tool or lifecycle handler | matching `tests/test-<capability>.mjs` | run matching focused test |
| Provider dashboard, profile display, Qwen cookie gate, package upgrade | [Dashboard integration](operations/telemetry.md) | `bin/qq-dashboard`; `bin/qq-dashboard-cookies`; `package.json`; `dashboard/README.md` | `QQ_PROFILE_BIN`, `qq.profile-list/v1`, pinned dependency | external package tests; profile suite for contract changes | install, then run both launcher `--help` commands |
| Event journal, schema, retries, retention | [Event Plane service](event-plane/service.md) | `bin/lib/event_plane_service.py` | `SCHEMA_OBJECTS`, `Store` | `tests/event_plane_test.py` | `tests/test-event-plane.sh` |
| Wire operation, client, or admin CLI | [Protocol and clients](event-plane/protocol-and-clients.md) | `EventPlane.dispatch`; client modules; `bin/event-plane-admin` | both `EventPlaneClient` classes | Event Plane parity suites | `tests/test-event-plane.sh` |
| Herdr build, activation, cockpit, pane helper | [Operations](operations/runbook.md#herdr-distribution) | `herdr/downstream/upstream.env`; `bin/qq-herdr-*`; `ghostty/config` | pinned fork contract and CLI response types | downstream and live Herdr suites | `tests/test-herdr-downstream.sh` |
| OpenWiki single-repo refresh or multi-repo dispatch | [Operations](operations/runbook.md#openwiki-automation) | `bin/qq-openwiki-refresh`; `bin/qq-openwiki-dispatch`; `config/openwiki-repositories` | isolated worktree, allowlist, registry, locked merge | both OpenWiki shell suites | run the changed wrapper's shell test |

## Change discipline

Start with the owner and focused test. Preserve the closed role set, pane isolation, exact public schemas, private state, acknowledgement-after-transcript-persistence, serialized admission, literal ticket/note approval, QA's two-look/test-only boundary, QA-pass-only approval, clean-main landing, and operator-only execution. Use `npm test` only when changing `extensions/index.ts`, package test composition, shared role/protocol state, or multiple runtime areas.

## Backlog

No evidence-blocked documentation gaps are known at this revision.
