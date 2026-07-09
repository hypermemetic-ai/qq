---
id: TASK-11
title: >-
  Lifecycle visibility: vertical end-to-end view on the right (registry → loop →
  gate → PR)
status: To Do
assignee: []
created_date: '2026-07-08 15:53'
updated_date: '2026-07-09 00:32'
labels:
  - parallel-ok
  - afk
dependencies:
  - TASK-8
priority: high
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator (07-08, restated after a scope-narrowing miss): 'I want the full lifecycle tracked.' The original ask — 'the current view is basically pointless, should be more fleshed out and visible as a vertical pipeline on the right' — referred to the qq-phase statusline, which merges LOOP position and GATE position; the task was mis-titled 'Gate visibility' at creation and silently narrowed to the gate's 9 steps. Correct scope: one vertical surface tracking a unit of work end to end — registry state (To Do → claimed/In Progress → Done), loop phase (Triage…Compound via qq-phase producer slots, per task/worktree), gate segment when landing (steps + fix rounds + live activity + PARKED alarm), and PR tail (open → checks-passed → merge → Done flip, closing when TASK-16 lands). Data sources all exist: backlog/, .qq/state.json (multi-producer since task-3), axi status, gh; herdr session.snapshot/layout.updated for pane state. REUSE-FIRST for the gate segment stands: 'no-mistakes attach' is already wired as a right-side pane (done 07-08, live-trialed on the task-3 landing) — don't re-render gate internals; embed or summarize with attach a keypress away. Known gaps from first real use: no explicit fix-round counter; parked-state loudness unverified; single-run only (wave lands concurrently). Specimen of the original failure: ~2h review, 11 fix rounds, 1 relayed decision — ambient signal was 'gate:review ⏳' (the older 70+ minute, 7-round figure was a mid-run snapshot). Multi-task: the wave means several lifecycles in flight at once; the view must roll them up (one rail per active task) — intersects TASK-8's tab-per-task topology.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every active task shows its full lifecycle on one vertical rail: registry status, loop phase, gate step (when landing), PR state — at a glance, no polling
- [ ] #2 From across the room it answers: is it moving, what is it doing right now (incl. fix rounds + live activity inside gate steps), does it need me (unmissable parked/ask-user/blocked alarm), how long has it been
- [ ] #3 Reuse-first for the gate segment: attach (already wired) or axi-status summary — custom gate rendering only against the written gap list
- [ ] #4 Multiple concurrent lifecycles (wave) roll up on the same surface without losing the needs-me signal
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Surface overlap with TASK-8 — see its notes; coordinate via herdr or sequence after it. herdr 0.7.2+ (upgraded before the wave) helps directly: ui.sidebar_collapsed_mode='hidden' and ui.hide_tab_bar_when_single_tab reclaim the screen real estate a right-hand vertical pipeline pane needs; if the view becomes a live socket client rather than a polling pane, use session.snapshot + layout.updated (see 'herdr api schema'). 0.7.3 fixes done-agent seen-state over the socket API (sidebar truthfulness).
<!-- SECTION:NOTES:END -->
