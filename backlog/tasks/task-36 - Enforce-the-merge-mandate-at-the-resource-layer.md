---
id: TASK-36
title: Enforce the merge mandate at the resource layer
status: To Do
assignee: []
created_date: '2026-07-14 17:04'
updated_date: '2026-07-14 17:04'
labels: []
dependencies: []
documentation:
  - doc-38
  - doc-39
priority: high
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per the doc-39 enforcement-layer lesson: the exact enforcement of "only the operator merges" belongs at the resource that owns the invariant, not in string parsing. Enable branch protection on main (pull request required, direct pushes rejected, CI checks required before merge), establish that agent-held credentials cannot merge pull requests, and formally reclassify bin/qq-claude-guard as a drift-net per CONCEPTS.md — declared threat model, lexer-arcana finding classes owner-declined by default. The guard keeps its fast-local-feedback role unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 main requires a pull request with passing CI checks and rejects direct pushes
- [ ] #2 Agent-held credentials cannot merge pull requests on this Repository
- [ ] #3 The guard's drift-net role, threat model, and declined finding classes are documented in the guard and doc-39 is linked from doc-38
<!-- AC:END -->
