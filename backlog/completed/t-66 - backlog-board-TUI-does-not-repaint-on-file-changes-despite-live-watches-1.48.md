---
id: T-66
title: backlog board TUI does not repaint on file changes despite live watches (1.48)
status: Done
assignee: []
created_date: '2026-07-17 00:33'
updated_date: '2026-07-17 00:45'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator observation (2026-07-16, zero-write check from doc-46): the qq board TUI started 11:34 still rendered old tasks after the active board had been emptied by the days sweeps — no repaint, despite holding live inotify watches on backlog/tasks (verified in the TASK-59 diagnosis) and the back-274 live-reload fix being present in the installed 1.48.0.

Reproduce hermetically: scratch copy of a backlog repo, run backlog board under a PTY, write/modify a task file, capture frames before and after — determine whether the watcher events are consumed but the repaint never fires, and whether any event class (create vs modify vs rename) repaints. Then fix locally or file upstream with the reproduction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The repaint failure is reproduced (or refuted) in a hermetic PTY harness with captured frames
- [x] #2 A local fix or an upstream issue with the reproduction is recorded on this task
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced hermetically (PTY + strace, scratch repo): IN_MODIFY and IN_CREATE repaint; IN_MOVED_FROM and IN_DELETE are read off the inotify fd but trigger no reconciliation, and the in-memory store is upsert-only, so removed Tasks are never evicted — deterministic, no escape hatch short of restart. Sweeps move files out of backlog/tasks, exactly the ignored class, confirming the operator's observation. Upstream: issue #786 closed by BACK-547 / PR #788 (commit 9c29c4c9, 2026-07-14) which matches these findings exactly; latest release v1.48.0 predates it. Disposition: no local patch, no new upstream issue; restart open boards after sweeps until the next release, then brew upgrade backlog-md. Evidence frames + trace under the session scratchpad.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Board repaint defect reproduced and root-caused (removal events consumed but never applied; upsert-only store). Upstream fix already merged (BACK-547/PR #788), unreleased as of v1.48.0. Convention until release: restart boards after sweeps; upgrade at next release.
<!-- SECTION:FINAL_SUMMARY:END -->
