---
id: T-86
title: 'qq-openwiki: git is the snapshot store'
status: Done
assignee: []
created_date: '2026-07-17 17:18'
updated_date: '2026-07-18 16:48'
labels:
  - base-batch
dependencies:
  - T-80
priority: medium
type: task
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the ~120-line durable-snapshot protocol with git restore under the script's existing preconditions plus a ~10-line startup deviation check; add the missing clean-tree precondition for --init. Keep flock single-writer, provider pin, branch/freshness guards, both temporary-debt notes.

Decision ledger:
- Replacement and keep-list — doc-51 (operator-approved plan, 2026-07-17). Target: 266→~130.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Snapshot protocol removed, preconditions as code, test shrinks accordingly, keep-list intact
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The ~120-line durable-snapshot protocol in bin/qq-openwiki replaced by git as the snapshot store: git restore --source=<captured HEAD> --staged --worktree (excluding openwiki/**), a startup deviation check that refuses a drifted worktree so restore is always to a known point, and the previously-missing clean-tree precondition for --init. Kept intact: flock single-writer, provider pin, dedicated-branch guard, origin/main freshness guard, both dated temporary-debt notes. bin/qq-openwiki 266->137. Verified: shellcheck + full suite 12/12, ratchet-neutral. Code-review found and fixed one high-severity data-loss defect: the deviation check used git status (omits ignored files), so an ignored CLAUDE.md/AGENTS.md would be silently deleted with no restore; now uses --ignored and fails closed. Delivered on PR #140.
<!-- SECTION:FINAL_SUMMARY:END -->
