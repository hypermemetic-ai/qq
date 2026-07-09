---
id: TASK-5
title: Rename ce-compound to compound; make it auto-fire
status: Done
assignee:
  - task-5-compound-rename
created_date: '2026-07-08 14:41'
updated_date: '2026-07-09 00:06'
labels:
  - parallel-ok
dependencies: []
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Idea #2, decided 07-07: drop the ce prefix (rename skills/ce-compound/ + refs + ~/.claude/skills link) and move the appropriateness judgment inside the skill so it fires without asking.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Renamed skills/ce-compound -> skills/compound (git mv). Auto-fire: frontmatter description + new 'When this fires — and who decides' section put the appropriateness judgment inside the skill (fire without asking; silent no-op when nothing earns capture). Refs updated: qq-methodology.md (loop step 7 + skill index only — minimal for TASK-4 mergeability), CONCEPTS.md, docs/solutions/README.md, skills/orchestrate/SKILL.md, SKILLS-ATTRIBUTION.md, bin/qq-link.sh seed text. ~/.claude/skills link: added dangling-link pruning to link_skills (only prunes links pointing into $QQ/skills) — post-merge 'bash bin/qq-link.sh skills' (or qq-activate.sh) creates the compound link and removes the stale ce-compound link; verified in a sandboxed $HOME (prune/link/idempotency/foreign-link-untouched all pass). Historical records (ideas/ audit notes, upstream attribution lines) intentionally keep the old name.
<!-- SECTION:NOTES:END -->
