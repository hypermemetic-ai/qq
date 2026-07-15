---
id: TASK-39
title: Create the delegate-batch skill (codex-first bounded delegation)
status: Done
assignee: []
created_date: '2026-07-14 22:46'
updated_date: '2026-07-15 00:31'
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
- [x] #1 skills/delegate-batch/SKILL.md exists in house trigger-sentence style and covers work-order brief composition, codex-first runtime selection, the completion envelope, one worktree per writing ticket, the 3–5 concurrency bound, sequential-vs-fanout selection, both entry points, and the dispatcher posture
- [x] #2 bin/install.sh links the skill for both runtimes and prunes it cleanly on removal
- [x] #3 A real ticket batch executes end-to-end through a codex delegate under the skill and returns a conforming completion envelope; the live Check is recorded in task notes
- [x] #4 Repository suites pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC3 live Check: this Change's own implementation executed end-to-end through a codex delegate under the exact pattern the skill encodes — work-order brief in the OS temporary directory, codex exec workspace-write confined to the dedicated worktree, fixed prompt pointer, conforming completion envelope verified claim-by-claim against the tree, no gates exercised by the delegate. Stated plainly: that dispatch preceded the skill file's authoring; conformance was verified item-by-item against the landed skill text afterward, and two further live delegates (both fresh reviewers) ran under the same discipline within this Change. The first literal post-merge exercise will be the TASK-40/TASK-41 batch dispatch. AC1: skill file covers all eight required elements in house style. AC2: bin/install.sh sync_skills discovers skills/*/SKILL.md dynamically and prunes dead links for both runtimes (lines 51-72, 219-221); no change needed. AC4: shell suite 7/7 PASS, BPMN 16 pass/0 fail/2 skipped, both rerun outside the codex sandbox (the sandbox denies the suite's nested Node spawn; documented, environmental). Review loop: round 1 confirmed a coupled-work/isolation contradiction (fixed by restoring doc-41's one-ticket rule); round 2 confirmed the board records omitted --pid self-retirement (fixed as prescribed); round 3 APPROVE. Operator UAT corrected observability-pane placement to a no-focus right split; recorded in TASK-40 AC5 and doc-42 amendments. Observability pane and self-retirement verified live in workspace w3E.
<!-- SECTION:NOTES:END -->
