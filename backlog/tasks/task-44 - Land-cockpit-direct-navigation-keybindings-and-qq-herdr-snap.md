---
id: TASK-44
title: Land cockpit direct-navigation keybindings and qq-herdr-snap
status: Done
assignee: []
created_date: '2026-07-15 22:24'
updated_date: '2026-07-15 22:38'
labels: []
dependencies: []
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-authored cockpit work found as uncommitted changes in the main checkout during TASK-42's post-merge sync, and directed to land together (operator, 2026-07-15): direct no-prefix navigation keybindings (alt+arrows for workspace/tab, inverted j/k pane focus), the new bin/qq-herdr-snap tool (alt+o snaps to the current space's orchestrator agent, pressing again bounces back), and its install.sh link. The tool and config land verbatim as authored; a test in the repo's fake-herdr idiom is added to keep the every-bin-tool-has-a-test convention.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 qq-herdr-snap has a test following the repo's fake-herdr idiom and the full suite passes
- [x] #2 The operator's keybindings, qq-herdr-snap, and install.sh land as authored, plus three operator-approved review fixes (state-write failure keeps the exit-0 contract, jq parse failures cannot drive focus, fallback comment matches implementation)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review (fresh read-only codex, 2026-07-15) found 3 defects; operator chose 'fix all three, then land' over landing verbatim. Fixes regression-tested (corrupted agent list; unwritable XDG_RUNTIME_DIR). Shellcheck: only info-level SC1091/SC2034 shared with sibling tests.

Post-merge obligation (operator-approved): refresh the three superseded working copies in the main checkout to the landed content, then complete the deferred ff-only sync (also unblocks PR 90's pending sync).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed the operator's cockpit batch as one Change: direct no-prefix navigation keybindings (alt+up/down workspaces, alt+left/right tabs, inverted j/k pane focus per operator preference), the new bin/qq-herdr-snap tool (alt+o snaps to the focused space's orchestrator agent — claude preferred, else first in sidebar order — pressing again bounces back via per-workspace state), and its install.sh link. Added tests/test-qq-herdr-snap.sh in the fake-herdr idiom (snap preference, fallback, all bounce paths, no-agent, no-state, pane-current fallback). Fresh review found 3 defects; the operator chose to fix all three before landing: state-write failures now keep the exit-0 keybinding contract, jq parse failures can no longer drive focus from a corrupted response prefix, and the config comment matches the sidebar-order fallback. Both fixes regression-tested; full suite green; TOML parses; shellcheck carries only the info-level notes shared with sibling tests.
<!-- SECTION:FINAL_SUMMARY:END -->
