---
type: Operations guide
title: Provider Telemetry
description: Commands and safety boundaries for the live Codex, Grok, and Qwen usage panel and gated Qwen browser-cookie snapshot.
tags: [operations, telemetry, provider-usage, security]
openwiki:
  roles: [operations, integration]
  change_kinds: [telemetry, credentials]
  source_paths: [bin/qq-telemetry, bin/qq-telemetry-cookies, bin/lib/telemetry-lib.sh]
  test_paths: [tests/test-telemetry.sh]
  invariants: [Credential values are never displayed or persisted in telemetry output., The Qwen cookie snapshot contains only qwencloud.com rows and is mode 0600., Execution-profile policy validation is fail-closed.]
  validation_commands: [tests/test-telemetry.sh]
---

# Provider Telemetry

`bin/qq-telemetry` renders live Codex, Grok, and Qwen usage plus the roles and service bindings from [execution-profile policy](../agent-runtime/execution-profiles.md). Use `bin/qq-telemetry --once` for one frame or run it interactively (`r` refreshes, `q` exits). `TELEMETRY_REFRESH` defaults to 30 seconds; `TELEMETRY_QWEN_GW_CADENCE` defaults to 300 seconds.

The panel reads provider-local authorization only to make provider requests and never includes credential material in output. Non-secret Qwen usage/calibration state and the last frame live under `~/.local/state/qq/telemetry/`. It rejects an unsafe, unavailable, or malformed execution-profile policy rather than showing stale role bindings.

## Qwen cookie gate

`bin/qq-telemetry-cookies` manages the fixed `~/.local/state/qq/telemetry/qwen.cookies` snapshot:

```bash
bin/qq-telemetry-cookies refresh
bin/qq-telemetry-cookies status
bin/qq-telemetry-cookies validate
```

`refresh` locates one Firefox `*.default-release` profile under `HOME`, reads only `qwencloud.com` rows using pinned `browser_cookie3==0.19.1`, prints names/counts but not values, asks for explicit `y`, writes a mode-0600 Netscape snapshot through no-follow path checks, then performs the usage/quota/subscription gateway round trip. `status` exposes only snapshot metadata/domain counts and current reachability. `validate` reports provider usage metadata, never cookies or the short-lived gateway token.

Do not print, copy into logs, or commit auth/cookie files. The cookie path is fixed intentionally; do not add arbitrary input/output paths without equivalent confinement and ownership checks.

## Change and validation

Keep reusable pure format/quota helpers in `bin/lib/telemetry-lib.sh`. When changing execution-policy shape, update telemetry's exact jq validator with the canonical JavaScript validator. Network/provider parsing changes require fixture-style tests before live checks; the current focused suite validates policy and rendering only:

```bash
tests/test-telemetry.sh
```

Live `qq-telemetry-cookies validate` is conditional on changing the Qwen gateway integration and requires an operator-managed snapshot and network access; it is not a default test.