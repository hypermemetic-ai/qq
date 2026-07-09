---
id: TASK-15
title: Adopt herdr 0.7.3
status: To Do
assignee: []
created_date: '2026-07-08 22:37'
labels:
  - cockpit
dependencies: []
priority: medium
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Binary upgrade happens at the wave boundary (operator paste: brew upgrade + server restart, outside herdr). Repo-side adoption: cockpit config — ui.sidebar_collapsed_mode / ui.hide_tab_bar_when_single_tab where they fit the cockpit design; keybinding scheme per operator direction judged 2026-07-08: alt+N → tabs (reliable ESC-prefix everywhere), ctrl+N → workspaces/sessions IF the Ghostty kitty-protocol binding test passes (prefix+N fallback), shift+digit rejected structurally (shift+1 IS '!' — a global binding would eat typed punctuation); wire herdr completion bash into cockpit/shell. Verify the herdr-managed integration hook (~/.claude/hooks/herdr-agent-state.sh, HERDR_INTEGRATION_VERSION) re-pins after upgrade. New socket primitives (terminal session observe/control, session.snapshot, layout.updated) are recorded as design substrate in task-8/11 notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cockpit herdr config with the new ui options + keybinding scheme lands through the gate
- [ ] #2 ctrl+N-under-Ghostty binding test result recorded; scheme adjusted accordingly
- [ ] #3 Integration hook verified current post-upgrade
<!-- AC:END -->
