---
type: Operations runbook
title: Operations and Validation
description: Practical commands for Event Plane administration, focused repository validation, Backlog discipline, and local OpenWiki refresh.
tags: [operations, event-plane, testing, openwiki]
openwiki:
  roles: [operations, testing]
  source_paths: [bin/event-plane, bin/event-plane-admin, package.json, systemd/user/qq-openwiki.service, systemd/user/qq-openwiki.timer]
  validation_commands: [npm test]
---

# Operations and Validation

## Event Plane

Start in the foreground with `bin/event-plane serve`. State defaults to `$XDG_STATE_HOME/qq/event-plane` or `$HOME/.local/state/qq/event-plane`. For isolated work, pass an account-owned mode-0700 `--state-dir`; never edit SQLite directly, relax permissions, add symlinks, or proxy the socket. The [protocol trust model](../event-plane/protocol-and-clients.md#trust-and-authorization-boundary) treats filesystem access as authority.

Inspect before acting:

```bash
bin/event-plane-admin inspect '{"view":"health"}'
bin/event-plane-admin inspect '{"view":"integrity"}'
bin/event-plane-admin inspect '{"view":"obligations","status":"blocked"}'
```

Back up only to a new absolute name outside state, beneath a safe chain and mode-0700 immediate parent:

```bash
bin/event-plane-admin backup '{"path":"/absolute/private/new-snapshot.sqlite3"}'
```

There is no restore API. For shutdown, copy `instance_id` from health immediately before calling:

```bash
bin/event-plane-admin shutdown '{"expected_instance_id":"plane_...","authorization":"operator"}'
```

The instance ID fences replacement; `authorization` records intent but is not authentication.

## Validation

| Change | Minimal check | Conditional broader check |
|---|---|---|
| Event Plane service, client, protocol, launcher | `tests/test-event-plane.sh` | `npm test` when messaging/public composition also changes |
| Execution profiles, roles, prompt composition | `node --experimental-strip-types tests/test-execution-profiles.mjs .` | `npm test` for role-event or composition changes |
| Agent helper/schema/presence | `node --experimental-strip-types tests/test-agent-messages.mjs .` | `tests/test-agent-messages-live.sh` for lifecycle/delivery |
| One Pi extension | matching `node --experimental-strip-types tests/test-<name>.mjs .` | `npm test` when registration/shared state changes |
| Telemetry/profile display | `tests/test-telemetry.sh` | manual provider calls only for operator diagnosis |
| Test composition or multiple runtime areas | `npm test` | — |

`package.json` is the authoritative full-suite order. The Event Plane suite uses isolated state and a test-only clock; never set `QQ_EVENT_PLANE_TESTING` or retention overrides in production.

## OpenWiki automation

`systemd/user/qq-openwiki.timer` triggers at local 03:00 and 13:00, is not persistent, and runs `qq-openwiki.service`. The service executes `openwiki code --update --print "Keep this wiki short and practical."` in `%h/projects/qq` with a six-hour timeout and `OPENWIKI_PROVIDER=openai-chatgpt`.

Every service exit removes local `CLAUDE.md` and `.github/workflows/openwiki-update.yml`, tries to remove empty workflow directories, and rewrites the OpenWiki sentence in `AGENTS.md` to name the local timer. This cleanup runs after failures too. Validate unit edits with:

```bash
systemd-analyze --user verify systemd/user/qq-openwiki.service systemd/user/qq-openwiki.timer
```

## Repository workflow

[Workshop tools](../workflows/workshops.md) use the installed `backlog.md` CLI. The [Backlog guard](../agent-runtime/session-safety.md) blocks Pi `write` and `edit` calls into `backlog/`, including its resolved symlink target; use Backlog commands instead. For provider usage and credential-safe Qwen setup, see [Telemetry](telemetry.md).