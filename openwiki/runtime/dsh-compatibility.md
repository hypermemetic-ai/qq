---
type: Compatibility reference
title: DSH pin and legacy cutover boundary
description: Current DSH toolchain ownership and the remaining boundary between the daily qq host and legacy Pi/Herdr delegation.
tags: [dsh, compatibility, migration]
openwiki:
  roles: [integration, repository]
  change_kinds: [host-compatibility, migration]
  source_paths: [dsh/pins.json, dsh/package.json, dsh/qq-dsh-model-compat.mjs, bin/qq]
  test_paths: [tests/test-qq-host.mjs, tests/test-native-qa-proof.mjs]
  validation_commands: [node tests/test-qq-host.mjs .]
---

# DSH pin and legacy cutover boundary

The former `compat/pi2dsh/` harness and `dsh-native-launch/` adapter were removed. `dsh/` is now only the first-class locked toolchain for the [daily qq host](dsh-console.md): `pins.json` is the pin source of truth, and `qq-dsh-model-compat.mjs` supplies compatibility metadata for `qwen-token-plan/deepseek-v4-pro-0813`.

Do not follow stale paths such as `compat/pi2dsh/run.sh`, `tests/test-pi2dsh-compat.mjs`, or `bin/qq-dsh-workbench`. Host compatibility is exercised through `tests/test-qq-host.mjs`, `tests/test-qq-host-live.sh`, and the plugin suites listed in [validation routing](../testing/validation.md).

## What has and has not moved

The daily host now owns DSH sessions, projects, UI, in-process relay, selectable workflows, models, tasks, and dictation. It does **not** implement the legacy Backlog delegation/review protocol. [`delegate` and `done`](../workflow/delegation-and-review.md) still live in Pi extensions and protected worker scripts. The remaining `runtime: dsh` handoff validation in `bin/lib/review.mjs` is migration-era code, not proof that the removed native launch harness remains available.

The old “native DSH review is not wired” statement is no longer the useful boundary. Instead:

- normal daily DSH workflows are the independent architect/iterate/find methods documented in [DSH workflows](../workflow/dsh-workflows.md);
- legacy Pi/Herdr delegation routes a completed packet either directly to landing or through isolated QA;
- DSH's in-process [`qq-relay`](../event-plane/service.md#dsh-in-process-relay) is not the external durable relay used by Pi run outcomes.

## Change and validation

| Change | Source | Narrow check |
|---|---|---|
| DSH package or pin | `dsh/package.json`, `dsh/package-lock.json`, `dsh/pins.json` | `node tests/test-qq-host.mjs .`, then conditional `tests/test-qq-host-live.sh` |
| Model compatibility preload | `dsh/qq-dsh-model-compat.mjs`, `bin/qq` | `node tests/test-qq-models.mjs` and conditional real-host smoke |
| Legacy handoff runtime branch | `bin/lib/review.mjs`, `extensions/review-flow.ts` | `tests/test-qq-relay.sh` |

A pin or DSH API change crosses a shipped-host boundary: unit source checks are insufficient until `bin/qq` boots the linked package profile. Networked install/live checks are conditional; do not run the removed compatibility scripts.