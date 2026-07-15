---
id: TASK-5
title: Supersede stale in-flight OpenWiki updates instead of waiting
status: Done
assignee:
  - '@claude'
created_date: '2026-07-12 04:58'
updated_date: '2026-07-12 17:45'
labels:
  - architecture
  - openwiki
dependencies: []
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator finding: the openwiki-maintainer flow queues newly landed merges behind an active update Change, making the wiki up to one full documentation cycle late. The wait rule protects an unmerged documentation pull request, but generated pages are pure derived content with no preservation value once main advances past the tree they document. Change the semantics to supersede-in-place: the single writer discards a stale in-flight update and regenerates against current origin/main, refreshing the standing pull request. Residual latency reduces to generation and review time; the accepted cost is discarded generation work under rapid merges.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The openwiki-maintainer skill discards and regenerates a stale unmerged update instead of waiting behind it
- [x] #2 The single-writer property and the qq-openwiki wrapper guards are preserved unchanged
- [x] #3 An independent code-review of the Change passes before commit, push, and pull request
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite the three wait-semantics passages in skills/openwiki-maintainer/SKILL.md (Observe step 4, Prepare step 3, the Deliver paragraph) to supersede-in-place. 2. Verify compatibility with the unchanged qq-openwiki wrapper guards. 3. Independent code-review, fix findings, delta re-review. 4. Commit, push, PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Semantics settled: a stale unmerged update Change is discarded and regenerated from current origin/main — generated pages are derived content with no preservation value once main advances past the tree they document. The single-writer property survives untouched: same worktree, same branch, same flock, same wrapper preconditions (reset satisfies HEAD == origin/main exactly as fast-forward did). Residual wiki latency is now generation-plus-review time and observation cadence only; the accepted cost is discarded generation work under rapid merges. Independent fresh-context review confirmed both semantic criteria and the completeness guarantee (regeneration from the full landed tree subsumes the old accumulated-range rule) and returned one low finding: the supersede push is a non-fast-forward and the text did not say force-push, which could strand a maintainer or masquerade as a competing-writer signal. Fixed with one clause (force-push with lease; the single writer owns its history); the same reviewer confirmed the delta with no material findings outstanding. Landing bookkeeping rides along: TASK-2 and TASK-4 marked Done after their Changes merged in PRs #28 and #30.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Changed the OpenWiki maintainer to supersede stale in-flight updates by regenerating from current origin/main and force-pushing with lease, while preserving the single-writer property and wrapper guards. Independent review passed, and the Change landed in PR #31.
<!-- SECTION:FINAL_SUMMARY:END -->
