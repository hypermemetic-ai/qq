---
id: TASK-45
title: Wire the delegate status surface into delegate-batch
status: In Progress
assignee: []
created_date: '2026-07-15 23:16'
updated_date: '2026-07-16 03:33'
labels: []
dependencies: []
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement doc-43 (as amended 2026-07-15, round 2) in the delegate-batch skill and cockpit config. Doc-43 is the design authority; this ticket is bounded implementation only. Scope: per-repo per-work-session status file with atomic rewrite at each dispatcher-owned stage boundary; herdr pane report-agent / release-agent presence and state-color calls on ticket work-session placeholder panes (board-driven mode); herdr workspace report-metadata --token stage= calls with --seq and --ttl-ms at every boundary (both modes); pane report-metadata --token stage= on the accountable pane in migrated single-Change mode; idempotent no-focus open of the watch status pane (right split, accountable keeps ~70 percent); stderr capture and the sanctioned --json amendment to the codex exec line; popup accessor keybinding rendering the status files. The sidebar $stage token rows already landed with TASK-42 round 2 and are inert until reported. Sequence values derive from a monotonic per-call value (epoch seconds), never a restarting counter, and both tokens are cleared at terminal disposition, per doc-43's token write contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A real delegated batch renders stage one-liners end to end: status pane table, Space-row $stage token, and report-agent presence/color, each observed live
- [ ] #2 Degradation paths behave per doc-43: herdr outage, status-file write failure, retired pane, missing placeholder, silent delegate death
- [ ] #3 The automation contract is demonstrably unchanged: envelope file present, single completion wake, same sandbox flags, no free text on the delegate command line
- [ ] #4 Blocked/failed escalation raises a notification under the honest-fallback rule
- [ ] #5 Migrated single-Change mode observed live: the accountable session's pane and work-session $stage tokens render and clear, and the popup accessor renders the status file
- [ ] #6 Token lifecycle verified live: --clear-token removes the stage row at terminal disposition; an orphaned token expires via a shortened --ttl-ms after simulated owner death; --seq uses epoch seconds so a restarted owner's reports are not ignored
<!-- AC:END -->
