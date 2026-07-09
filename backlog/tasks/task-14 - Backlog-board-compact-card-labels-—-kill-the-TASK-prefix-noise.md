---
id: TASK-14
title: 'Backlog board: compact card labels — kill the TASK- prefix noise'
status: In Progress
assignee:
  - task-14-board-labels
created_date: '2026-07-08 17:30'
updated_date: '2026-07-09 00:02'
labels:
  - parallel-ok
dependencies: []
priority: low
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator (07-08): the board makes poor use of horizontal space — 'TASK-x' eats most of a card while the prefix adds no information when task is the only type. Want a dense scheme that keeps cards real small: bare id plus a super-shortened label (single word, consonant-skeleton, aggressive abbreviation — survey prior art: tracker key schemes, tmux window naming, abbreviation algorithms). Avenues to evaluate: Backlog.md config (custom/empty id prefix?), board rendering options, an upstream feature request/PR to MrLesk/Backlog.md, or a thin qq-side board wrapper. ALSO (07-08, same cockpit-surface concern): backlog-board was launched via 'herdr agent start', so it shows up in herdr's agents list and eats sidebar space although it is not an agent — find the non-agent way to run a utility pane (plain pane launch, an exclude flag, or a herdr feature request) so the sidebar stays reserved for actual agents. Capture only — not addressed yet.
<!-- SECTION:DESCRIPTION:END -->
