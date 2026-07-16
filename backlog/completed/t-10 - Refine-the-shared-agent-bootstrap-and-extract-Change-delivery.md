---
id: T-10
title: Refine the shared agent bootstrap and extract Change delivery
status: Done
assignee:
  - '@codex'
created_date: '2026-07-12 17:02'
updated_date: '2026-07-12 17:30'
labels:
  - architecture
  - context-engineering
dependencies: []
modified_files:
  - AGENTS.md
  - README.md
  - skills/deliver-change/SKILL.md
  - skills/deliver-change/agents/openai.yaml
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refine the shared AGENTS.md after operator review so it serves one purpose: a safe cold start for every agent that receives it. Keep four universal invariants, a compact context map, and the operator merge boundary. Preserve the stock codebase-memory and OpenWiki adapter blocks. Move the conditional GitHub Flow procedure into a deliver-change Skill owned by the operator-facing accountable agent. Leave OpenWiki scheduler behavior unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The authored AGENTS.md kernel contains the four approved invariants, compact Context guidance, and the one-line Delivery boundary
- [x] #2 The stock codebase-memory and OpenWiki adapter blocks remain byte-identical and OpenWiki scheduler behavior is untouched
- [x] #3 deliver-change covers every authorized Repository modification intended to land and is owned only by the operator-facing accountable agent
- [x] #4 deliver-change drives work to a green reviewed pull request, opens the merge page, watches for up to three minutes, never merges, and finalizes the Task only after verifying the landing
- [x] #5 The delivery procedure delegates record mechanics and review to their owning surfaces instead of duplicating them
- [x] #6 Relevant validation and an independent code-review pass before commit and push
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite only the authored AGENTS.md kernel and verify both generated blocks are unchanged. 2. Scaffold and author deliver-change with native metadata and no unnecessary resources. 3. Update only authored documentation made inaccurate by the ownership split. 4. Validate the Skill, run focused static Checks, and obtain independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved safe-cold-start kernel and deliver-change ownership split. The codebase-memory and OpenWiki adapter hashes remain 7403a7b1... and b6091d81... respectively. deliver-change passed the skill validator and an isolated installer linked it correctly. The unchanged OpenWiki wrapper test and shell syntax checks pass.

After origin/main advanced through T-8, the worktree fast-forwarded to 7f88432fb5669eae445b6970cdb494496d002405 and all focused Checks were rerun successfully. A fresh visible read-only reviewer resolved that base change explicitly, inspected the exact rebased working-tree delta and the OpenWiki/T-9 ownership boundaries, verified both adapter hashes and diff whitespace, and returned no material findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reduced AGENTS.md to a safe cold-start kernel with four universal invariants, compact Context routing, and the operator merge boundary; moved conditional delivery into the deliver-change Skill; preserved the stock codebase-memory and OpenWiki adapter blocks and left OpenWiki scheduler behavior unchanged. Validation covered the Skill validator, isolated installation, OpenWiki regression test, shell syntax, exact adapter hashes, diff hygiene, and an independent review with no material findings. The reviewed commit 23448a63e1d5a725ff9fb7220570c68c519601e8 landed through PR #34 as merge commit 8887dac31e1e80b56356975605932d91e17e6264.
<!-- SECTION:FINAL_SUMMARY:END -->
