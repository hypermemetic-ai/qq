---
id: TASK-3
title: Give reviewers a parent-owned context capsule
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-12 03:11'
updated_date: '2026-07-12 03:17'
labels: []
dependencies: []
references:
  - 'https://learn.chatgpt.com/docs/agent-configuration/subagents'
documentation:
  - doc-16
modified_files:
  - skills/code-review/SKILL.md
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Change the code-review Skill so the spawning agent owns general Repository orientation and supplies a bounded, factual review capsule. The fresh reviewer independently judges the Change from that capsule and targeted source evidence without repeating intent or Knowledge discovery. Keep this Skill-only and runtime-neutral: no custom-agent manifest, methodology, AGENTS, OpenWiki, or TASK-2 research edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The spawning agent completes general orientation and the review capsule carries the objective/work layer, scope and non-goals, relevant source locators and orientation receipt, required acceptance/evidence, tool and permission boundary, output/citation shape, and explicit failure condition
- [x] #2 The reviewer is spawned without parent conversation history, treats the capsule as complete orientation, and does not repeat Repository-wide discovery
- [x] #3 The reviewer independently inspects the exact Change and targeted surrounding source, and reports a precise context gap instead of broadening discovery when the capsule is insufficient
- [x] #4 The changed Skill passes validation, a forward test demonstrates bounded reviewer behavior, git diff checks pass, and an independent review finds no unresolved in-scope issue
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Tighten the spawner/reviewer responsibility boundary in skills/code-review/SKILL.md without adding runtime-specific machinery.
2. Validate the Skill and forward-test a reviewer with a self-contained capsule, inspecting its trace for broad orientation.
3. Run independent review and fresh checks, then deliver the isolated Change.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Updated code-review so the spawning agent completes general orientation and sends a factual capsule containing the work layer, scope, orientation receipt, evidence, boundaries, output contract, and context-gap condition. The reviewer starts without parent history, treats the capsule as complete orientation, performs only targeted source inspection, and returns a precise context gap rather than broad discovery. No custom-agent, methodology, AGENTS, OpenWiki, or TASK-2 files changed.

Skill validation and git diff --check passed. A fresh fork_turns=none reviewer received the complete capsule, made three targeted tool calls to inspect the Skill/diff, TASK-3 record, and base source, performed zero general-orientation calls, and returned no material findings in about one minute. This same pass supplied the required independent review of the exact working-tree Change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made the code-review Skill assign general Repository orientation to the spawning agent and define a bounded factual review capsule. Reviewers now start without parent history, treat the capsule as complete orientation, inspect only targeted source evidence, and return a precise context gap instead of launching broad discovery. Validated with the Skill validator, diff hygiene, and a fresh independent forward test that made only three targeted reads and found no material issue.
<!-- SECTION:FINAL_SUMMARY:END -->
