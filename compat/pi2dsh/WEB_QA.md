# Pinned DSH Web community-fix candidate QA

This focused harness compares T-63.9's recorded stock-Web failures with one isolated candidate profile: pinned official [`@deepseek-ai/dsh@0.1.0-rc.6`](pins.json), exact `@0xsline/dsh-spotlight@0.0.2`, and exact `dsh-web-mobile-fix@1.0.2`. It does **not** change [`execution-profiles.json`](execution-profiles.json), install either plugin in an active operator profile, replace DSH session semantics, cut over the operator runtime, or remove Pi/Herdr. The result is [`web-evidence.json`](web-evidence.json).

## Exact isolated composition

Install the compatibility toolchain, then let DSH create a disposable Web profile:

```bash
npm ci --prefix compat/pi2dsh/toolchain --no-audit --no-fund

qa_home=$(mktemp -d)
export DSH_HOME="$qa_home/dsh-home"
dsh=compat/pi2dsh/toolchain/node_modules/.bin/dsh

"$dsh" plugin --profile web add \
  '@0xsline/dsh-spotlight@0.0.2' \
  'dsh-web-mobile-fix@1.0.2'
```

The artifact-only profile does not boot as published under this DSH pin: generated profiles set `autoInstallPeers: false`, and Spotlight imports `schemastery` while declaring both `cordis` and `schemastery` as peers. The observed boot stopped with `ERR_MODULE_NOT_FOUND` for `schemastery`. Complete the isolated proof composition with the exact versions in Spotlight's own source lock:

```bash
"$dsh" plugin --profile web add \
  'cordis@4.0.0-rc.7' \
  'schemastery@3.18.0'
"$dsh" plugin --profile web peers check
```

Check `$DSH_HOME/profiles/web/package.json` and `pnpm-lock.yaml`: the bundle list must append only `@0xsline/dsh-spotlight` and `dsh-web-mobile-fix`, and all four versions and the two candidate integrities must match [`pins.json`](pins.json). The unscoped peers are support dependencies, not profile bundle rows.

Launch only on loopback:

```bash
"$dsh" web --host 127.0.0.1 --port 3081
```

In a clean browser profile, open `http://127.0.0.1:3081`, accept the testing notice, and choose **Configure later**. No model credential is needed. A submitted probe is durably recorded and then fails locally with expected `MISSING_CREDENTIAL`, before model traffic.

## Before baseline

Do not broaden this experiment by rebuilding the stock screenshot suite. Reuse T-63.9's stock evidence, recorded in this file's predecessor at commit `67cb86b`:

- keyboard form mechanics passed, but New Session, recent sessions, Search, Settings, and sidebar navigation had no efficient global route;
- at exactly **390x844**, Settings retained a clipped fixed two-column layout and an open 280px sidebar squeezed the conversation;
- stock session continuity passed through an actual loopback SSH local forward, and `0.0.0.0` was refused.

The candidate run below is the after comparison for only those failures.

## Focused keyboard after-test

Use a disposable workspace, create one session, and submit `keyboard`, Shift+Enter, `probe`, Enter. Confirm that the user bubble contains two lines and the expected local result is `MISSING_CREDENTIAL`. This rechecks the stock composer and persistence path rather than substituting plugin session behavior.

At **1440x900**, use only the keyboard for each Spotlight case:

1. Press Ctrl+K (Cmd+K on macOS); confirm the palette opens and the search field owns focus.
2. Filter for **New conversation**, press Enter, and confirm a new stock Web session opens.
3. Reopen the palette, filter for the persisted session title, press Enter, and confirm its transcript loads.
4. Filter for **Search sessions**, press Enter, and confirm the palette closes, native Search expands, and its textbox owns focus.
5. Filter for **Open installed plugin settings**, press Enter, and confirm native Settings opens on **Plugins**. Record that Spotlight has no direct **General** result; native navigation is still needed from Plugins.
6. Filter for **Collapse sidebar**, press Enter, then reopen the palette and run **Open sidebar**. Confirm the stock layout state changes in each direction.
7. Close the palette with Escape. Check console messages, uncaught page errors, and failed requests.

The observed catalog also included the current recent session and native slash commands. That is runtime evidence for this pin, not a durable selector contract: Spotlight admits that part of action discovery follows the Web DOM and can drift after host UI changes.

## Exact 390x844 after-test

Set the viewport to exactly **390x844**, keep the persisted session selected, and first collapse the sidebar. Confirm that the candidate style exists:

```js
window.innerWidth === 390 &&
window.innerHeight === 844 &&
!!document.querySelector('style[data-plugin="dsh-web-mobile-fix"]')
```

Open the sidebar and inspect `[data-details-collapsed]`. The observed grid remained `56px 334px 0px`; the wide sidebar content was a 280px overlay, while the conversation column stayed 334px. This closes the stock squeeze failure. It does **not** match the package README's literal “full-screen sidebar” wording, so record the measured overlay behavior instead.

Open **Settings > General** and inspect the modal and its scroll regions. The observed focused measurements were:

- dialog: `390x844`, `flex-direction: column`, no document overflow;
- content: 390px wide with equal client/scroll width (no horizontal content clipping);
- General body: 704px client height and 754px scroll height, so the final row remained vertically reachable;
- tab strip: one row with 366px client width and 429px scroll width, so **Agent presets** requires horizontal scrolling rather than clipping into a narrow content column.

A reproducible console probe is:

```js
const dialog = document.querySelector(
  '[role="dialog"][aria-modal="true"][aria-labelledby]'
)
const nav = dialog.querySelector(':scope > nav')
const content = nav.nextElementSibling
const tabs = nav.querySelector(':scope > div:last-child')
const scrollBody = [...dialog.querySelectorAll('*')].find((node) =>
  getComputedStyle(node).overflowY === 'auto' &&
  node.scrollHeight > node.clientHeight &&
  node.clientWidth === 390
)
;({
  viewport: [innerWidth, innerHeight],
  dialog: [dialog.clientWidth, dialog.clientHeight],
  direction: getComputedStyle(dialog).flexDirection,
  content: [content.clientWidth, content.scrollWidth],
  body: [scrollBody.clientHeight, scrollBody.scrollHeight],
  tabs: [tabs.clientWidth, tabs.scrollWidth],
  document: [document.documentElement.scrollWidth,
             document.documentElement.scrollHeight],
})
```

No screenshot set is required. If visual evidence is needed during a rerun, keep only the open-sidebar and Settings states; the numeric checks are the reproducible record.

## Continuity and security regression

Keep the server on `127.0.0.1`. From a second authenticated operator context, use the same topology as T-63.9:

```bash
ssh -N \
  -L 127.0.0.1:13081:127.0.0.1:3081 \
  operator@dsh-host
```

Open `http://127.0.0.1:13081` in a second clean browser origin. The observed second client listed the first client's workspace/session and loaded its persisted two-line prompt plus `MISSING_CREDENTIAL`. This proves the existing transport/UI continuity on the QA host, not a physical-phone deployment. Both listeners remained loopback-only; SSH remained the authenticated transport.

After stopping the candidate server, confirm the stock refusal still runs with the candidate profile composed:

```bash
set +e
"$dsh" web --host 0.0.0.0 --port 18081
status=$?
set -e
printf 'exit=%s\n' "$status"   # expected: 1
ss -ltn | grep ':18081'         # expected: no listener
```

The plugins add no authentication. Never infer that a keyboard palette or narrow CSS layout makes LAN/Tailnet publication safe, and never pair this proof with a bind-bypass plugin.

## Proof limits

`dsh-web-mobile-fix` is a reversible CSS style injection. This run proves only the measured Settings and sidebar layout changes. It does **not** prove touch behavior, soft keyboards, IME, approvals, questions, long transcripts, or a physical phone. Spotlight is a browser-local enhancement over stock services and visible controls; it does not add or replace a session protocol.

Both projects were only days old at observation. The peer-install requirement, selector drift, the horizontally scrolling Settings tab row, and all prior qq/pi2dsh cutover blockers remain material.

## Verdict: focused candidate pass, no adoption

The exact candidate closed the focused T-63.9 keyboard-navigation categories and both measured 390x844 layout failures while preserving stock session persistence, two-client continuity, loopback-only binding, and authenticated SSH forwarding. This is sufficient to pass the selected experiment only. It does not approve adoption or cutover, does not change the active operator surface, and does not replace Herdr/Pi.
