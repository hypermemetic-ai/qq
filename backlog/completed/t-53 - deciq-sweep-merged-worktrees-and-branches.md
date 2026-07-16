---
id: T-53
title: 'deciq: sweep merged worktrees and branches'
status: Done
assignee: []
created_date: '2026-07-16 03:57'
updated_date: '2026-07-16 17:09'
labels: []
dependencies: []
priority: medium
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Twelve registered worktrees on merged branches plus about 20 merged local branches have accumulated under `~/.herdr/worktrees/deciq`. One stalled unmerged worktree, `feat/task-22-logic-promotion`, also needs a disposition.

T-49's retire-at-source mechanism prevents recurrence going forward; this task is the one-time backlog.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Merged worktrees and branches are removed behind T-49's rails
- [x] #2 The disposition of the unmerged feat/task-22-logic-promotion worktree is recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sweep behind doc-44 rails, every rail re-verified immediately before each removal: 12 merged clean attached worktrees removed unforced; 31 merged branches deleted with git branch -d only. Left intact with reasons: fix/task-31-structured-output-compat worktree+branch (herdr work session w4A hosts a live idle claude agent — rail); feat/task-25-zoom-enrollment (unmerged, dirty, live work session w3Z); unmerged non-task branches chunk-5-microsoft-oauth and chunk-6-auto-dispatch (out of scope).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
deciq worktree/branch backlog cleared: 12 merged worktrees and 31 merged branches removed behind T-49/doc-44 rails; nothing forced. Disposition of feat/task-22-logic-promotion recorded: left intact — unmerged, unpushed only-copy (tip 3c963e6, 2026-07-15, no origin branch); recommend a T-52-style push-or-decline decision; its continuation lives in the deciq-logic repository.
<!-- SECTION:FINAL_SUMMARY:END -->
