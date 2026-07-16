---
id: TASK-56
title: 'qq-herdr-snap: false ''already on the orchestrator'' bounce dead-end'
status: Done
assignee: []
created_date: '2026-07-16 16:43'
updated_date: '2026-07-16 17:02'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From Ideas doc-1 (2026-07-15 23:44): "bug: already on the orchestrator when not orchestrator".

bin/qq-herdr-snap notifies "already on the orchestrator" (line ~80) when current == target and the bounce state file is empty or self. Target resolution prefers the claude agent in the focused workspace, else the FIRST agent in sidebar order — so on a pane hosting any non-claude agent in a space with no claude agent, target can resolve to the pane the operator is already on, producing the false message on a pane that is not the orchestrator. Reproduce before fixing (tests/test-qq-herdr-snap.sh mocks exist); fix the false positive without breaking the true bounce dead-end message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A failing test reproduces the false 'already on the orchestrator' path before the fix and passes after
- [x] #2 Snap-to-orchestrator and bounce-back behavior is preserved for the true cases, covered by existing tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause reproduced: herdr agent list includes externally reported presences (delegate status surface); in a space with no claude agent the first-agent fallback can resolve to the focused shell pane itself, producing the false claim. Fix: target resolution also returns whether the target is the claude orchestrator; a non-claude self-target with no bounce origin now gets 'no other agent session in this space'. Accepted residual: an external reporter using the literal label 'claude' is indistinguishable from a genuine claude target (no schema discriminator).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
qq-herdr-snap no longer claims 'already on the orchestrator' on a pane that is not the orchestrator; the true claude dead-end message, snap, bounce, dry-run, and exit-0 semantics are unchanged. Regression test observed failing pre-fix; full suite green; fresh-context review verdict: pass, no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
