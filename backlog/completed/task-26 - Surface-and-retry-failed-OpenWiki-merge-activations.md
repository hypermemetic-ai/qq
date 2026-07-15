---
id: TASK-26
title: Surface and retry failed OpenWiki merge activations
status: Done
assignee:
  - '@codex'
created_date: '2026-07-14 03:01'
updated_date: '2026-07-14 03:36'
labels: []
dependencies: []
documentation:
  - doc-35
modified_files:
  - bin/qq-openwiki-activate
  - tests/test-qq-openwiki-activate.sh
  - >-
    backlog/tasks/task-26 -
    Surface-and-retry-failed-OpenWiki-merge-activations.md
  - >-
    backlog/docs/plans/doc-35 -
    Plan-—-Surface-and-retry-failed-OpenWiki-merge-activations.md
  - backlog/docs/plans/assets/doc-35/plan-spec.json
  - backlog/docs/plans/assets/doc-35/plan.bpmn
  - backlog/docs/plans/assets/doc-35/plan.png
  - backlog/docs/plans/assets/doc-35/completions.json
  - backlog/docs/plans/assets/doc-35/conformance.md
priority: high
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the 2026-07-13 architecture review: qq-openwiki-activate writes its dedupe marker (action: dispatching) before herdr dispatch and is invoked from the browser protocol handler with no visible stderr, so a failed dispatch permanently blackholes the merge with no operator signal.
Operator-settled decisions: failed dispatch rewrites the marker to a retryable failed state that the next activation retries; every ActivationError raises a herdr desktop notification (herdr notification show, as qq-herdr-pull does).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A dispatch failure after marker creation leaves a marker state that a subsequent activation retries instead of ignoring
- [x] #2 A completed dispatch still dedupes: already-dispatched merges remain ignored
- [x] #3 Every ActivationError surfaced from the protocol-handler entry path raises a herdr desktop notification
- [x] #4 tests/test-qq-openwiki-activate.sh covers failed-dispatch retry and notification emission
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Encode explicit failed-marker retry while retaining completed dispatch dedupe.
2. Surface every protocol-entry ActivationError through a Herdr desktop notification.
3. Add regression coverage that fails on the old retry and notification behavior.
4. Run focused and repository Checks, independent review, strict plan conformance, Task finalization, and one-PR delivery.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented explicit failed-marker retry while preserving non-failed marker dedupe, and centralized best-effort Herdr notifications for protocol-entry ActivationError failures. The focused activation harness first reproduced the missing notification, then passed failed-run and failed-detection retry, completed-dispatch dedupe, and representative notification paths.

All eight repository shell harnesses, 18 BPMN tests, Python compilation, Bash syntax, ShellCheck, plan lint/lossless rendering, visual inspection, and diff hygiene passed. Fresh-context implementation review found one stale plan-evidence range; it was corrected, regenerated, and exact-delta review found no remaining material findings. Closeout review then corrected the conformance repair branch from done to skipped; strict conformance passed 14/14 with no divergence or unknown elements, and the exact correction review found no remaining material findings. PR #70 is open, unmerged, mergeable, CLEAN, and has no configured GitHub checks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made failed OpenWiki merge dispatches explicitly retryable, preserved completed-dispatch dedupe, and surfaced every protocol-entry ActivationError through Herdr. Focused and repository Checks, independent implementation and closeout reviews, and strict 14/14 BPMN conformance passed in PR #70.
<!-- SECTION:FINAL_SUMMARY:END -->
