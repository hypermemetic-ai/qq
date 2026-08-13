---
type: Operations runbook
title: Operations and Validation
description: Practical commands for Event Plane administration, focused repository validation, Backlog discipline, and local OpenWiki refresh.
tags: [operations, event-plane, testing, openwiki]
openwiki:
  roles: [operations, testing]
  source_paths: [bin/event-plane, bin/event-plane-admin, bin/lib/task-prefix.mjs, bin/qq-migrate-task-prefix.mjs, bin/qq-openwiki-refresh, package.json, systemd/user/qq-openwiki.service, systemd/user/qq-openwiki.timer]
  symbols: [migrateTaskPrefix]
  test_paths: [tests/test-task-prefix.mjs, tests/test-openwiki-refresh.sh]
  validation_commands: [tests/test-openwiki-refresh.sh, npm test]
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
| Workshop delegation or brief gate | `node --experimental-strip-types tests/test-workshop.mjs .` and `node tests/test-brief-gate.mjs .` | `npm test` when review/composition also changes |
| QA, review, or landing | `node --experimental-strip-types tests/test-review-flow.mjs .` | `npm test` when workshop/profile wiring also changes |
| Task-prefix migrator | `node --experimental-strip-types tests/test-task-prefix.mjs .` | no broader check unless Backlog/workshop schemas change |
| Telemetry/profile display | `tests/test-telemetry.sh` | manual provider calls only for operator diagnosis |
| OpenWiki refresh wrapper or systemd units | `tests/test-openwiki-refresh.sh` | `npm test` only when full-suite composition also changes |
| Test composition or multiple runtime areas | `npm test` | — |

`package.json` is the authoritative full-suite order. The Event Plane suite uses isolated state and a test-only clock; never set `QQ_EVENT_PLANE_TESTING` or retention overrides in production.

## OpenWiki automation

`systemd/user/qq-openwiki.timer` triggers at local 03:00 and 13:00, is not persistent, and runs `qq-openwiki.service`. The service uses a private umask, an explicit tool `PATH`, a six-hour timeout, and `OPENWIKI_PROVIDER=openai-chatgpt`; it delegates the refresh to `bin/qq-openwiki-refresh` rather than letting OpenWiki edit the main checkout.

The wrapper requires a clean `main`, takes a non-blocking `qq-openwiki.lock`, and generates on a disposable `qq/openwiki-refresh` branch and worktree. After generation it restores `AGENTS.md`, removes generated `CLAUDE.md` and the OpenWiki GitHub workflow, and rejects every changed path outside `openwiki/`. If there is a wiki diff, it commits it, takes the same `qq-land.lock` used by [workshop landing](../workflows/workshops.md), rechecks branch and cleanliness, verifies a clean merge, and non-fast-forward merges into `main`. Its exit trap removes the worktree and refresh branch; no wiki diff is a successful no-op.

Defaults can be overridden with the `QQ_OPENWIKI_*` variables declared at the top of `bin/qq-openwiki-refresh`; notably the worktree defaults beneath `$XDG_STATE_HOME/qq/openwiki`. Validate wrapper and unit behavior with:

```bash
tests/test-openwiki-refresh.sh
systemd-analyze --user verify systemd/user/qq-openwiki.service systemd/user/qq-openwiki.timer
```

The shell test covers successful merge and cleanup, no-op behavior, dirty-main refusal, non-`openwiki/` output refusal, and service wiring. It is also the final check in `npm test`.

## Repository workflow

[Workshop tools](../workflows/workshops.md) use the installed `backlog.md` CLI. The [Backlog guard](../agent-runtime/session-safety.md) blocks Pi `write` and `edit` calls into `backlog/`, including its resolved symlink target; use Backlog commands instead. For provider usage and credential-safe Qwen setup, see [Telemetry](telemetry.md).

### Task-prefix migration

`bin/qq-migrate-task-prefix.mjs [repo]` is a one-time, destructive migrator from `TASK-*` to `T-*`. It updates task front matter and filenames across active, draft, completed, and archived tasks; changes `backlog/config.yml`; and atomically updates matching workshop `handoff.json` task IDs. It does not rewrite arbitrary prose references. Commit or back up the board first, run `node --experimental-strip-types tests/test-task-prefix.mjs .` after implementation changes, and inspect the JSON report plus `git diff` after an actual migration.