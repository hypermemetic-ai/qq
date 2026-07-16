---
id: TASK-50
title: Audit linked projects for drift from the recent qq change wave
status: To Do
assignee: []
created_date: '2026-07-16 03:18'
labels: []
dependencies: []
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
qq's operator-global surfaces serve every project on this machine: skills symlink into ~/.claude/skills, bin helpers sit on PATH, and the cockpit config symlinks into ~/.config — deciq alone had three live work sessions during the 2026-07-15 session. The recent change wave (Phase-4 engine/glass split, delegate-batch, deliver-change diet rounds, the delegate status surface config with sidebar token rows and popup bindings, direct-navigation keybindings, glossary sweeps) changed shared behavior that linked projects may silently depend on or lack required structure for: project-home and dedicated-board-tab conventions, work-session labels, and display-specific cockpit assumptions such as the popup geometry tuned against one terminal's 104x33 tiled area. Inventory the linked projects and check each qq contact point.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An inventory of linked projects (repositories with qq-managed homes, boards, or live sessions) exists with evidence
- [ ] #2 Each inventoried project is checked against the recent qq changes' contact points — skills, bin helpers, cockpit config, home and board conventions — with an explicit per-project statement
- [ ] #3 Regressions or gaps are fixed in place when trivial, otherwise filed as their own tickets
<!-- AC:END -->
