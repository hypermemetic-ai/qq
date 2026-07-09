---
id: TASK-8.1
title: 'Orchestrate skill rewrite: worker-pane lifecycle'
status: Done
assignee:
  - task-8-orchestrate-panes
created_date: '2026-07-09 00:07'
updated_date: '2026-07-09 00:13'
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
- [x] #1 No codex exec invocation remains in skills/orchestrate/SKILL.md
- [x] #2 Lifecycle steps 1-7 (start/trust/handoff/wait/report/repair/teardown) each present and unambiguous
- [x] #3 .qq/handoffs/ brief+report naming stated once, referenced everywhere else
- [x] #4 resume --last absent; dead-pane recovery documented as codex resume <session-id> via herdr agent get
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-07-08: rg 'codex exec|resume --last|/dev/null' skills/orchestrate/SKILL.md -> no matches; lifecycle steps 1-7 at SKILL.md:84-119; .qq/handoffs/ convention defined once in Build intro (5 references); dead-pane recovery = herdr agent get -> agent_session.value -> codex resume <session-id>, --last banned (SKILL.md:112-118).
<!-- SECTION:NOTES:END -->
