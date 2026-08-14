---
type: Repository guide
title: QQ OpenWiki Quickstart
description: Short entrypoint to QQ's Pi workflow, Event Plane, delegation and review lifecycle, Herdr and dashboard operations, OpenWiki automation, and focused change routes.
tags: [quickstart, qq, navigation]
---

# QQ OpenWiki quickstart

QQ is a local-first engineering workflow built around Pi. Repository-owned extensions apply execution profiles, expose coordination tools, delegate Backlog tasks into isolated Herdr/Git runners, run independent two-look QA, and leave landing authority with the originating architect. The repository also owns a local Event Plane, Herdr distribution and activation wrappers, dashboard launch boundaries, and scheduled OpenWiki publication.

## Read by intent

- [Architecture overview](architecture/overview.md) — system map, ownership boundaries, durable state, and central flow.
- [Profiles, extensions, and skills](runtime/profiles-and-extensions.md) — activation, model policy, role prompts, every Pi extension, messaging/presence, and shipped Pi skills.
- [Delegation and review](runtime/delegation-and-review.md) — admission, brief approval, runner startup, handoff states, QA, review, landing, and rollback.
- [Event Plane](services/event-plane.md) — Unix-socket protocol, all operations, SQLite schema, delivery guards, retries, retention, clients, and messaging integration.
- [Herdr and dashboard operations](operations/herdr-and-dashboard.md) — immutable Herdr release lifecycle, activation, panes, Ghostty/systemd, and the private dashboard boundary.
- [OpenWiki automation](operations/openwiki-automation.md) — orphan publication for QQ, legacy merges for peer repositories, dispatch, scheduling, and hosted PR workflow.
- [Testing and change guide](development/testing-and-change-guide.md) — focused commands, environmental prerequisites, and safe change recipes.

## Core model

1. `extensions/index.ts` composes the normal Pi runtime. `extensions/qa-result.ts` is intentionally restricted to QA workers.
2. `bin/qq-methodology` activates QQ per repository; `qq.execution-profiles/v1` supplies runner/architect profiles plus scribe and QA bindings.
3. An architect uses `delegate`: admission is serialized, the task becomes `In Progress`, and an operator approves the exact ticket and note.
4. `bin/lib/run.mjs` creates a private `qq.run-handoff/v1`, isolated branch/worktree, and Herdr runner pane.
5. `done` submits a clean descendant commit. QA gets at most two looks and may commit test-only changes.
6. Only the owning architect can approve a QA-passed handoff. Landing is locked, merge-preflighted, and marks Backlog `Done` only after success.
7. Agent messaging uses the Event Plane but acknowledges only after the injected message receipt is visible in the Pi session transcript.

## Change routing

| Intent | Canonical page | Owning entrypoints or symbols | Focused validation |
|---|---|---|---|
| Activate QQ or change profile behavior | [Profiles and extensions](runtime/profiles-and-extensions.md) | `bin/qq-methodology`, `bin/qq-profile`, `validateExecutionPolicy()`, `registerExecutionProfiles()` | `tests/test-methodology.sh`; `node --experimental-strip-types tests/test-execution-profiles.mjs .` |
| Add or change a Pi tool/guard | [Profiles and extensions](runtime/profiles-and-extensions.md) | owning `extensions/*.ts`, `extensions/index.ts` | matching `tests/test-*.mjs` |
| Change presence or agent messaging | [Profiles and extensions](runtime/profiles-and-extensions.md), [Event Plane](services/event-plane.md) | `extensions/agent-messages.ts`, `EventPlaneClient` | `node --experimental-strip-types tests/test-agent-messages.mjs .`; conditional `tests/test-agent-messages-live.sh` |
| Change delegation, QA, or landing | [Delegation and review](runtime/delegation-and-review.md) | `extensions/{board,review-flow,qa-result}.ts`, `bin/lib/{admission,run,review}.mjs` | delegation, brief-gate, and review-flow tests |
| Change Event Plane protocol or schema | [Event Plane](services/event-plane.md) | `EventPlane.dispatch`, `Store`, both clients, admin choices | `tests/test-event-plane.sh` |
| Upgrade or operate Herdr | [Herdr and dashboard](operations/herdr-and-dashboard.md) | `herdr/downstream/upstream.env`, `bin/qq-herdr-*`, `herdr.service` | `tests/test-herdr-downstream.sh`; conditional smoke/live checks |
| Update dashboard pin or profile boundary | [Herdr and dashboard](operations/herdr-and-dashboard.md) | `package.json`, lockfile, `bin/qq-dashboard*`, `qq-profile list --json` | launcher help plus execution-profile test |
| Change OpenWiki registry/publication | [OpenWiki automation](operations/openwiki-automation.md) | `bin/qq-openwiki-*`, registry, timer/service | `tests/test-openwiki-refresh.sh`, `tests/test-openwiki-refresh-legacy.sh`, `tests/test-openwiki-dispatch.sh` |
| Add a source connector | [Profiles and skills](runtime/profiles-and-extensions.md#shipped-skills) | canonical `skills/write-connector/SKILL.md` | connector-owning OpenWiki repository tests |
| Migrate wiki metadata to OKF | [Profiles and skills](runtime/profiles-and-extensions.md#shipped-skills) | `skills/migrate-wiki-to-okf/SKILL.md` | migration inventory and front-matter validation |
| Add or repair Mermaid | [Profiles and skills](runtime/profiles-and-extensions.md#shipped-skills) | `skills/mermaid-diagrams/SKILL.md` | OpenWiki Mermaid fence validation |

Prefer the narrow command in the table before `npm test`; the full suite includes network-dependent Herdr checks and an installed-binary live check. Keep source and tests authoritative, use the Backlog CLI for managed cards, and do not bypass clean-tree, ownership, symlink, operator-approval, or private-file checks.

## Backlog and evidence boundaries

- The private `@hypermemetic-ai/qq-dashboard` implementation is not present. This wiki documents only the pinned package launchers, `QQ_PROFILE_BIN` contract, and preserved state boundary.
- Herdr's Rust implementation is external at the immutable URL/tag/commit in `herdr/downstream/upstream.env`; this wiki documents QQ's distribution and operational contract.
- `backlog/` and `conversation_history/` are supporting planning/history, not current runtime authority. Source and focused tests take precedence.
