---
id: doc-86
title: Plan — Architect digest-first selector (approved 2026-07-24)
type: other
created_date: '2026-07-24 04:40'
updated_date: '2026-07-24 04:40'
tags:
  - plan
---
**Status: APPROVED by the operator, accountable project-home session 2026-07-24.**

# T-151 — Architect digest-first selector plan

## Intended outcome

`/architect` opens on the current ranked observer digest, with “Discuss current digest” selected by default and finalized observer rounds listed below for optional deep dives. Choosing a round preserves the existing analysis/trace kickoff and all `/architect-discussed` behavior.

## Ownership boundary

Change only the qq-owned Pi extension and its focused extension test. Consume the existing `bin/qq-observe digest` and `rounds` contracts; do not change the observer store, ledger, digest engine, architect Skill, or workspace wiring.

## Implementation

1. Add strict digest loading alongside round loading. `/architect` runs `qq-observe digest`, refuses killed/nonzero/unreadable output with an operator-visible error, then loads rounds as today.
2. Render the owned digest’s two ranked tables into a compact plain-text selector header showing promoted/open groups and each finding’s score, recurrence count/key, latest title, kind, PRs, confidence history, and disposition. Keep the selector on Pi’s built-in `ctx.ui.select` so the extension remains dependency-free and JavaScript-compatible under its current test harness.
3. Put `Discuss current digest` first, so it is the built-in selector’s default. Keep all finalized round labels below it in the current undiscussed-first/newest-first order. A digest with no finalized rounds remains discussable.
4. On digest selection, send the current digest into the architect conversation with an explicit whole-ledger walkthrough prompt and no digest/theme-level disposition-writing flow. On round selection, execute the current path unchanged: resolve the same run directory, load the same analysis document/JSON fallback and analyst trace, and preserve failed-round kickoff.
5. Extend `tests/test-qq-architect-extension.sh` with fresh coverage for digest-before-round command order, digest-first selector content/default kickoff, empty-round behavior, digest refusal/unreadable output, and unchanged analyzed/failed round selection. Run the focused test plus repository checks applicable to this extension.

## Non-goals

- No theme-level verdict or digest-level discussed-mark storage.
- No new digest schema or `qq-observe` mode.
- No change to `/architect-discussed`, twin handling, round status, or failure recovery.
- No custom TUI framework or new runtime dependency.

## Success evidence

- The focused Node-backed extension suite observes the real registration/handlers and proves the digest-first selector and unchanged round paths.
- `tests/test-qq-architect-extension.sh` passes.
- Repository diagnostics/checks for edited files are green.
- Fresh-context review confirms the Change stays inside T-151’s boundary.

## Decision dispositions

- Digest as default, rounds beneath: T-151 decision ledger, operator exchange 2026-07-24.
- Digest/theme-level dispositions remain parked: T-151 decision ledger, same exchange.
- Built-in selector header plus default digest choice, rather than a new custom TUI: recommended here for explicit operator approval; it satisfies the view while preserving the extension’s dependency-free test/runtime shape.
