---
id: TASK-27
title: 'Frontier order has no queue head, only ordinal ties'
status: To Do
assignee: []
created_date: '2026-07-09 14:41'
labels:
  - tooling
  - parallel-ok
  - hitl
dependencies: []
priority: medium
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported from the meeting-reviewer session, 2026-07-09, and verified by reading bin/qq-frontier and running it against the review base and this branch: bin/qq-frontier sorts by (priority rank, ordinal), so equal-priority tasks break ties on ordinal and there is no way to say 'this task is the head of the queue' except by hand-tuning ordinals. The reporter's example is from the MEETING-REVIEWER repo's registry, NOT qq's: there, its registry prose said TASK-12 lands first while 'qq-frontier --json' listed TASK-6 first, because both are priority:high and 6000 < 12000. Those ids must not be resolved against this registry. Note how it surfaced: the gate caught the contradiction by RUNNING the tool; the author had only read it. The current HEAD frontier shows the actual contract: high tasks order by ordinal (TASK-11 at 11000, TASK-22 at 19000, TASK-25 at 22000), then medium tasks order by ordinal (TASK-9 at 9000 before later medium ordinals). Decide whether the registry should express queue order directly, or whether ordinal-as-order is the contract and the conductor must stop writing prose that contradicts it.
<!-- SECTION:DESCRIPTION:END -->
