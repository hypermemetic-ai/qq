---
id: TASK-8.1
title: 'Orchestrate skill rewrite: worker-pane lifecycle'
status: To Do
assignee: []
created_date: '2026-07-09 00:07'
labels:
  - slice
dependencies: []
parent_task_id: TASK-8
priority: high
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Slice 1 of TASK-8 (pilot). Rewrite skills/orchestrate/SKILL.md to the worker-pane lifecycle in docs/plans/2026-07-08-orchestrate-codex-panes.md: § Who-does-what + § 3 Build (herdr agent start cx-<branch> --cwd <tree> --tab <conductor-tab> --split, trust prompt, brief via .qq/handoffs/<n>-brief.md, send + send-keys Enter, wait --status idle, file-based report), § 4 Verify repair in-pane, pane topology (tab-per-task, ~3 panes/tab cap), observe primitives (terminal session observe = debug/watch only), resume-by-id for dead panes. Drop the stdin-hang section and every codex exec invocation; align step 0 with all-gated routing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No codex exec invocation remains in skills/orchestrate/SKILL.md
- [ ] #2 Lifecycle steps 1-7 (start/trust/handoff/wait/report/repair/teardown) each present and unambiguous
- [ ] #3 .qq/handoffs/ brief+report naming stated once, referenced everywhere else
- [ ] #4 resume --last absent; dead-pane recovery documented as codex resume <session-id> via herdr agent get
<!-- AC:END -->
