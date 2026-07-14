---
id: TASK-31
title: Make qq-openwiki agent-file snapshots durable
status: In Progress
assignee: []
created_date: '2026-07-14 03:01'
updated_date: '2026-07-14 03:08'
labels: []
dependencies: []
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
- [ ] #1 Snapshot directory lives under XDG_STATE_HOME (durable across reboot), keyed per repository
- [ ] #2 On startup qq-openwiki detects a leftover snapshot from a crashed run and restores it before its gates run
- [ ] #3 Normal-run restore semantics and failure exit codes unchanged
- [ ] #4 tests/test-qq-openwiki.sh covers the crash-then-restore path
<!-- AC:END -->
