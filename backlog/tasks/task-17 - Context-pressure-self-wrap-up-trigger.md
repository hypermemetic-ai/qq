---
id: TASK-17
title: Context-pressure self-wrap-up trigger
status: To Do
assignee: []
created_date: '2026-07-08 22:37'
updated_date: '2026-07-09 00:50'
labels:
  - afk
  - parallel-ok
dependencies: []
priority: medium
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Promoted from ideas/README.md (banked 2026-07-07, was never in the registry — surfaced by operator 2026-07-08). Make agents context-aware: as a session approaches ~200-250k tokens it should proactively wrap up and hand off on its own rather than beginning fresh work deep in a window ('you shouldn't start here'). handoff is the transfer; the Stop-hook WIP snapshot is the safety net; this task builds the TRIGGER that fires the wrap-up. Design questions: where the trigger lives (statusline context meter, hook, or a methodology rule threaded into skills), and what 'wrap up' means mid-task (finish the verifiable unit, then handoff — never abandon un-green work).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent nearing the threshold stops starting new work and initiates handoff on its own
- [ ] #2 The rule is threaded into the methodology and the relevant skills (orchestrate, executing-plans, handoff)
<!-- AC:END -->
