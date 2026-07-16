---
id: doc-27
title: Plan — Populate Herdr Change workspaces with the accountable agent
type: other
created_date: '2026-07-13 03:10'
updated_date: '2026-07-13 03:18'
---
# Plan — Populate Herdr Change workspaces with the accountable agent

T-18 reuses `qq-herdr-pull` as the single owner of Herdr pane replacement. Existing operator selection remains intact; a fail-fast agent mode adopts a newly returned Change workspace, refuses ambiguous targets, moves before closing, and leaves subsequent repository actions anchored to the returned checkout.

![Plan](assets/doc-27/plan.png)

Source specification: `assets/doc-27/plan-spec.json`

Executable BPMN: `assets/doc-27/plan.bpmn`

# BPMN conformance report

Plan: backlog/docs/plans/assets/doc-27/plan.bpmn

## Summary

- Flow nodes: 12
- Accounted: 12
- Unaccounted: 0
- Diverged: 0
- Unknown completion IDs: 0
- Strict verdict: PASS

## Per-element status

| ID | Name | Type | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| start | Fix approved | StartEvent | done | Evidence: backlog/tasks/task-18 - Populate-Herdr-Change-workspaces-with-the-accountable-agent.md:51<br>Note: The operator approved the rendered plan and its expanded helper-reuse revision. |
| extend_helper | Extend shared pane mover | ServiceTask | done | Evidence: bin/qq-herdr-pull<br>Note: Operator selection and fail-fast agent workspace adoption share the move-before-close primitive. |
| update_skill | Adopt helper in delivery workflow | ServiceTask | done | Evidence: skills/deliver-change/SKILL.md<br>Note: Delivery adopts the returned workspace, anchors tools to its checkout, and leaves a cleanup keeper. |
| checks_entry | Enter verification | ExclusiveGateway | done | Evidence: backlog/tasks/task-18 - Populate-Herdr-Change-workspaces-with-the-accountable-agent.md:45-47 |
| run_checks | Validate Skill and handoff invariants | ServiceTask | done | Evidence: tests/test-qq-herdr-pull.sh<br>Note: Mock, shell, Skill, BPMN, diff, and live topology checks passed. |
| checks_green | Checks green? | ExclusiveGateway | done | Evidence: backlog/tasks/task-18 - Populate-Herdr-Change-workspaces-with-the-accountable-agent.md:47 |
| repair_entry | Enter correction | ExclusiveGateway | done | Evidence: backlog/tasks/task-18 - Populate-Herdr-Change-workspaces-with-the-accountable-agent.md:47<br>Note: Verified review findings entered the bounded correction path. |
| repair | Correct in-scope failure | ServiceTask | done | Evidence: bin/qq-herdr-pull<br>Note: Required changed=true before close and preserved the Change workspace with a cleanup keeper. |
| review | Run fresh-context review | ServiceTask | done | Evidence: backlog/tasks/task-18 - Populate-Herdr-Change-workspaces-with-the-accountable-agent.md:47-49 |
| review_clear | Review clear? | ExclusiveGateway | done | Evidence: backlog/tasks/task-18 - Populate-Herdr-Change-workspaces-with-the-accountable-agent.md:49<br>Note: Post-fix fresh-context rereview reported no material findings. |
| publish | Publish green pull request | ServiceTask | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/52<br>Note: Implementation commit 68e5e95 is pushed; the pull request is open, clean, mergeable, and has no applicable Checks. |
| ready | Green PR ready | EndEvent | done | Evidence: https://github.com/hypermemetic-ai/qq/pull/52 |

## Unaccounted elements

None.

## Unknown completion IDs

None.

## Divergence summary

No elements diverged.
