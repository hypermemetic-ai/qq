---
id: TASK-26
title: Warn when a hitl task sits on an afk dependency path
status: To Do
assignee: []
created_date: '2026-07-09 14:41'
labels:
  - tooling
  - parallel-ok
  - afk
dependencies: []
priority: medium
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported from the meeting-reviewer session, 2026-07-09. The reporter's historical concrete chain was TASK-12(afk) -> TASK-7(afk) -> TASK-9(hitl) -> TASK-8(afk), and `qq-frontier --afk` returned empty after TASK-7. That exact task-label chain is historical and not repo-verifiable here: TASK-12 has no attendance label, TASK-7 and TASK-8 have no attendance label, and TASK-9 is afk. CORRECTED MECHANISM: the report attributes this to the --afk filter running after dependency resolution (qq-frontier: status -> assignee -> unmet deps -> claimed -> afk). That ordering is real but is NOT the cause, and reordering the filter would be a no-op: a task is withheld while any dependency is not Done, and dependencies gate on status regardless of label. The actual gap is that nothing WARNS when a non-Done attended task is inserted into an unattended task's dependency path, silently halting a background wave. Add that lint (qq-frontier, or a registry check): for every afk task, if any transitive dependency is both hitl and not Done, say so loudly. `qq-frontier` withholds a task only while a dependency's status is not Done, so a hitl ancestor that is already Done cannot strand anything; warning on it would be a false positive and would train the operator to ignore the lint. Done hitl ancestors do NOT warn. The reporter restructured to a DAG to work around it; the hazard survives the workaround.
<!-- SECTION:DESCRIPTION:END -->
