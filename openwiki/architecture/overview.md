---
type: Architecture overview
title: QQ Architecture
description: Runtime map of QQ's composed Pi extensions, board delegation and two-look run review, provider operations, Herdr cockpit, and durable Event Plane.
tags: [architecture, pi-extension, event-plane, runs]
openwiki:
  roles: [architecture, repository]
  source_paths: [extensions/index.ts, package.json]
  symbols: [registerQQ]
  validation_commands: [npm test]
---

# QQ Architecture

QQ combines a Pi runtime, asynchronous [board/run workflow](../workflows/workshops.md), a pinned [provider Dashboard integration](../operations/telemetry.md), [Herdr operations](../operations/runbook.md#herdr-distribution), and a durable [Event Plane](../event-plane/service.md). `extensions/index.ts:registerQQ` is the Pi composition root: [execution profiles](../agent-runtime/execution-profiles.md) register first, followed by messaging, independent safety guards, board tools, and review.

## Runtime map

```mermaid
flowchart TD
    Pi["Pi session"] --> Root["extensions/index.ts registerQQ"]
    Root --> Profiles["Roles and pane profiles"]
    Root --> Messaging["Agent messaging"]
    Root --> Safety["Session safety"]
    Root --> Board["Board and review tools"]
    Profiles --> Messaging
    Profiles --> Board
    Messaging --> Plane["Event Plane"]
    Plane --> Db["Private SQLite journal"]
    Board --> Backlog["Backlog CLI"]
    Board --> Admission["Serialized admission vet"]
    Admission --> Run["Private run handoff"]
    Run --> Worktree["Git worktree"]
    Run --> Herdr["Herdr runner and QA pane"]
    Run --> Landing["QA-passed locked landing"]
    Dashboard["Pinned QQ Dashboard package"] --> ProfileCli["qq-profile list JSON"]
    Launcher["bin/qq-dashboard"] --> Dashboard
    Profiles --> ProfileCli
```

*Profile role events coordinate extensions; Event Plane owns message custody, while an admitted ticket becomes a private run spanning Backlog, Git, and Herdr.*

## Ownership

| Area | Entrypoint | Owns |
|---|---|---|
| Pi composition | `extensions/index.ts` | Extension registration order |
| Roles/profiles | `extensions/execution-profiles.ts`, `bin/qq-profile`, `bin/qq-methodology` | Activation, pane selection, prompts, policy and profile-list API |
| Messaging | `extensions/agent-messages.ts` | Presence, discovery, injection, receipt-aware acknowledgement |
| Session safety | `extensions/operator-stage.ts` and sibling guards | Operator boundary, transcript scrub, managed-file and Grok guards |
| Board and run | `extensions/board.ts`, `bin/lib/admission.mjs`, `bin/lib/run.mjs` | Tickets, admission, operator gate, worktree and runner startup |
| Review/landing | `extensions/review-flow.ts`, `bin/lib/review.mjs` | `done`, two-look QA, architect choice, serialized merge |
| Event Plane | `bin/event-plane` -> `event_plane_service.py:main` | Journal, obligations, retries, leases, retention |
| Operations | `bin/qq-dashboard*`, `bin/qq-herdr-*`, `bin/qq-openwiki-*` | Pinned Dashboard launch, cockpit distribution, wiki automation |

## Cross-system invariants

- `runner` and `architect` are the only roles. A pane selection emits `qq:role-selected`; messaging and board/review consume the selected role.
- Event Plane acknowledgement follows observable Pi transcript persistence, not message injection.
- Delegation is admitted against active tickets and live worktrees, then requires operator approval of the literal ticket and generated note.
- QA has at most two looks and may own tests only. Landing requires a QA pass, architect approval, original base branch, clean main and run worktrees, and the shared repository lock.
- Private ownership and modes protect Event Plane, profile, run, scrub, Dashboard state, and cookie state.

Use the linked component page for symbols and focused checks. Run `npm test` only for composition-root, shared-role, packaging, or multi-area changes.
