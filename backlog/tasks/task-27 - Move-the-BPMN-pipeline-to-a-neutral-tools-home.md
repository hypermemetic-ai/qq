---
id: TASK-27
title: Move the BPMN pipeline to a neutral tools/ home
status: Done
assignee: []
created_date: '2026-07-14 03:01'
updated_date: '2026-07-14 03:17'
labels: []
dependencies: []
modified_files:
  - backlog/tasks/task-27 - Move-the-BPMN-pipeline-to-a-neutral-tools-home.md
  - bin/install.sh
  - bin/qq-openwiki-bpmn
  - openwiki/verification.md
  - skills/bpmn-plans/SKILL.md
  - tests/test-qq-openwiki-activate.sh
  - tests/test-qq-openwiki-bpmn.sh
  - tools/bpmn-pipeline/.bpmnlintrc.json
  - tools/bpmn-pipeline/.gitignore
  - tools/bpmn-pipeline/README.md
  - tools/bpmn-pipeline/bin/qq-bpmn.mjs
  - tools/bpmn-pipeline/bpmnlint-plugin-qq/index.cjs
  - tools/bpmn-pipeline/bpmnlint-plugin-qq/package.json
  - tools/bpmn-pipeline/bpmnlint-plugin-qq/rules/no-collaboration.cjs
  - tools/bpmn-pipeline/bpmnlint-plugin-qq/rules/no-lanes.cjs
  - tools/bpmn-pipeline/bpmnlint-plugin-qq/rules/no-subprocess.cjs
  - tools/bpmn-pipeline/bpmnlint-plugin-qq/rules/single-process.cjs
  - tools/bpmn-pipeline/example/plan-spec.example.json
  - tools/bpmn-pipeline/lib/conformance.mjs
  - tools/bpmn-pipeline/lib/generate.mjs
  - tools/bpmn-pipeline/lib/layout.mjs
  - tools/bpmn-pipeline/lib/pipeline.mjs
  - tools/bpmn-pipeline/lib/wiki.mjs
  - tools/bpmn-pipeline/package-lock.json
  - tools/bpmn-pipeline/package.json
  - tools/bpmn-pipeline/test/pipeline.test.mjs
priority: medium
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the 2026-07-13 architecture review: the Node BPMN pipeline lives inside skills/bpmn-plans/pipeline but is a runtime dependency of bin/qq-openwiki-bpmn and install.sh (npm ci), so retiring the skill would silently break OpenWiki publishing.
Operator-settled decision: relocate to tools/bpmn-pipeline; skills stay stateless capability docs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pipeline (bin, lib, bpmnlint plugin, tests, package files) lives under tools/bpmn-pipeline with history-preserving git mv
- [x] #2 bin/qq-openwiki-bpmn, bin/install.sh, and skills/bpmn-plans/SKILL.md reference the new location; no references to skills/bpmn-plans/pipeline remain
- [x] #3 npm ci and the pipeline test suite pass from the new location; tests/test-bpmn-plans.sh and tests/test-qq-openwiki-bpmn.sh green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Relocated all 19 tracked pipeline files to tools/bpmn-pipeline as 100% similarity renames and repointed every live runtime, installation, Skill, test, and verification consumer. Locked npm installation and all 18 pipeline tests passed from the new home; all eight repository shell harnesses, retained OpenWiki artifact verification, Skill validation, Bash syntax, ShellCheck, and diff hygiene passed. Fresh review found a stale Skill-relative README pointer; it was corrected to ../../tools/bpmn-pipeline/README.md, and the final exact delta had no material findings. PR #69 is open, mergeable, CLEAN, with no configured GitHub checks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved the shared BPMN runtime out of the stateless Skill tree into tools/bpmn-pipeline with Git history preserved, updated all live consumers and regressions, and verified locked installation, pipeline behavior, OpenWiki integration, repository harnesses, static checks, and independent review.
<!-- SECTION:FINAL_SUMMARY:END -->
