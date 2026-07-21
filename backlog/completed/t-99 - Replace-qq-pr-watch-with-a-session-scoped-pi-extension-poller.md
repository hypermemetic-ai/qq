---
id: T-99
title: Replace qq-pr-watch with a session-scoped pi extension poller
status: Done
assignee: []
created_date: '2026-07-19 16:42'
updated_date: '2026-07-19 23:08'
labels: []
dependencies: []
documentation:
  - doc-55
priority: low
type: task
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Conditional shrink (evidence: doc-55). A session-scoped pi extension can poll one exact PR, emit exactly one structured same-session follow-up on MERGED or CLOSED, and clean up on session shutdown — removing the Bash engine. Retire bin/qq-pr-watch only after the replacement has fresh tests for both terminal states and exactly-once wake; otherwise keep it (no maintained package meets the contract).

Decision ledger:
- Extension-poller basis (pi extension API + gh pr view) and the exact-once/both-states contract: doc-55, ticketed per operator instruction in the T-93 follow-up session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Replacement demonstrates MERGED and CLOSED wakes, exactly one structured follow-up each, error visibility, and shutdown cleanup in fresh tests
- [x] #2 deliver-change step 9 updated to the new watcher contract, or this task closed keep-as-is with the gap recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FINAL SUMMARY (2026-07-19, PR #157): Replaced bin/qq-pr-watch with extensions/qq-pr-watch.ts, a session-scoped pi extension exposing the qq_pr_watch tool (watch/inspect). AC #1: tests/test-qq-pr-watch-extension.sh (house JS-compatible-TS idiom, plain-node import, fake pi/gh/timers) demonstrates MERGED and CLOSED wakes with exactly one structured follow-up each (timer cleared before send, no wakes after spend), error visibility across three failure classes, and shutdown cleanup including in-flight suppression and idempotence; plus parity cases (one-poll terminal arm, interval 30-60 with coercion refusal, canonical gh-.url dedupe both directions, concurrent PRs, ---terminated argv, inspect refused/done/error). AC #2: deliver-change step 9 now arms the qq_pr_watch tool; every pinned contract term survives verbatim (guard suite: tests/test-qq-herdr-home.sh). Review: 3 fresh-context rounds; findings (canonical-key double-arm, identity-less wake content, selector-free prepareArguments throw) each owner-confirmed against pi 0.80.10 source before fixing; R3 verdict approve. All 15 suites green on the final tree. Residual (ticket-scoped): an armed watch dies with its session (session-scoped by design). Adoption after merge: mount extensions/qq-pr-watch.ts in ~/.pi/agent/settings.json per README.
<!-- SECTION:NOTES:END -->
