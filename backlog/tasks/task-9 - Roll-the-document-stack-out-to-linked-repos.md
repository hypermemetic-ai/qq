---
id: TASK-9
title: Roll the document stack out to linked repos
status: To Do
assignee: []
created_date: '2026-07-08 14:41'
updated_date: '2026-07-09 01:40'
labels:
  - afk
  - parallel-ok
dependencies: []
priority: medium
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend bin/qq-link.sh repo wiring: backlog init (agent-instructions none), .no-mistakes.yaml command wiring for registry check + openwiki refresh, methodology import already live. TASK-7 research decided the refresh engine should be the codex-exec-driven, sub-only script; linked repos should reuse that per repo because Codex auth is machine-global. meeting-reviewer first. EXTENDED 2026-07-08: repo hygiene is part of linking — every linked/new GitHub repo sets delete-branch-on-merge (gh repo edit --delete-branch-on-merge); applied to qq + meeting-reviewer by hand on 2026-07-08, and task-9 folds it into the link script for the rest.
<!-- SECTION:DESCRIPTION:END -->
