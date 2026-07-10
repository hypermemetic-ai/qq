---
id: TASK-32
title: Collapse qq to the minimum entity set
status: In Progress
assignee:
  - task-32-minimum-entity-set
created_date: '2026-07-10 02:00'
updated_date: '2026-07-10 02:00'
labels:
  - simplification
  - hitl
dependencies: []
priority: high
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove every live subsystem that competes with the settled seven-entity model. qq remains a thin harness: Backlog.md owns Tasks; Git/GitHub own Repository, Change, and Check; skills are stateless capabilities; OpenWiki, codebase-memory MCP, and compound own Knowledge; the operator and replaceable agents are Actors. Adopt GitHub Flow and native GitHub ruleset/Actions enforcement rather than any qq-owned gate or lifecycle platform.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

- [Fowler smells in code review](../../research/2026-07-09-fowler-smells-in-code-review.md)

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every retained live file maps to Repository, Task, Change, Check, Skill, Knowledge item, Actor, or the minimal wiring required to expose them
- [ ] #2 The qq/no-mistakes gates, phase/viewer/orchestrator, Git shell analyzer, global Codex configuration manager, and automated idea researcher are absent from live execution and policy surfaces
- [ ] #3 Backlog.md, the substantive skill library, OpenWiki refresh, codebase-memory guidance, compound, and directly useful cockpit/WIP facilities remain usable
- [ ] #4 GitHub Flow is the only lifecycle and a normal GitHub Actions check is the only repository-owned merge prerequisite; the external GitHub ruleset configuration is specified and verified when authorization permits
- [ ] #5 No live rule or tool treats changing Claude, Codex, or another agent runtime as a repository migration
- [ ] #6 A residual inventory proves that nothing outside the minimum entity set survives without an explicit necessity argument
<!-- AC:END -->
