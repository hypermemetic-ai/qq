---
id: TASK-25
title: Make parallel-ok load-bearing or add explicit mutual exclusion
status: To Do
assignee: []
created_date: '2026-07-09 14:41'
labels:
  - tooling
  - parallel-ok
  - hitl
dependencies: []
priority: high
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported from the meeting-reviewer session, 2026-07-09, and re-verified against the review base and this branch: the 'parallel-ok' label is decorative. It appears in 15 backlog task files at review base b4433d250dff9492e15ed3e268a7e1c3fa79344b and 20 in this branch after TASK-24 through TASK-28, with two qq-methodology.md prose references and 0 matches in bin/ or skills/ ('rg -n parallel-ok bin skills' returns nothing). bin/qq-frontier drops a task when that task itself is claimed (a task-<id> branch exists), but two UNCLAIMED tasks that collide on the same files are both eligible and can be dispatched into the same wave. That leaves two bad workarounds: a false dependency edge, which over-serializes and inverts priority, or conductor prose, which nothing checks. The reporter's concrete case lives in the MEETING-REVIEWER repo's registry, not qq's -- its TASK-11 collides with its TASK-7 on one file and its TASK-8 on two others, yet all three must be co-eligible, so the mutex now lives as prose in that repo's task files. Those ids are NOT qq task ids and must not be resolved against this registry; they are cited as a field report, not as a design basis. Decide: make 'parallel-ok' actually load-bearing, or add a first-class mutex/exclusive-with field that qq-frontier reads and a wave dispatcher honors. A triage invariant the methodology enforces in prose and nothing enforces in code is worse than no label.
<!-- SECTION:DESCRIPTION:END -->
