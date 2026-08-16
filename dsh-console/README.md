# qq DSH console proof

This is qq's first server-rendered operator-surface slice over the pinned DSH/Cordis host. It is **not** stock DSH Web, a Herdr/Pi replacement, a second session implementation, or an active/active client system.

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

## Isolated run

Install the repository's exact toolchain and create a dedicated profile in a disposable `DSH_HOME`:

```bash
npm ci --prefix compat/pi2dsh/toolchain --no-audit --no-fund

export DSH_HOME="$(mktemp -d)/dsh-home"
dsh="$PWD/compat/pi2dsh/toolchain/node_modules/.bin/dsh"
"$dsh" plugin --profile qq-console add "$PWD/dsh-console"
node dsh-console/configure-profile.mjs \
  "$DSH_HOME/profiles/qq-console/package.json"

export QQ_DSH_SESSION_ID="session-$(node -e 'console.log(crypto.randomUUID())')"
export QQ_DSH_CONSOLE_PORT=3082
export DSH_TELEMETRY_DISABLED=1
"$dsh" --profile qq-console
```

Open `http://127.0.0.1:3082/qq`. The plugin refuses a webserver host other than `127.0.0.1` and adds no authentication. A remote laptop or phone therefore needs a separately authenticated loopback tunnel, for example:

```bash
ssh -N -L 127.0.0.1:13082:127.0.0.1:3082 operator@home-pc
```

Use only one page at a time. Never expose this proof through an all-interfaces bind or unauthenticated tunnel.

## Proof

```bash
node tests/test-dsh-console.mjs .
tests/test-dsh-console-live.sh
```

The fast test exercises session selection, send, two live SSE states, dynamically inserted interrupt, safe rendering, normal/htmx forms, sequential home/laptop/phone reconstruction, PWA allowlisting, and negative architecture checks. The live test installs the exact DSH pin, uses only the deterministic localhost model stub, creates two canonical sessions, selects between them, sends and interrupts through the real Agent/Session APIs, closes every page stream before the next device context, restarts the DSH/Cordis host, and verifies ordered reconstruction from DSH artifacts.

[`../compat/pi2dsh/WEB_QA.md`](../compat/pi2dsh/WEB_QA.md) records the real-browser proof: two SSE swaps preserve both node identities, the newly inserted Interrupt form works without manual processing, forced stream closure reconnects through the official extension, `390×844` has no horizontal overflow, unsafe text stays inert, and the controlled PWA fails closed after the host stops.

This slice does not add approval/question rendering, model selection, offline DSH behavior, simultaneous-client coordination, shared browser state, authentication, or a physical-device claim.
