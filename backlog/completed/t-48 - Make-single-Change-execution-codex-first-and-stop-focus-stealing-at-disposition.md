---
id: T-48
title: >-
  Make single-Change execution codex-first and stop focus-stealing at
  disposition
status: Done
assignee: []
created_date: '2026-07-16 03:15'
updated_date: '2026-07-16 03:34'
labels: []
dependencies: []
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-aligned 2026-07-15 in the accountable session. Two coupled amendments to skills/deliver-change/SKILL.md, closing the doc-42 single-Change gap and removing an operator annoyance.

(1) Codex-first single Changes: step 2 currently reads 'Implement and verify coherent units' with no execution split, so a lone Change is implemented by the accountable Fable session directly. Amend it so execution within plan bounds defaults to codex exec via delegate-batch's 'Dispatch codex-first' machinery (work-order brief, sandboxed non-interactive runner in this Change's checkout, verified completion envelope), with the same narrow Claude-subagent exception as delegate-batch. Operator rationale unchanged from doc-42: Fable composes plans, briefs, and verdicts; codex executes within them.

(2) Stop focus-stealing: step 12 runs 'qq-herdr-home focus-board' at terminal disposition, which calls 'herdr tab focus' on the home board tab and yanks operator focus into the project home whenever a Change ends (typically right after the operator merges a PR). Remove the focus ceremony entirely; the step-9 disposition notification remains the only signal. The focus-board subcommand itself stays as an operator-invocable validator. cockpit/README.md's disposition paragraph is updated to match; openwiki/operations.md is derived and left to an assigned wiki refresh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deliver-change step 2 defaults single-Change execution to codex-first dispatch per delegate-batch's machinery (work-order brief, sandboxed codex exec in the Change's checkout, verified completion envelope), keeping delegate-batch's Claude-subagent exception verbatim in spirit
- [x] #2 No deliver-change step changes operator focus: the focus-board invocation and its id-verification ceremony are gone from step 12, and terminal disposition explicitly leaves focus untouched while panes, tabs, workspace, and checkout stay intact
- [x] #3 cockpit/README.md describes terminal disposition as focus-preserving and reframes qq-herdr-home focus-board as an operator-invocable validator rather than part of the disposition flow
- [x] #4 The repository test suite passes, and this Change's own implementation is executed codex-first with a completion envelope verified against the tree
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Compose the work order with exact old-to-new text for both SKILL.md amendments and the README paragraph; dispatch codex exec in this Change's checkout; verify the envelope against the tree; run tests; code-review; commit, push, PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation was executed codex-first in three delegated rounds, each from an owner-composed work order with exact old-to-new text, each envelope verified against the tree, no delegate commits: (1) SKILL.md steps 2 and 12 plus the cockpit/README.md disposition paragraph; (2) the stale conformance assertion at tests/test-qq-herdr-home.sh:186 updated to assert the new contract; (3) review-fix adding a negative tripwire rejecting any 'qq-herdr-home focus-board --repo' occurrence in deliver-change. Code-review (fresh read-only codex reviewer) confirmed one material finding — the round-2 assertions were presence-only; a probe reintroducing the old directive stayed green — fixed in round 3 and the delta re-reviewed clean. Full test suite (8 files) passes under owner rerun. openwiki/operations.md still mentions the old disposition focus behavior; it is a derived surface, deferred to an assigned wiki refresh.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
deliver-change step 2 now defaults single-Change execution to codex-first dispatch per delegate-batch's 'Dispatch codex-first' section (work-order brief, sandboxed runner in the Change's checkout, completion envelope verified against the tree; Claude subagent only for harness-native tools or judgment beyond plan bounds). Step 12 no longer invokes qq-herdr-home focus-board: terminal disposition leaves operator focus untouched and the disposition watch's completion notification is the only end-of-Change signal. cockpit/README.md reframes focus-board as an operator-invocable validator. The conformance test asserts the prohibition, the untouched-focus phrase, and trips on any reintroduced disposition-time invocation.
<!-- SECTION:FINAL_SUMMARY:END -->
