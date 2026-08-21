---
type: Runtime integration guide
title: Model connectors and authentication
description: qq-models connector routes, OAuth storage, Grok Responses tool transport, prompt-cache affinity and replay, automatic retries, and focused validation.
tags: [models, oauth, grok, codex]
openwiki:
  roles: [runtime, integration]
  change_kinds: [model-adapter, authentication, retry-lifecycle]
  source_paths: [qq-models/src/plugin.mjs, qq-models/src/grok.mjs, qq-models/src/oauth.mjs, qq-models/src/grok-auto-continue.mjs]
  symbols: [createGrokAdapter, createCodexAdapter, createLoginService, attachGrokAutoContinue]
  test_paths: [tests/test-qq-models.mjs, tests/test-grok-auto-continue.mjs, tests/test-qq-host-real.sh]
  validation_commands: [node tests/test-qq-models.mjs]
---

# Model connectors and authentication

`qq-models` is an optional daily-host Cordis plugin. It registers model adapters and `/login`/`/logout` when the corresponding DSH services appear; missing credentials fail a stream, not host startup, so login can complete without restarting.

| Connector | Provider route | Authentication | Initial model |
|---|---|---|---|
| Grok | `xai-auth` | OAuth device flow | `grok-4.6` |
| Codex | `openai-codex` | OAuth device flow | `gpt-5.6-sol` |
| Qwen | `qwen-token-plan` | host API key | `deepseek-v4-pro-0813` |

OAuth files are private atomic files under `DSH_HOME`: `.qq-grok-auth.json` and `.qq-codex-auth.json`. Refresh is locked per file. `/logout` removes only this host's connector file; Qwen logout does not remove a host key. `bin/qq-login` exposes the same named flows when no host is listening.

## Grok transport and recovery

`createGrokAdapter` sends DSH tools as OpenAI Responses function tools under their original names and round-trips tool history as `function_call` and `function_call_output`; DSH still executes tools. For cache affinity it sets `prompt_cache_key` from the existing DSH `sessionId`, requests `reasoning.encrypted_content`, and returns that opaque content in the finish chunk's same-provider replay envelope. Later Grok requests replay the legal reasoning item byte-stably; foreign or old messages without an `xai-auth` envelope do not. `normalizeToolParameters` accepts either DSH's flat parameter map or a complete object-root JSON Schema. Flat `required: true` flags become the root `required` list; complete schemas are cloned without semantic mutation. Invalid array/non-object shapes fail locally as `INVALID_TOOL_SCHEMA`, before transport and retries. Keep message input items in the supported `input_text` shape and preserve the proxy-legal client headers in `oauth.mjs`.

`qq-models/src/grok-auto-continue.mjs` watches Grok 4.6 failures, retries only classified transient Responses failures with bounded jitter/backoff, and appends a recovery message that omits tainted partial thinking while preserving safe visible/tool history. Disposal aborts pending retries. The separate Pi extension in [`safety and context`](../extensions/safety-and-context.md) provides analogous recovery for the legacy runtime; the implementations are not a shared service.

## Change surface

A connector change is complete only when:

1. connector metadata and route lookup remain consistent in `connectors.mjs`;
2. the adapter is registered through `qq-models/src/plugin.mjs` and disposed through Cordis lifecycle;
3. login/store/OAuth handling writes no secrets outside the private store;
4. `bin/qq` accepts the selected route and real consumers can resolve it;
5. unit tests cover request and tool-schema translation, invalid-schema rejection, refresh, redaction, cache-key identity, encrypted-reasoning replay, and failure classification.

Use `node tests/test-qq-models.mjs` for adapter/login work and `node --experimental-strip-types tests/test-grok-auto-continue.mjs .` for retry lifecycle. Run credential-gated `tests/test-qq-host-real.sh` only when actual provider transport, headers, OAuth, or model routing changes; do not use it for command text or UI-only changes. See the [daily host](dsh-console.md) for launcher selection.