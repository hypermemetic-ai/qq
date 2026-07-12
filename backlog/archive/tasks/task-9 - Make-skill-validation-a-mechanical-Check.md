---
id: TASK-9
title: Make skill validation a mechanical Check
status: To Do
assignee: []
created_date: '2026-07-12 16:21'
labels: []
dependencies: []
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CONTEXT (2026-07-12): openwiki/architecture.md:66 prescribes validating new/edited Skills with Codex's skill-creator validator, then rerunning bin/install.sh. An agent hand-authored skills/bpmn-plans/SKILL.md and edited skills/grilling/SKILL.md without running the validator — the miss was caught by the operator, not by any Check (both skills validated clean after the fact via ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py). Memory-dependent steps fail silently; this one should be mechanical.

SKETCH (needs a plan before building — operator direction: do not rush): likely a tests/test-skills-validate.sh running quick_validate.py over every skills/*/ directory, following the tests/test-qq-openwiki.sh conventions. Open questions for the plan: the validator lives at a machine-specific user path (env override? vendored? skip-vs-fail when absent?); how tests are invoked in this CI-less repo (agent convention before commit vs a GitHub workflow); whether install.sh rerun should also be checked; whether SKILL.md-only remains the norm vs agents/openai.yaml companions (only openwiki-maintainer has one today). Candidate first use of the TASK-8 plan-artifact flow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A plan (ideally a BPMN plan artifact per TASK-8) exists and is operator-approved before implementation
- [ ] #2 Skill validation runs as a mechanical Check that fails loudly when a SKILL.md is invalid, with a documented story for machines lacking the validator
<!-- AC:END -->
