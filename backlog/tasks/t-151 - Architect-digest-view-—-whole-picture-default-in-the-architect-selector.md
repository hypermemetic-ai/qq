---
id: T-151
title: Architect digest view — whole-picture default in the /architect selector
status: Done
assignee:
  - '@qqp-dev'
created_date: '2026-07-24 04:30'
updated_date: '2026-07-24 05:21'
labels: []
dependencies: []
documentation:
  - doc-86
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator direction 2026-07-24 (accountable project-home session): the findings-as-a-whole conversation is the productive default for the architect tab. Develop: /architect opens with the digest rendered as the default view (ranked ledger: promoted + open findings with scores, recurrence, dispositions), with rounds listed beneath for deep-dives; picking a round keeps today's behavior (document + analyst trace loaded). Digest-level (theme-level) dispositions are PARKED — only if real digest walks produce theme-level verdicts (operator ruling, same session).

Context: extension is extensions/qq-architect.ts (/architect); the digest comes from bin/qq-observe digest (Change ④, PR #229). The architect tab is live (wM:t3T). Consumption model: doc-81 amendment 2026-07-23.

Decision ledger: digest-as-default view — operator selection 2026-07-24 (option 1 of the consumption-model exchange); theme-level dispositions deferred — operator ruling, same exchange; venue: fresh session in a new tab — operator direction, same exchange; built-in selector header plus default digest choice — approved implementation plan doc-86, accountable project-home session 2026-07-24.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /architect's opening view renders the current digest (promoted + open findings, ranked) as the default, with undiscussed rounds listed beneath for deep-dive selection
- [x] #2 Round selection, discussed-mark flow, and failed-round behavior are unchanged
- [x] #3 Fresh Checks cover the digest-first selector
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved digest-first built-in selector. Fresh-context review found two boundary-A canonical-digest gaps; both were reproduced, fixed, and their fix deltas reviewed. The final signal-row fix has 0 production-LOC and 0 decision-point delta after the required same-fix-smaller pass. Verification: focused extension suite pass; truncated and malformed Signal-tuning inputs now refuse before rounds/selector/turn; LSP 0 diagnostics; GitHub shell-tests pass; operator UAT in pane wM:p55 confirmed the ranked digest view, default whole-ledger kickoff, rounds beneath, and parked digest-level dispositions.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made the ranked observer digest the default /architect view with optional round deep dives, while preserving round/discussed/failed behavior and keeping digest-level dispositions parked. Verified by focused automated tests, reproduced failure-path checks, fresh-context review through final PASS, green GitHub shell-tests, and explicit operator UAT acceptance.
<!-- SECTION:FINAL_SUMMARY:END -->
