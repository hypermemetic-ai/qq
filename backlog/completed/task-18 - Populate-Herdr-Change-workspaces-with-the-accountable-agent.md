---
id: TASK-18
title: Populate Herdr Change workspaces with the accountable agent
status: Done
assignee:
  - '@codex'
created_date: '2026-07-13 02:40'
updated_date: '2026-07-13 03:19'
labels: []
dependencies: []
documentation:
  - doc-27
modified_files:
  - bin/qq-herdr-pull
  - tests/test-qq-herdr-pull.sh
  - skills/deliver-change/SKILL.md
  - cockpit/README.md
priority: high
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Herdr worktree workspace currently opens with only its placeholder shell while the accountable Codex agent continues in the source workspace. Make deliver-change place the existing accountable agent pane into the returned Change workspace without handing off lifecycle ownership, and anchor subsequent work to the returned checkout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The existing qq-herdr-pull command preserves its operator-facing N/next behavior and also offers an agent-facing workspace-adoption mode.
- [x] #2 Agent-facing adoption refuses populated or ambiguous target workspaces, moves the accountable pane before closing the placeholder, and reports failures nonzero without losing either pane.
- [x] #3 deliver-change invokes the shared mover for a newly created or opened Change workspace and explicitly anchors subsequent commands and edits to the returned checkout.
- [x] #4 Focused mock and live validation cover both caller modes and failure safety, validate the Skill, and receive fresh-context review before delivery.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Regenerate and approve the expanded Herdr handoff plan. 2. Add a fail-fast agent workspace-adoption mode to qq-herdr-pull while preserving existing detached operator bindings. 3. Update deliver-change to call the shared mover and anchor work to the returned checkout; document both modes. 4. Run focused mock and live checks plus Skill validation. 5. Run fresh-context review, resolve verified in-scope findings, record BPMN conformance, finalize the Task, and deliver one green pull request.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation and focused validation: qq-herdr-pull now retains N/next operator behavior and adds fail-fast --workspace adoption. The mock suite covers successful replacement, current-workspace no-op, non-agent callers, multi-pane/occupied/busy targets, move failure, close failure, numeric selection, priority selection, and operator best-effort errors. A live round trip moved this Codex pane w1E -> temporary w1G -> w1E, replaced both idle placeholders, left w1E with one Codex pane, and observed w1G close after becoming empty. bash -n, shellcheck, all tests/test-*.sh, deliver-change quick_validate, git diff --check, and the BPMN pipeline pass.

Fresh-context review found two reliability defects: a successful Herdr response with move_result.changed=false could close the untouched target, and moving the sole reporting pane out before worktree removal auto-closed the Change workspace. Source inspection verified both Herdr 0.7.3 paths; the earlier w1G topology verified auto-close. The helper now requires changed=true before close and mocks zoomed_tab refusal for both caller modes. Cleanup now requires a sole agent pane, creates and verifies an idle keeper, moves the agent with changed=true, keeps the Change workspace addressable, switches tool workdir, then removes it. A live detached-worktree check adopted w1K, left keeper w1K:p3, moved this agent out, removed w1K through Herdr, and restored a one-agent Change topology. Concurrent origin/main advance through PR #51 was fast-forwarded; the colliding plan allocation was recreated as doc-27, and regeneration on the landed pipeline was byte-identical. All focused Checks and 14 BPMN pipeline tests pass.

Post-fix fresh-context rereview inspected the exact current-main delta and reported no material findings across the helper, regression tests, delivery workflow, cockpit documentation, and Task/plan artifacts.

The operator approved both the initial rendered BPMN and the regenerated expanded helper-reuse plan. Initial implementation commit 68e5e95 is pushed in PR #52; GitHub reports it OPEN, CLEAN, MERGEABLE, with no applicable Checks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extended qq-herdr-pull with a shared, fail-fast accountable-agent adoption mode while preserving operator bindings; deliver-change now occupies the returned Change workspace, anchors tools to its checkout, and leaves a keeper during safe terminal cleanup. Mock and live topology/removal checks, shell validation, Skill validation, BPMN generation/tests, two fresh-context review passes, initial PR inspection, and strict plan conformance all pass.
<!-- SECTION:FINAL_SUMMARY:END -->
