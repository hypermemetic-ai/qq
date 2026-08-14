---
type: Operations guide
title: Provider Telemetry
description: Live Codex, Grok, and Qwen usage display, execution-profile integration, and the credential-safe Qwen browser-cookie gate.
tags: [operations, telemetry, provider-usage, security]
openwiki:
  roles: [operations, integration]
  change_kinds: [telemetry, credentials]
  source_paths: [bin/qq-telemetry, bin/qq-telemetry-cookies, bin/lib/telemetry-lib.sh, bin/qq-profile]
  test_paths: [tests/test-telemetry.sh]
  invariants: [Credential values are never displayed or persisted in telemetry output., Provider meters continue when the execution-profile list is unavailable., The Qwen cookie snapshot contains only qwencloud.com rows and is mode 0600.]
  validation_commands: [tests/test-telemetry.sh]
---

# Provider Telemetry

`bin/qq-telemetry` renders Codex, Grok, and Qwen usage plus roles and service bindings from `bin/qq-profile list --json`; that public contract is owned by [execution profiles](../agent-runtime/execution-profiles.md). Use `bin/qq-telemetry --once` for one frame or run it interactively (`r` refreshes, `q` exits). Refresh defaults to 30 seconds and the Qwen gateway cadence to 300 seconds.

The panel reads provider-local authorization only for provider requests and never renders credentials. Before an xAI request it asks `pi auth check --provider xai` to refresh an expired stored OAuth credential. If `qq-profile` fails or returns malformed JSON, provider meters continue and the profiles section says `unavailable` rather than duplicating policy validation or aborting the panel.

Non-secret Qwen calibration and the last frame live under `~/.local/state/qq/telemetry/`. Qwen zero usage without reset timestamps is valid immediately after renewal and renders `window not started`; an old quota-wall event cannot mark a newer provider observation `EXHAUSTED`.

## Qwen cookie gate

`bin/qq-telemetry-cookies` manages fixed path `~/.local/state/qq/telemetry/qwen.cookies`:

```bash
bin/qq-telemetry-cookies refresh
bin/qq-telemetry-cookies status
bin/qq-telemetry-cookies validate
```

`refresh` locates one Firefox `*.default-release` profile, reads only `qwencloud.com` rows using pinned `browser_cookie3==0.19.1`, prints names/counts but not values, asks for explicit `y`, writes a no-follow mode-0600 Netscape snapshot, then exercises usage/quota/subscription. `status` and `validate` expose metadata, never cookies or the short-lived gateway token. Do not log or commit auth/cookie files.

## Change and validation

Keep pure format/quota helpers in `bin/lib/telemetry-lib.sh`. Profile display changes must preserve `qq.profile-list/v1` validation while keeping meter failures independent. Provider parsing needs fixture-style focused tests before any live check.

```bash
tests/test-telemetry.sh
```

Live `qq-telemetry-cookies validate` is conditional on Qwen gateway changes and requires operator-managed credentials and network access.
