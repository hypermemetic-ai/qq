# qq DSH coding workbench

This is qq's smallest daily-usable coding workbench over the pinned DSH/Cordis host. It is **not** stock DSH Web, a Herdr/Pi replacement, a second session implementation, or an orchestration-parity system. Pi/Herdr remains the fallback.

## Sequential handoff contract

The home browser, laptop, and phone use the home-PC host one after another. Each later page selects the same canonical `session-<UUID>` and reconstructs its ordered transcript from DSH persistence. “Same session” does not mean shared pixels, drafts, focus, scroll, dialogs, or browser-local history.

One active page at a time is an operator convention, not an enforcement protocol. This plugin has no observer role, controller lease, presence table, take-control flow, client identity cookie, concurrent-client rejection, or cross-client fanout. Each SSE request independently reads its selected DSH event log; it never coordinates clients.

## DSH authority and controls

The bundle composes `@deepseek-ai/dsh-base@0.1.0-rc.6`, one loopback-only `@deepseek-ai/dsh-host-webserver`, and this plugin. It does not compose stock `dsh-web-app`, the Host API proxy, WebSockets, a client-side router, or a second database.

DSH owns every authoritative value:

- the server lists only DSH persistence headers and live DSH agents;
- canonical `/qq/session/<session-UUID>` navigation can resume an existing DSH identity but cannot invent an arbitrary one;
- transcript rows are rendered from ordered append-origin `user/message`, `assistant/message`, and `tool/result` events;
- status comes from the live DSH Agent plus durable turn boundaries;
- Send invokes `Agent.followup()`, waits for DSH quiescence, and flushes the DSH Session;
- Interrupt invokes `Agent.cancel({ kind: "user" })`, waits for cancellation convergence, and flushes DSH when a turn was running.

A pinned rc.6 cancellation can become live-idle before its still-open durable turn receives crash-recovery closure. The live UI therefore follows the Agent's current status; after restart, DSH persistence may label that final turn as recovered after interruption. The console does not synthesize or rewrite a DSH turn boundary.

## Stable htmx/SSE lifecycle

Exact local `htmx.org@2.0.10` and the official `htmx-ext-sse@2.2.4` are pinned by npm integrity and file hash in [`vendor-pins.json`](vendor-pins.json); no CDN is used.

The complete page owns two stable nodes:

```html
<main id="console-stream" hx-ext="sse" sse-connect=".../events">
  <section id="session-panel" hx-ext="sse" sse-swap="session" hx-swap="innerHTML">
```

Neither node is replaced. SSE and htmx mutation responses contain only the target's children and use `innerHTML` swaps. htmx itself processes forms introduced by those swaps. There is no `htmx.process()` workaround. A running update replaces the composer with an htmx Interrupt form; a settled update inserts a fresh htmx Send form. The official extension owns EventSource creation and reconnect, and every new connection receives a complete current server-rendered snapshot.

Global htmx inheritance is disabled, history caching is zero, and transcript-bearing DOM has `hx-history="false"`. Complete documents remain directly navigable at `/qq`, `/qq/`, and every selected canonical session URL. Ordinary forms receive a `303`; htmx receives safe inner fragments.

All event content, session metadata, notices, and status text are HTML-escaped. A strict self-only CSP, same-origin mutation checks, no-store data responses, and loopback-only plugin startup are enforced server-side. Browser JavaScript only supplies Enter/Shift+Enter behavior, focus, and service-worker registration; it contains no session store, EventSource implementation, command queue, or client authority.

## Minimal installable PWA

The manifest, standalone display metadata, 192/512 icons, and versioned service worker establish the smallest install boundary. They do **not** make DSH offline:

- the cache allowlist contains exact versioned htmx/SSE/CSS/browser/icon assets and `offline-v1.html` only;
- navigations always try the network and fall back only to the disconnected shell;
- session documents, fragments, SSE, the manifest, service worker, and every mutation remain network-only;
- non-GET requests are not intercepted;
- there is no cached transcript, offline send/queue, background sync, push, IndexedDB, local storage, or session storage.

The disconnected shell states that no transcript is cached and no message can be sent. Offline POST fails as a network request rather than being queued.

## Daily start

The one start path is run from the qq repository (the script also changes to the repository root when called elsewhere):

```bash
export QWEN_TOKEN_PLAN_API_KEY='...'
bin/qq-dsh-workbench
```

Open `http://127.0.0.1:3082/qq`. On first use the script installs the locked toolchain and prepares the console-only DSH profile. Later starts reuse both. Its default state is persistent at `${XDG_STATE_HOME:-$HOME/.local/state}/qq/dsh-workbench`; `QQ_DSH_HOME` or the standard `DSH_HOME` can select another persistent location.

The first start records a canonical session identity in `$DSH_HOME/qq-console.session`. Killing the process and running the same command resumes that session from DSH's own session log. The session list can reopen any other persisted DSH session. `QQ_DSH_SESSION_ID=session-<UUID>` selects an existing identity or establishes the saved identity on a fresh home.

The workbench explicitly selects `qwen-token-plan/deepseek-v4-pro-0813`. That exact Pro revision is present in the operator's current token-plan catalog but is newer than rc.6's installed pi-ai catalog. The console profile therefore declares only its current non-secret model metadata (name, capacities, text input, Qwen thinking format, and `high`/`max` efforts) through rc.6's public `models` configuration. The provider still inherits the pinned `qwen-token-plan` endpoint and OpenAI-completions protocol and resolves only the existing `QWEN_TOKEN_PLAN_API_KEY` credential reference; this is neither an alias nor an adapter, and no key is stored in this repository. DSH also accepts the key in an owner-only `$DSH_HOME/.credentials.yaml`:

```yaml
QWEN_TOKEN_PLAN_API_KEY: your-key
```

Set its mode with `chmod 600 "$DSH_HOME/.credentials.yaml"`. The selection remains launch-local and visible through `QQ_DSH_PROVIDER`, `QQ_DSH_MODEL`, and `QQ_DSH_REASONING_EFFORT`; a different route/model must first be declared through the same supported DSH profile/settings seam. This workbench does not add a qq-wide model policy.

The composed profile is only `@deepseek-ai/dsh-base` plus this console. The model therefore receives DSH's native `read`, `write`, `edit`, `glob`, `grep`, and `bash` coding tools rooted in the qq repository; pi2dsh and qq's Pi tools are not mounted.

## Migration boundary

### Migrates now

- **Runtime and UI:** daily interactive coding can run in the pinned DSH Agent/Session runtime through the loopback qq console.
- **Tools and model:** the console uses DSH-native repository tools and explicitly declared `qwen-token-plan/deepseek-v4-pro-0813`; the profile stores only the `QWEN_TOKEN_PLAN_API_KEY` reference.
- **Session persistence:** DSH owns new transcripts under `$DSH_HOME/sessions`; the launcher profile is under `$DSH_HOME/profiles/qq-console`, and `$DSH_HOME/qq-console.session` records the default resume identity. `$DSH_HOME` defaults to `${XDG_STATE_HOME:-$HOME/.local/state}/qq/dsh-workbench`.
- **Operation:** run `bin/qq-dsh-workbench`, stop it with Ctrl-C, and run the same command to resume. The browser session list opens other DSH-persisted sessions.

### Does not migrate

- No Pi transcript, Pi/Herdr run state, pane state, or credential file is imported. The launcher never reads Pi auth storage or copies a secret; the operator separately makes the named DSH credential reference resolvable through the launch environment or DSH credential file.
- qq delegation, approval gates, runner/reviewer launch and ownership, agent messaging, independent QA, `done`, landing, and merge workflows remain on Pi/Herdr. This workbench mounts no qq/pi2dsh orchestration.
- There is no cutover. Rollback is Ctrl-C on DSH, then start a fresh Pi session with `pi` or return to the cockpit with `bin/qq-herdr-launch`; the isolated DSH home can remain for later resume and does not alter Pi/Herdr state.

### Known provider limitation

qq normally uses `xai-auth/grok-4.6`, but that route is not available through a supported public seam in pinned DSH rc.6. qq's current Grok traffic uses an OAuth session with refresh plus the `https://cli-chat-proxy.grok.com/v1` Responses transport and its dynamic routing headers. rc.6's pi-ai adapter explicitly has no OAuth credential store, login, or refresh flow and only accepts credential references as API keys. Reusing the current Grok route would therefore require an auth/transport adapter, which this workbench intentionally does not add. The explicit fallback is DeepSeek V4 Pro 0813 through the existing Qwen subscription route; it never silently selects a Qwen model, DeepSeek Flash, or OpenAI.

The plugin refuses a webserver host other than `127.0.0.1` and adds no authentication. A remote laptop or phone therefore needs a separately authenticated loopback tunnel, for example:

```bash
ssh -N -L 127.0.0.1:13082:127.0.0.1:3082 operator@home-pc
```

Use only one page at a time. Never expose the workbench through an all-interfaces bind or unauthenticated tunnel.

## Proof

```bash
node tests/test-dsh-console.mjs .
tests/test-dsh-console-live.sh
QWEN_TOKEN_PLAN_API_KEY='...' tests/test-dsh-workbench-real.sh
```

The fast test exercises session selection, send, two live SSE states, dynamically inserted interrupt, safe rendering, normal/htmx forms, sequential home/laptop/phone reconstruction, PWA allowlisting, explicit model selection, and negative architecture checks. The deterministic live test starts through `bin/qq-dsh-workbench`, creates two canonical sessions, selects between them, sends and interrupts through the real Agent/Session APIs, restarts on the launcher's saved session, verifies ordered reconstruction from DSH artifacts, and executes native DSH read/write/edit/grep/bash tools in the qq repository. The credential-gated smoke makes one real request to exact `qwen-token-plan/deepseek-v4-pro-0813`.

[`../compat/pi2dsh/WEB_QA.md`](../compat/pi2dsh/WEB_QA.md) records the real-browser proof: two SSE swaps preserve both node identities, the newly inserted Interrupt form works without manual processing, forced stream closure reconnects through the official extension, `390×844` has no horizontal overflow, unsafe text stays inert, and the controlled PWA fails closed after the host stops.

This workbench does not add approval/question rendering, an in-page model picker, offline DSH behavior, simultaneous-client coordination, shared browser state, authentication, delegation/QA orchestration, or a physical-device claim.
