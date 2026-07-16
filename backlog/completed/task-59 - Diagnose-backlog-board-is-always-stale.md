---
id: TASK-59
title: 'Diagnose: backlog board is always stale'
status: Done
assignee: []
created_date: '2026-07-16 16:43'
updated_date: '2026-07-16 17:22'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From Ideas doc-1 (2026-07-15 23:43): "backlog board is always stale. if cause isnt obvious, test adversarially."

Diagnose why the Backlog board (browser board on port 6420 and/or backlog board CLI) shows stale state. Candidate causes to verify or refute with evidence: tasks are born and finalized inside Change worktrees and only reach the main checkout after merge+pull (structural staleness); the board server caches or does not watch files; the primary main checkout lags origin after browser merges. Adversarial testing is authorized read-only; any write experiment must be proposed first. Deliverable: verified cause plus a bounded fix proposal recorded on this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The staleness cause is demonstrated with a reproducible observation
- [x] #2 A bounded fix or convention change is proposed on this task for operator disposition
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis doc: doc-46. Structural cause CONFIRMED with reproducible observations: no checkout a board can read ever contains the present (untracked mints are invisible to cross-branch scan; in-flight Task files ride Change worktrees; merge-to-pull lag up to ~11 h). Instance finding: the board running at complaint time was another project's (deciq), 12+ h old; its cross-branch view being frozen at load is tagged plausible→likely in doc-46, not confirmed. Version cause REFUTED for live file-watching (1.48 ships the back-274 fix; inotify watches observed) — but whether the TUI actually repaints on watcher events could not be verified read-only and remains OPEN, with a zero-write operator check recorded in doc-46 (does the running qq board show TASK-56..61?). If that check fails, a repaint defect is an additional confirmed cause. Three bounded fix options (incl. a convention decision on where in-flight Task-file status lives — tensions with the Task-files-ride-the-Change precedent) recorded for operator disposition.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Structural staleness demonstrated: boards render the last merged-and-pulled past by construction. One residual remains open pending the zero-write operator repaint check in doc-46; cause evidence and bounded fixes recorded there; convention decision left to the operator.
<!-- SECTION:FINAL_SUMMARY:END -->
