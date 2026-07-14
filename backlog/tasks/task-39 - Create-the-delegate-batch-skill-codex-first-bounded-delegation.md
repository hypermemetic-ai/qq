---
id: TASK-39
title: Create the delegate-batch skill (codex-first bounded delegation)
status: To Do
assignee: []
created_date: '2026-07-14 22:46'
labels: []
dependencies: []
documentation:
  - doc-42
  - doc-41
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per doc-42: a stateless skill owning batch delegation on the engine/glass architecture. It composes work-order briefs from aligned Tasks; selects the runtime codex-first (codex exec, workspace-write sandbox, dedicated worktree per writing ticket; a Claude subagent only when the work needs harness-native tools or judgment beyond plan bounds); requires a completion envelope (changed files, Checks run with results, unresolved risks, branch and worktree); bounds writing-ticket concurrency at 3–5; selects sequential vs fanout per doc-41's work-shape table; and covers both entry points (aligned new-work batch; board-driven dispatch) plus the dispatcher posture (the accountable session stays in the project home — an explicit exception to deliver-change step 1).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 skills/delegate-batch/SKILL.md exists in house trigger-sentence style and covers work-order brief composition, codex-first runtime selection, the completion envelope, one worktree per writing ticket, the 3–5 concurrency bound, sequential-vs-fanout selection, both entry points, and the dispatcher posture
- [ ] #2 bin/install.sh links the skill for both runtimes and prunes it cleanly on removal
- [ ] #3 A real ticket batch executes end-to-end through a codex delegate under the skill and returns a conforming completion envelope; the live Check is recorded in task notes
- [ ] #4 Repository suites pass
<!-- AC:END -->
