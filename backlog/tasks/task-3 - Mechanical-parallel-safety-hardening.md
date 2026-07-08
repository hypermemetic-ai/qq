---
id: TASK-3
title: Mechanical parallel-safety hardening
status: To Do
assignee: []
created_date: '2026-07-08 14:41'
updated_date: '2026-07-08 20:46'
labels: []
dependencies: []
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Audit ideas/05 Part 2 items 2-4: .qq/state.json producer slots (--producer keyed under producers{}), WIP-ref CAS on refs/wip/<branch>, rail regex tightening (word-boundary matching; add push --delete, reflog expire, update-ref -d). Codex resume scoping folds into the orchestrate pane rework task. OBSERVED FALSE POSITIVE (2026-07-08): the rail pattern-matches the entire command line including quoted argument prose — a 'no-mistakes axi respond --instructions' call was blocked because its quoted instruction text mentioned the branch force-delete pattern as words. Fix should match the actual git invocation (argv-aware or anchored to command position), not substrings anywhere in the line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two producers can stamp qq-phase concurrently without clobbering
- [ ] #2 Rail no longer blocks benign commands that merely mention dangerous phrases
<!-- AC:END -->
