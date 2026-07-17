---
id: T-87
title: 'qq-herdr-home: take the board grep off the critical path'
status: Done
assignee: []
created_date: '2026-07-17 17:19'
updated_date: '2026-07-17 19:41'
labels:
  - base-batch
dependencies:
  - T-80
priority: medium
type: task
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Drop the Backlog-board assertion from inspect; board discovery stays only in operator-invoked focus-board (nothing binds it post-T-70). Removes the N+1 pane argv-grep from every Change's required path (fragile against board staleness, doc-46).

Decision ledger:
- Scope — doc-51 (operator-approved plan, 2026-07-17). Target: script −~55 lines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 inspect carries no board assertion and test-qq-herdr-home sheds its board scenarios
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Relocated the board discovery (pane list + N+1 per-pane process-info argv-grep loop + the exactly-one-board-pane and board-tab-pane-count assertions) from qq-herdr-home's unconditional path into the focus-board branch. inspect now emits action/repo_root/main_checkout/home_workspace_id/focused and performs no board discovery or focus; focus-board keeps full discovery/focus/confirm and returns board_tab_id/board_pane_id via a jq conditional. set -u kept safe with ${board_tab-}/${board_pane-}. Test asserts inspect's exact 5-key shape AND no board calls, keeps focus-board's 7-key scenario, and moves the no-board/multi-board/split-board failure cases to focus-board. Implemented by codex delegate; owner committed (delegate sandbox could not write linked-worktree git metadata). All 8 shell tests green incl test-ratchet; inspect output independently verified; code-review clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The N+1 Backlog-board argv-grep is off qq-herdr-home inspect's required delivery path (doc-46 staleness risk removed); it now runs only under operator-invoked focus-board, whose behavior is unchanged. AC#1 met: inspect carries no board assertion and the test sheds its inspect board scenarios. Delivered on PR #136. Line count 155->157 (+2): doc-51's -55 estimate is incompatible with retaining focus-board's discovery, which the ticket requires; ratified.
<!-- SECTION:FINAL_SUMMARY:END -->
