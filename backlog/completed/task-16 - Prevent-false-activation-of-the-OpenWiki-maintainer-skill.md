---
id: TASK-16
title: Prevent false activation of the OpenWiki maintainer skill
status: Done
assignee:
  - '@codex'
created_date: '2026-07-13 02:08'
updated_date: '2026-07-13 02:08'
labels: []
dependencies: []
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The OpenWiki maintainer skill has been falsely invoked twice during ordinary source work that merely touched or discussed its workflow. Harden the frontmatter activation contract so only the dedicated OpenWiki maintainer Actor performing an initialization or post-main-advance refresh can trigger it. Reading, reviewing, modifying, testing, or documenting OpenWiki or the maintainer workflow must not trigger the skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The frontmatter description begins with an explicit dedicated-Actor-only gate and lists the only two valid invocation events
- [x] #2 The frontmatter description explicitly excludes work that merely reads, reviews, modifies, tests, or documents OpenWiki or the maintainer workflow
- [x] #3 The updated skill passes the repository skill validator
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite only the openwiki-maintainer frontmatter description to make positive and negative trigger conditions unambiguous. 2. Validate the skill and inspect the exact diff. 3. Finalize the Task and deliver the focused Change.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: python3 skill-creator/scripts/quick_validate.py skills/openwiki-maintainer -> Skill is valid; git diff --check passed. The body and agents/openai.yaml remain unchanged because they already describe the dedicated post-main-advance maintainer role.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hardened the OpenWiki maintainer activation contract in frontmatter: only the dedicated maintainer Actor handling a main advance or explicit initialization assignment may invoke it, while source work and mere reading, review, modification, testing, or documentation are explicitly excluded. The skill validator and diff check pass.
<!-- SECTION:FINAL_SUMMARY:END -->
