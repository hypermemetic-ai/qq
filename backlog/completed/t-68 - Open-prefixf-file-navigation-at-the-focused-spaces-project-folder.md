---
id: T-68
title: Open prefix+f file navigation at the focused space's project folder
status: Done
assignee:
  - '@claude'
created_date: '2026-07-17 01:31'
updated_date: '2026-07-17 01:55'
labels: []
dependencies: []
references:
  - cockpit/shell/file-navigation.bash
  - cockpit/herdr/config.toml
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Herdr prefix+f opens a popup running qqy, which always opens yazi at QQ_HOME (~/projects/qq), regardless of which herdr space is focused. It should open at the project folder of the focused space: ~/projects/deciq in the deciq space, ~/projects/qq in the qq space, and a linked worktree checkout in a worktree space.

Herdr already exposes this mapping: `herdr workspace list` returns per-workspace `focused` and `worktree.checkout_path`. Resolve the focused workspace checkout in the shell helpers and fall back to QQ_HOME when herdr/jq are unavailable or the focused space has no worktree (current behavior).

Assumption: prefix+shift+f (qqbr/broot) is the same navigation surface with the same hardcoding and gets the same resolution, so the two popups stay consistent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 prefix+f in the deciq space opens yazi at ~/projects/deciq; in the qq space at ~/projects/qq
- [x] #2 A focused space without a worktree, or a shell outside herdr, falls back to the current QQ_HOME behavior
- [x] #3 prefix+shift+f (qqbr/broot) resolves the same way
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add qq_space_dir() to cockpit/shell/file-navigation.bash: resolve the focused herdr workspace via `herdr workspace list` + jq and print its worktree.checkout_path; fall back to QQ_HOME when herdr/jq are unavailable, no focused worktree exists, or the directory is missing.
2. Rewire qqy and qqbr to start at qq_space_dir instead of hardcoded QQ_HOME.
3. Update the popup descriptions in cockpit/herdr/config.toml and the flow wording in cockpit/README.md.
4. Add tests/test-file-navigation.sh using the existing fake-herdr stub pattern (focused worktree, no-worktree fallback, no-herdr fallback); run the tests/ suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Codex delegate implemented in fix/t-68-space-nav @ 6b7b420 (4 files). Owner re-ran checks: bash -n pass, full tests/ suite 9/9 pass. Live probe: sourced new file, qq_space_dir printed /home/qqp/projects/qq matching herdr's focused workspace.

Review round 1 (fresh codex read-only reviewer): one P2 confirmed by owner repro — with pipefail off, a failing herdr that prints valid JSON is accepted instead of QQ_HOME fallback. Rework dispatched: status-check herdr separately; pipefail-off regression test case.

Review round 1 fix verified: exact delta (6b7b420..8e7ef89) is the prescribed status-check split plus a pipefail-off regression test; owner re-ran full suite (9/9 pass) and the original failing-herdr repro now falls back (rc=1). Negative check: with the pipeline reverted, the new test case fails.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added qq_space_dir() to cockpit/shell/file-navigation.bash: resolves the focused herdr workspace's worktree.checkout_path via herdr workspace list + jq (separately status-checked), so the prefix+f (qqy/yazi) and prefix+shift+f (qqbr/broot) popups open at the focused space's project folder — deciq in the deciq space, qq in the qq space, a linked worktree's checkout in its space — falling back to QQ_HOME when herdr/jq are unavailable, the herdr command fails, the focused space has no worktree, or the path is missing. Updated popup descriptions and cockpit README. Verified with new tests/test-file-navigation.sh (focused-worktree win, no-worktree/missing-dir/no-herdr/failing-herdr fallbacks, pipefail-off probes) in the 9/9-green suite, plus a live probe inside running herdr matching the focused workspace. Code-reviewed (1 P2 found, fixed, regression-tested).
<!-- SECTION:FINAL_SUMMARY:END -->
