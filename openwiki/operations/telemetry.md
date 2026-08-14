---
type: Integration guide
title: QQ Dashboard Integration
description: QQ-owned launchers, pinned package boundary, profile-list integration, preserved telemetry state, and upgrade checks for the provider usage dashboard.
tags: [operations, dashboard, provider-usage, packaging]
openwiki:
  roles: [operations, integration]
  change_kinds: [integration, packaging, credentials]
  source_paths: [bin/qq-dashboard, bin/qq-dashboard-cookies, dashboard/README.md, package.json, package-lock.json, bin/qq-profile]
  invariants: [Launchers execute only the pinned package binaries under this checkout's node_modules., The dashboard receives QQ's exact bin/qq-profile path., Dashboard upgrades preserve ~/.local/state/qq/telemetry/.]
  validation_commands: [bin/qq-dashboard --help, bin/qq-dashboard-cookies --help]
---

# QQ Dashboard Integration

QQ no longer implements provider telemetry in this repository. `package.json` and `package-lock.json` pin private package `@hypermemetic-ai/qq-dashboard` to an immutable Git commit, while `bin/qq-dashboard` and `bin/qq-dashboard-cookies` are the shipped QQ commands:

```bash
npm install
bin/qq-dashboard --once
bin/qq-dashboard-cookies refresh
bin/qq-dashboard-cookies status
bin/qq-dashboard-cookies validate
```

The launchers resolve only `node_modules/@hypermemetic-ai/qq-dashboard/bin/...`; they never search `PATH` or a sibling checkout. The dashboard launcher exports `QQ_PROFILE_BIN` as this repository's exact `bin/qq-profile`, so the external package consumes the `qq.profile-list/v1` API owned by [execution profiles](../agent-runtime/execution-profiles.md). Provider rendering, quota parsing, and cookie handling belong to the dashboard package, not QQ.

Existing non-secret caches and the Qwen cookie snapshot remain in `~/.local/state/qq/telemetry/`. Do not migrate or delete that directory during installation or upgrade. Treat cookie contents and provider credentials as secret; the QQ integration exposes commands but does not own their implementation.

## Change and validation

For launcher changes, preserve checkout-relative resolution and the exact `QQ_PROFILE_BIN` injection. For an upgrade, validate a tagged release in the dashboard repository, replace the dependency with that release's exact commit, regenerate `package-lock.json`, then install and smoke the consumer-facing paths from a checkout with no sibling dashboard repository:

```bash
bin/qq-dashboard --help
bin/qq-dashboard-cookies --help
```

QQ has no local dashboard unit suite. Run `node --experimental-strip-types tests/test-execution-profiles.mjs .` when changing `qq.profile-list/v1`; after installing dependencies, also run `bin/qq-dashboard --once` to cross the package boundary. Live cookie `validate` is conditional on dashboard gateway changes and requires operator-managed credentials and network access. See the [operations runbook](runbook.md#focused-validation) for repository-wide test boundaries.
