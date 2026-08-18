---
description: Iterate qq-ui HTML/CSS from a live-asset fixture with desktop and phone shots
argument-hint: "[defect]"
---
Freeform runner loop for `qq-ui` presentation. The operator named this defect: ${@:-the operator will name it next}.

There is no token file, rubric, or design contract. The design-loop tools do the structural grind. You do the CSS/HTML edits.

## Tools

- `design_loop_start` — start `tests/dsh-console-browser-fixture.mjs` with live assets; returns origin + session URL
- `design_loop_seed` — POST a sample prompt so the transcript is not empty
- `design_loop_capture` — reload, shoot desktop 1280×800 and Pixel 10 412×915, optionally 412×520 short, measure default boxes
- `design_loop_measure` — `get box` / `get styles` for named selectors
- `design_loop_stop` — kill the fixture and close the dedicated `--session frontend-design-loop` browser

Shots land under `$XDG_STATE_HOME/qq/frontend-design-loop/shots/<label>/`.

## Loop

1. Start the fixture.
2. Seed if the defect needs cards or a filled composer.
3. Capture desktop + phone (add `short` when the composer is in play) before judging.
4. Patch only presentation. Reload via capture; do not restart the fixture after each edit.
5. Repeat until the operator stops. Then stop the fixture.

## Patch only these

- `qq-ui/src/render.mjs`
- `qq-ui/assets/console.css`
- maybe a tiny `qq-ui/assets/browser-*.js`

Do not touch SSE owner/target (`#console-stream`, `#session-panel`), PWA cache, DSH APIs, or live host just to make the UI look better. Use the fixture, not live DSH.

## Stable DOM

Phone: one top bar + Sessions disclosure; 44px Send; composer on the safe-area edge. Cards stay full-width stacked. Color already identifies the speaker.

## Live assets

Production console stays bundled and immutable. The fixture `--live` / `QQ_DESIGN_LOOP_LIVE=1` path re-reads CSS/JS from disk with `no-store` and cache-busts `render.mjs`. A pass must not restart the fixture after each edit.

## Capture before judging

Always shoot desktop + phone. Add the short height when the composer can collide with chrome. Read the PNGs and measured boxes; do not guess from CSS alone.
