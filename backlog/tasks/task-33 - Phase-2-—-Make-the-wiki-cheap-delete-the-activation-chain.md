---
id: TASK-33
title: Phase 2 — Make the wiki cheap (delete the activation chain)
status: To Do
assignee: []
created_date: '2026-07-14 05:10'
labels: []
dependencies:
  - TASK-32
documentation:
  - doc-38
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per doc-38 Phase 2: delete the merge-triggered activation chain (userscript, qq-openwiki:// protocol and desktop handler, bin/qq-openwiki-activate.py, installer sections, tests). Wiki refresh becomes on-demand plus optional schedule, delivered as an ordinary docs PR the operator merges. Self-merge exception removed; openwiki-maintainer skill reduced to ~200 words. Guard wrapper, BPMN wiki diagrams, and --check retained.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The activation chain and self-merge machinery are deleted; installer and tests updated
- [ ] #2 Wiki refresh runs on demand and delivers as an ordinary operator-merged PR
- [ ] #3 openwiki-maintainer skill states the reduced procedure only
<!-- AC:END -->
