---
id: TASK-31
title: Make qq-openwiki agent-file snapshots durable
status: Done
assignee: []
created_date: '2026-07-14 03:01'
updated_date: '2026-07-14 03:26'
labels: []
dependencies: []
modified_files:
  - backlog/tasks/task-31 - Make-qq-openwiki-agent-file-snapshots-durable.md
  - bin/qq-openwiki
  - tests/test-qq-openwiki.sh
priority: medium
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the 2026-07-13 architecture review: qq-openwiki snapshots AGENTS.md/CLAUDE.md under XDG_RUNTIME_DIR/TMPDIR with trap-based restore; SIGKILL or reboot mid-run loses the snapshot and leaves the operator symlink replaced by a regular-file shadow.
Operator-settled decision: store snapshots under XDG_STATE_HOME and auto-restore a stale snapshot from a crashed prior run at startup, before the clean-worktree gates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Snapshot directory lives under XDG_STATE_HOME (durable across reboot), keyed per repository
- [x] #2 On startup qq-openwiki detects a leftover snapshot from a crashed run and restores it before its gates run
- [x] #3 Normal-run restore semantics and failure exit codes unchanged
- [x] #4 tests/test-qq-openwiki.sh covers the crash-then-restore path
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented an atomically activated per-Repository snapshot under the XDG state home, with retry-safe cleanup and NUL-delimited originating-worktree metadata. Startup validates the saved physical worktree and shared Git common directory before restoring its instruction files and generated workflow ahead of Repository gates, including when recovery is triggered from a sibling worktree. The forced-SIGKILL regression failed against the old behavior, and the sibling variant reproduced and then verified the review-found cross-worktree failure. All eight repository shell harnesses, focused ShellCheck, and diff hygiene passed. Fresh read-only review found one P1 cross-worktree defect; the in-scope correction received an exact-delta re-review with no material findings. PR #71 is open, mergeable, CLEAN, with no configured GitHub checks. Hands-on UAT was skipped in this delegated session; the crash/restart outcome is covered autonomously.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made qq-openwiki agent-file snapshots durable across crashes and reboots, restored stale setup before gates in the correct originating worktree, preserved normal cleanup and generator failure status behavior, and added forced-crash plus linked-worktree regression coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
