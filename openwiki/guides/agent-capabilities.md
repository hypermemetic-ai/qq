---
type: Capability reference
title: Agent Capabilities
description: Compact inventory of shipped QQ agent tools, commands, guards, and operator CLIs with links to their owning documentation.
tags: [agent-guidance, capabilities, pi-extension]
openwiki:
  roles: [repository]
  source_paths: [extensions/index.ts, package.json]
  validation_commands: [npm test]
---

# Agent Capabilities

Use this page to confirm whether a surface is shipped, then follow its canonical page for behavior and change guidance.

| Surface | Kind | Canonical documentation |
|---|---|---|
| `/profile`, `qq-profile` | pane role/profile selection and durable administration | [Execution profiles](../agent-runtime/execution-profiles.md) |
| `qq-methodology` | repository-local activation link | [Execution profiles](../agent-runtime/execution-profiles.md#activation-and-startup) |
| `agent_messages`, `/agent-tasks` | durable messaging and presence | [Agent messaging](../agent-messaging/extension.md) |
| `sketch`, `note`, `delegate`, `done`, `review`, `qa_verdict` | board delegation, run, QA, and landing | [Board/run workflow](../workflows/workshops.md) |
| `operator_stage`, `mark_session_for_scrub` | operator staging and transcript privacy | [Session safety](../agent-runtime/session-safety.md) |
| Backlog and Grok guards; `shift+alt+enter` | automatic safety/recovery behavior | [Session safety](../agent-runtime/session-safety.md) |
| `qq-dashboard`, `qq-dashboard-cookies` | pinned provider usage dashboard and cookie operations | [Dashboard integration](../operations/telemetry.md) |
| `qq-herdr-*` | pinned cockpit build, activation, launch, pane, smoke, and upgrade helpers | [Operations](../operations/runbook.md#herdr-distribution) |
| `qq-openwiki-refresh`, `qq-openwiki-dispatch` | isolated wiki refresh for one or registered repositories | [Operations](../operations/runbook.md#openwiki-automation) |

`extensions/index.ts` is authoritative for loaded Pi extensions; `package.json` owns focused test composition. Agent-facing documentation skills under `skills/` guide wiki/connector work but are not QQ runtime services.
