---
id: T-151
title: Architect digest view — whole-picture default in the /architect selector
status: To Do
assignee: []
created_date: '2026-07-24 04:30'
labels: []
dependencies: []
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator direction 2026-07-24 (accountable project-home session): the findings-as-a-whole conversation is the productive default for the architect tab. Develop: /architect opens with the digest rendered as the default view (ranked ledger: promoted + open findings with scores, recurrence, dispositions), with rounds listed beneath for deep-dives; picking a round keeps today's behavior (document + analyst trace loaded). Digest-level (theme-level) dispositions are PARKED — only if real digest walks produce theme-level verdicts (operator ruling, same session).

Context: extension is extensions/qq-architect.ts (/architect); the digest comes from bin/qq-observe digest (Change ④, PR #229). The architect tab is live (wM:t3T). Consumption model: doc-81 amendment 2026-07-23.

Decision ledger: digest-as-default view — operator selection 2026-07-24 (option 1 of the consumption-model exchange); theme-level dispositions deferred — operator ruling, same exchange; venue: fresh session in a new tab — operator direction, same exchange.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 /architect's opening view renders the current digest (promoted + open findings, ranked) as the default, with undiscussed rounds listed beneath for deep-dive selection
- [ ] #2 Round selection, discussed-mark flow, and failed-round behavior are unchanged
- [ ] #3 Fresh Checks cover the digest-first selector
<!-- AC:END -->
<!-- SECTION:DESCRIPTION:END -->
