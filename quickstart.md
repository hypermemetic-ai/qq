---
type: Repository guide
title: QQ OpenWiki Quickstart
description: Short entrypoint to QQ's Pi workflow, external Backlog setup, delegation outcomes, Event Plane, Herdr q mode operations, OpenWiki automation, and focused change routes.
tags: [quickstart, qq, navigation]
---

# QQ OpenWiki quickstart

QQ is a local-first engineering workflow built around Pi. Repository extensions apply execution profiles, coordinate externally stored Backlog tasks, delegate work into isolated Herdr/Git runners, run two-look QA, and leave publication authority with the originating architect. The repository also owns the Event Plane, Herdr activation and q mode integration, dashboard launch boundaries, and scheduled OpenWiki publication.

## Read by intent

- [Architecture overview](architecture/overview.md) — system boundaries, state, and central flow.
- [Profiles, extensions, and skills](runtime/profiles-and-extensions.md) — repository linking, model policy, Pi extensions, messaging, and skills.
- [Delegation and review](runtime/delegation-and-review.md) — admission, runner handshake, QA, durable outcomes, upstream landing, and rollback.
- [Event Plane](services/event-plane.md) — Unix-socket protocol, SQLite state, delivery guards, retries, and clients.
- [Herdr, q mode, and dashboard operations](operations/herdr-and-dashboard.md) — owner-built Herdr, coordinated activation, dictation controls, and dashboard boundary.
- [OpenWiki automation](operations/openwiki-automation.md) — orphan publication, legacy merges, dispatch, scheduling, and hosted PR workflow.
- [Testing and change guide](development/testing-and-change-guide.md) — focused checks and safe change recipes.

## Core model

1. `extensions/index.ts` composes normal Pi sessions; `extensions/qa-result.ts` remains QA-worker-only.
2. `bin/qq-methodology link` activates QQ, provisions required Pi defaults/trust, and links the checkout to an external Backlog store.
3. `delegate` serializes admission, moves the task to `In Progress`, obtains operator approval, and starts an isolated runner only after its prompt reaches `working`.
4. `done` submits a clean descendant commit. QA gets at most two looks and may commit test-only changes; final failure returns the task to `To Do`.
5. The owning architect may approve a QA-passed proposal. Landing merges when needed, pushes the target branch upstream, cleans up, then marks Backlog `Done`.
6. Agent messages and run outcomes use the Event Plane and are acknowledged only after their injected receipt is visible in the Pi transcript.

## Change routing

| Change area or intent | Relevant wiki page | Exact source entry points | Important symbols or types | Focused tests | Minimal validation command |
|---|---|---|---|---|---|
| Link a repository or change profiles | [Profiles and extensions](runtime/profiles-and-extensions.md) | `bin/qq-methodology`, `bin/qq-profile`, `extensions/execution-profiles.ts` | `isActivatedRepository()`, `validateExecutionPolicy()`, `registerExecutionProfiles()` | `tests/test-methodology.sh`, `tests/test-execution-profiles.mjs` | `tests/test-methodology.sh` |
| Add or change a Pi tool/guard | [Profiles and extensions](runtime/profiles-and-extensions.md) | owning `extensions/*.ts`, `extensions/index.ts` | owning `registerX()` | matching `tests/test-*.mjs` | matching focused test |
| Change agent messaging | [Profiles and extensions](runtime/profiles-and-extensions.md), [Event Plane](services/event-plane.md) | `extensions/agent-messages.ts`, `bin/lib/event-plane-client.ts` | `receiveOne()`, `EventPlaneClient` | isolated and live agent-message tests | `node --experimental-strip-types tests/test-agent-messages.mjs .` |
| Change delegation, QA, outcomes, or landing | [Delegation and review](runtime/delegation-and-review.md) | `extensions/{board,review-flow,qa-result}.ts`, `bin/lib/{admission,run,review,run-events}.mjs` | `startRun()`, `conductReview()`, `landHandoff()`, `sendRunEvent()` | delegation, brief-gate, review-flow tests | `node --experimental-strip-types tests/test-review-flow.mjs .` |
| Change Event Plane protocol/schema | [Event Plane](services/event-plane.md) | `bin/lib/event_plane_service.py`, both clients | `EventPlane.dispatch`, `Store` | `tests/test-event-plane.sh` | `tests/test-event-plane.sh` |
| Change Herdr, q mode, or activation | [Herdr and dashboard](operations/herdr-and-dashboard.md) | `herdr/config.toml`, `plugins/q-mode/`, `bin/qq-herdr-activate`, `bin/qq-q-mode-uat` | `qq.q-mode`, `check_readiness()` | q mode and downstream tests | `tests/test-q-mode.sh` |
| Change dashboard package boundary | [Herdr and dashboard](operations/herdr-and-dashboard.md) | `package.json`, `package-lock.json`, `bin/qq-dashboard*` | `QQ_PROFILE_BIN`, `qq-profile list --json` | execution-profile test plus launcher help | `bin/qq-dashboard --help` |
| Change OpenWiki publication | [OpenWiki automation](operations/openwiki-automation.md) | `bin/qq-openwiki-*`, `config/openwiki-repositories` | orphan publisher, legacy refresher, dispatcher | three OpenWiki tests | `tests/test-openwiki-refresh.sh` |
| Add/change a Pi skill | [Profiles and skills](runtime/profiles-and-extensions.md#shipped-skills) | canonical `skills/<name>/SKILL.md` | skill front matter and referenced helpers | owner-specific checks | inspect metadata, then use a fresh matching-task session |

Prefer the narrow check before `npm test`; the aggregate suite includes network-capable owner-repository checks and an installed-Herdr live smoke.

## Evidence boundaries

- The private dashboard implementation is absent; only its pinned launcher and `QQ_PROFILE_BIN` contract are documented.
- Herdr and qq-dictation implementation/build logic is external. QQ records branch/capability-floor integration contracts, not product commit pins.
- The checkout `backlog` path is runtime planning state linked outside Git after methodology setup; `conversation_history/` is supporting history. Source and focused tests remain authoritative.
