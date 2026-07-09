---
id: TASK-6
title: Build the /idea capture skill
status: Done
assignee:
  - task-6-idea-skill
created_date: '2026-07-08 14:41'
updated_date: '2026-07-09 02:56'
labels:
  - parallel-ok
dependencies:
  - TASK-3
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Idea #1, design locked 07-07: capture verbatim in-turn, detached researcher writes ideas/NN-slug.md, completion shows as ambient status on the qq-phase surface. Rides the status substrate; needs the multi-producer fix first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 skills/idea/SKILL.md exists and passed the writing-skills eval loop: RED baseline failures observed without the skill, GREEN compliance observed with it
- [x] #2 Capture is verbatim-first: raw operator input is written to the ideas/ surface before sharpening or research
- [x] #3 Research path spawns a detached researcher (setsid ... < /dev/null &) that enriches ideas/NN-slug.md and stamps qq-phase --producer idea-NN (capturing -> researching -> done/red); producer-slot isolation is verified
- [x] #4 No-research ideas land as a README Backlog bullet with no status stamps; bare /idea captures a handoff-style session snapshot
- [x] #5 Nothing returns to the transcript: completion is ambient status only
- [x] #6 Methodology support line + skill index, SKILLS-ATTRIBUTION.md, and ideas/README.md reference the skill
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gate finding 'detached-researcher-unbounded-write' (error, ask-user) relayed to the operator, who chose 'fix the boundary, then land'. FIX: the detached researcher no longer has write authority over the repo. It runs in a scratch dir outside the repo (mktemp under XDG_CACHE_HOME) and emits $SCRATCH/enriched.md; the spawning wrapper — plain bash, not model-controlled — compares the emitted Original block with the captured file before installing it at the one known path ideas/NN-SLUG.md, then removes the scratch dir. Claude route keeps bypassPermissions (headless automation needs it) but exposes only Read/Glob/Grep/WebFetch/WebSearch tools, so the model has repo read and network access but no Bash, Write, Edit, or NotebookEdit tool; Codex route switches from --sandbox danger-full-access to --sandbox workspace-write with --cd $SCRATCH (OS-level confinement). EVIDENCE: (1) 2026-07-08 adversarial runs showed the current Claude spawn uses --tools "Read,Glob,Grep,WebFetch,WebSearch" and does not rely on --settings deny rules; (2) 2026-07-08 end-to-end against a fake repo, an agent explicitly instructed to write PWNED into <repo>/ideas/01-x.md AND ENRICHED into its scratch dir left the repo file byte-identical ('ORIGINAL') while producing scratch/enriched.md ('ENRICHED'); (3) 2026-07-09 installer simulation showed the wrapper install path fails before replacement when the emitted Original block differs. Both spawn blocks pass bash -n. Residual risk stated in the skill header: the researcher still reads the repo, spends tokens, and reaches the network; a poisoned page can corrupt the CONTENT of enriched.md outside Original, which is why that content lands as a normal reviewed diff.
<!-- SECTION:NOTES:END -->
