# qq DSH sequential-console browser QA

This is the focused T-63.11 proof for the qq-owned server-rendered console in [`../../dsh-console`](../../dsh-console). It replaces the prior community-plugin experiment as the active Web QA target; T-63.10 remains requirements evidence only. The result is recorded in [`web-evidence.json`](web-evidence.json).

The topology is deliberately sequential: home, laptop, and phone use one page at a time. The same thing reconstructed on each device is the canonical DSH session id and ordered durable transcript, not synchronized browser state. Do not open extra pages to invent an observer/controller test.

## Automated DSH boundary

Run both repository proofs first:

```bash
node tests/test-dsh-console.mjs .
tests/test-dsh-console-live.sh
```

The live proof creates a disposable exact rc.6 profile, keeps all model traffic on the deterministic localhost stub, materializes two canonical DSH sessions, and exercises selection, Send, SSE running/settled output, Interrupt, sequential page disconnection, host restart, and ordered reconstruction from DSH persistence. It closes each curl SSE stream before opening the next device context. The fast test covers the same HTTP/rendering boundary with deterministic timing and negative checks for leases, client storage, manual htmx processing, and unsafe PWA caching.

## Real-browser fixture

The fixture uses the production HTTP handler and rendering/assets with a deterministic in-memory DSH-shaped adapter so browser timing is controllable. It is only the browser-lifecycle proof; the live test above is the DSH API/persistence proof.

```bash
endpoint=$(mktemp)
node tests/dsh-console-browser-fixture.mjs "$endpoint" &
fixture_pid=$!
while [ ! -s "$endpoint" ]; do sleep 0.05; done
origin=$(cat "$endpoint")
printf '%s\n' "$origin/qq"
```

Open the printed loopback URL in a clean Chromium profile at desktop size. Before sending, retain JavaScript references to the stable nodes and count official-extension messages:

```js
window.__qa = {
  owner: document.querySelector('#console-stream'),
  target: document.querySelector('#session-panel'),
  messages: 0,
  opens: 0,
}
document.body.addEventListener('htmx:sseMessage', () => window.__qa.messages++)
document.body.addEventListener('htmx:sseOpen', () => window.__qa.opens++)
```

### Two swaps, safe rendering, and new htmx form

1. Send `browser swap <script>window.pwned=true</script>`.
2. Wait for the deterministic assistant reply.
3. Confirm at least two `htmx:sseMessage` events occurred: running inserted the Interrupt form and settled inserted a new Send form.
4. Confirm both retained node references are still identical to the current nodes, `window.pwned` is absent, and the literal script text is visible in the transcript.
5. Send `browser interrupt proof` and wait for the **Interrupt** button to appear through SSE.
6. Click that newly inserted button. Confirm status becomes **Last turn interrupted**, the Send composer returns, and the prompt remains in the transcript.

Observed result:

```js
({
  messages: window.__qa.messages, // 4 after the interrupt flow
  ownerStable: window.__qa.owner === document.querySelector('#console-stream'),
  targetStable: window.__qa.target === document.querySelector('#session-panel'),
  scriptExecuted: window.pwned === true,
  composer: !!document.querySelector('#composer'),
  interrupt: !!document.querySelector('#interrupt-form'),
})
// { messages: 4, ownerStable: true, targetStable: true,
//   scriptExecuted: false, composer: true, interrupt: false }
```

This is specifically a processing-lifecycle proof. The production source contains no `htmx.process()` call; the official htmx swap path processes the form inserted by SSE.

### Official-extension reconnect

While the page remains open, force only its current fixture SSE response closed:

```bash
curl -fsS "$origin/__proof/disconnect"
```

Wait 1.5 seconds. Confirm the transcript is still present, both node identities remain stable, `window.__qa.opens` increased, and:

```bash
curl -fsS "$origin/__proof/state"
```

reports `connects: 2` and one current stream. The observed browser received another complete `session` event after reconnect (`messages: 5`). There is no custom `EventSource` or reconnect implementation in qq's browser script.

### Session selection and narrow layout

1. Select the option ending in `000000000022` and activate **Open**.
2. Confirm the canonical URL and heading code use that exact id, its empty transcript does not contain the first session's prompt, and its option is selected.
3. Activate **New session** and confirm a fresh canonical `session-<UUID>` URL opens with an empty transcript and appears in the selector.
4. Set the viewport to exactly **390×844**.
5. Confirm the page exposes the session selector, Open, New session, status, transcript, and the inline composer controls without horizontal document overflow.

Outcome checks:

```js
({
  viewport: [innerWidth, innerHeight],                  // [390, 844]
  horizontalOverflow:
    document.documentElement.scrollWidth > innerWidth,  // false
  panelFits:
    document.querySelector('#session-panel').getBoundingClientRect().width === innerWidth, // true
  sessionControlsVisible:
    [...document.querySelectorAll('#session-choice, .session-controls button')]
      .every((control) => control.getClientRects().length > 0), // true
  sendIsInline:
    Math.abs(document.querySelector('#prompt').getBoundingClientRect().bottom -
      document.querySelector('#composer-submit').getBoundingClientRect().bottom) < 1, // true
})
```

This is a real responsive browser viewport, not a physical-phone, touch, soft-keyboard, or IME claim.

## Installability and offline fail-closed behavior

Wait for `navigator.serviceWorker.ready`. Confirm the manifest has `display: "standalone"`, 192px and 512px icons, and scope `/qq/`. Inspect the one cache. The exact observed paths are:

```text
/qq/assets/htmx-2.0.10.min.js
/qq/assets/htmx-ext-sse-2.2.4.js
/qq/assets/console-v3.css
/qq/assets/browser-v3.js
/qq/assets/icon-v1-192.png
/qq/assets/icon-v1-512.png
/qq/assets/offline-v3.html
```

No manifest, service worker, page, transcript, fragment, SSE URL, or mutation URL is cached.

Stop the fixture while leaving the controlled page open:

```bash
kill "$fixture_pid"
wait "$fixture_pid" || true
```

Reload the selected canonical session URL. The observed controlled page rendered **DSH is unavailable** and the statement **No transcript is cached and no message can be sent offline.** A direct URL-encoded POST fetch to the prompt endpoint rejected with a network error; it returned no synthetic response and appeared in no queue. This proves a disconnected install shell, not offline DSH.

## Security/topology checks

- [`cordis.patch.yml`](../../dsh-console/cordis.patch.yml) binds `127.0.0.1`; [`plugin.mjs`](../../dsh-console/src/plugin.mjs) refuses any other host.
- Every data/SSE/fragment/mutation response is `no-store`; static immutable caching is restricted to versioned presentation assets.
- Mutations enforce same-origin request metadata, and all server-rendered data is escaped.
- Remote laptop/phone use requires separately authenticated loopback forwarding. The plugin adds no authentication and must not be LAN-bound.
- No lease, controller, observer mode, presence, fanout registry, client cookie, offline queue, second database, or browser session authority is present.

## Verdict

**Pass for the T-63.11 sequential vertical slice.** The exact DSH pin owns identities, transcript order, status, cancellation, and persistence; pinned htmx plus its official SSE extension owns live browser updates and reconnect around stable nodes; the installable PWA caches presentation only and fails closed for data and commands. No operator-runtime cutover or physical-device claim is made.
