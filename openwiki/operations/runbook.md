---
type: Operations runbook
title: Operations and Validation
description: Practical commands for Event Plane administration, focused validation, Herdr distribution, and multi-repository OpenWiki refresh.
tags: [operations, event-plane, testing, openwiki, herdr]
openwiki:
  roles: [operations, testing]
  source_paths: [bin/event-plane, bin/event-plane-admin, bin/qq-methodology, bin/qq-openwiki-refresh, bin/qq-openwiki-dispatch, bin/qq-openwiki-shell-env.cjs, herdr/README.md, package.json]
  symbols: [spawnWithSafeOpenWikiEnv]
  test_paths: [tests/test-methodology.sh, tests/test-openwiki-refresh.sh, tests/test-openwiki-dispatch.sh, tests/test-herdr-downstream.sh]
  validation_commands: [tests/test-openwiki-refresh.sh, tests/test-openwiki-dispatch.sh, npm test]
---

# Operations and Validation

## Event Plane

Start with `bin/event-plane serve`. State defaults to `$XDG_STATE_HOME/qq/event-plane` or `$HOME/.local/state/qq/event-plane`. For isolation, pass an account-owned mode-0700 `--state-dir`; never edit SQLite directly, relax permissions, add symlinks, or proxy the socket. Filesystem access is authority under the [protocol trust model](../event-plane/protocol-and-clients.md#trust-and-authorization-boundary).

```bash
bin/event-plane-admin inspect '{"view":"health"}'
bin/event-plane-admin inspect '{"view":"integrity"}'
bin/event-plane-admin inspect '{"view":"obligations","status":"blocked"}'
bin/event-plane-admin backup '{"path":"/absolute/private/new-snapshot.sqlite3"}'
```

Backups require a new absolute path beneath a safe mode-0700 parent. There is no restore API. For shutdown, copy the current `instance_id` from health immediately before `bin/event-plane-admin shutdown '{"expected_instance_id":"plane_...","authorization":"operator"}'`; the ID fences replacement, while `authorization` records intent rather than authenticating.

## Focused validation

| Change | Minimal check | Conditional broader check |
|---|---|---|
| Repository linking | `tests/test-methodology.sh` | profile test when activation semantics change |
| Event Plane | `tests/test-event-plane.sh` | `npm test` when messaging/public composition changes |
| Profiles and prompts | `node --experimental-strip-types tests/test-execution-profiles.mjs .` | installed Dashboard smoke for list-contract changes; `npm test` for role events/composition |
| Agent messaging | `node --experimental-strip-types tests/test-agent-messages.mjs .` | live suite for lifecycle/delivery |
| One safety extension | matching `tests/test-<name>.mjs` | `npm test` for registration/shared state |
| Board admission/delegation | `node --experimental-strip-types tests/test-delegation.mjs .` plus `node tests/test-brief-gate.mjs .` | `npm test` when review/profile wiring changes |
| QA, review, landing | `node --experimental-strip-types tests/test-review-flow.mjs .` | `npm test` for cross-workflow changes |
| Dashboard launchers or pin | install, then `bin/qq-dashboard --help` and `bin/qq-dashboard-cookies --help` | package tests and live provider calls only when changing the external integration |
| Herdr packaging/config | `tests/test-herdr-downstream.sh` | `tests/test-herdr-live.sh` only for live integration |
| OpenWiki single repo | `tests/test-openwiki-refresh.sh` | `npm test` only for suite composition |
| OpenWiki registry/dispatch | `tests/test-openwiki-dispatch.sh` | refresh test when wrapper contract changes |
| Multiple runtime areas | `npm test` | — |

`package.json` owns full-suite order. Event Plane test-only clock/retention variables must never be used in production.

## Herdr distribution

QQ's [board/run workflow](../workflows/workshops.md) and operator staging depend on the pinned Herdr fork described by `herdr/downstream/upstream.env`; the Rust source lives in a separately linked Herdr repository. `qq-herdr-build build|install` verifies the immutable tag/commit, tests and builds it, and runs `bin/qq-herdr-smoke`. `qq-herdr-upgrade` discovers a new immutable release but does not repin automatically. `systemd/user/herdr.service` runs the installed binary.

`qq-herdr-activate` performs the live handoff from Homebrew 0.7.5 and refuses success unless workspaces, tabs, panes, and shell processes survive. `qq-herdr-launch` opens the fullscreen Ghostty cockpit with a literal `herdr` title and clears inherited pane context; `qq-herdr-pane-add` is QQ's right-split primitive. Treat activate/restart as operator-visible. Validate packaging/config with `tests/test-herdr-downstream.sh`; run `tests/test-herdr-live.sh` only when the live Pi integration contract changes.

## OpenWiki automation

`systemd/user/qq-openwiki.timer` triggers at local 03:00 and 13:00 and runs `qq-openwiki.service`. The service invokes `bin/qq-openwiki-dispatch`, which reads `config/openwiki-repositories`, resolves each repository, and runs at most `QQ_OPENWIKI_MAX_PARALLEL` refreshes (default 3). One failure does not stop already scheduled repositories, but the dispatcher exits nonzero after reporting all failures.

For each repository, `bin/qq-openwiki-refresh` requires clean `main`, takes a per-repository `qq-openwiki.lock`, and generates in `$XDG_STATE_HOME/qq/openwiki/<repo-key>/worktree`. Its Node preload restores only selected safe environment keys for explicitly empty-environment shell spawns. The wrapper restores prohibited root files, rejects changes outside `openwiki/`, commits a real wiki diff, then takes the same common-Git-directory `qq-land.lock` as [run landing](../workflows/workshops.md), rechecks clean main and mergeability, and non-fast-forward merges. No wiki diff is a successful no-op.

```bash
tests/test-openwiki-refresh.sh
tests/test-openwiki-dispatch.sh
systemd-analyze --user verify systemd/user/qq-openwiki.service systemd/user/qq-openwiki.timer
```

The refresh test covers environment confinement, output allowlisting, merge, cleanup, dirty-main refusal, and no-op behavior. The dispatch test covers registry parsing, repository-key isolation, parallel invocation, prefixed output, and aggregate failure.

## Repository workflow

Use `qq-methodology link|unlink|inspect` to control QQ activation for another Git repository; see [execution profiles](../agent-runtime/execution-profiles.md#activation-and-startup). Board tools use the installed `backlog.md` CLI, while the [Backlog guard](../agent-runtime/session-safety.md) blocks direct Pi writes into `backlog/`. Provider operations are supplied through the pinned [QQ Dashboard integration](telemetry.md).
