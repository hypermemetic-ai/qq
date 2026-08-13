---
type: Capability reference
title: Agent Capabilities
description: Compact inventory of shipped QQ tools, commands, shortcuts, and the repository skills that guide documentation agents.
tags: [agent-guidance, capabilities, pi-extension]
openwiki:
  roles: [repository]
  source_paths: [extensions/index.ts, skills]
  validation_commands: [npm test]
---

# Agent Capabilities

Use this page to confirm whether a named surface is implemented, then follow its canonical page for behavior and change guidance.

## Shipped Pi surfaces

| Surface | Kind | Canonical documentation |
|---|---|---|
| `/profile` | session role/profile command | [Execution profiles](../agent-runtime/execution-profiles.md) |
| `agent_messages`, `/agent-tasks` | durable messaging tool and task-presence command | [Agent messaging](../agent-messaging/extension.md) |
| `sketch`, `note`, `delegate`, `review` | architect-only board, delegation, and review tools | [Workshop workflow](../workflows/workshops.md) |
| `done` | delegated-runner submission to QA | [Workshop workflow](../workflows/workshops.md) |
| `qa_verdict` | isolated QA-only structured result tool | [Workshop workflow](../workflows/workshops.md) |
| `operator_stage` | unexecuted operator command staging | [Session safety](../agent-runtime/session-safety.md) |
| `mark_session_for_scrub`, `mark_session_dictation_private` | transcript and dictation privacy tools | [Session safety](../agent-runtime/session-safety.md) |
| Backlog write guard, Grok paraphrase guard | automatic Pi event guards | [Session safety](../agent-runtime/session-safety.md) |
| `shift+alt+enter` | idle-only continue shortcut | [Session safety](../agent-runtime/session-safety.md) |
| `qq-profile`, `qq-telemetry`, `qq-telemetry-cookies` | operator CLIs | [Execution profiles](../agent-runtime/execution-profiles.md), [Telemetry](../operations/telemetry.md) |
| `qq-migrate-task-prefix.mjs` | one-time `TASK-*` to `T-*` Backlog and handoff migrator | [Operations](../operations/runbook.md#task-prefix-migration) |

`extensions/index.ts` is authoritative for loaded Pi extensions. `package.json` is authoritative for their focused test composition. Do not infer implementation from deleted `TOOLS.md` or old `docs/` files.

## Agent documentation skills

The repository's `skills/*/SKILL.md` files are instructions for coding/documentation agents, not QQ runtime services: `mermaid-diagrams` governs source-backed diagrams, `migrate-wiki-to-okf` governs wiki metadata migration, and `write-connector` describes work in the upstream OpenWiki codebase rather than a connector implemented here.