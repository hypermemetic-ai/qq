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
Reported from the meeting-reviewer session, 2026-07-09. The session reported an unattended wave that stalled behind an attended dependency, but the exact task-label chain is historical and not repo-verifiable here: TASK-12 has no attendance label, TASK-7 and TASK-8 have no attendance label, and TASK-9 is afk. CORRECTED MECHANISM: the report attributes this to the --afk filter running after dependency resolution (qq-frontier: status -> assignee -> unmet deps -> claimed -> afk). That ordering is real but is NOT the cause, and reordering the filter would be a no-op: a task is withheld while any dependency is not Done, and dependencies gate on status regardless of label. The actual gap is that nothing WARNS when an attended task is inserted into an unattended task's dependency path, silently halting a background wave. Add that lint (qq-frontier, or a registry check): for every afk task, if any transitive dependency is hitl, say so loudly. The reporter restructured to a DAG to work around it; the hazard survives the workaround.
<!-- SECTION:DESCRIPTION:END -->
