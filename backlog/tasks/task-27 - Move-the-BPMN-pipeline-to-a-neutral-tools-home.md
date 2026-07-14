---
id: TASK-27
title: Move the BPMN pipeline to a neutral tools/ home
status: In Progress
assignee: []
created_date: '2026-07-14 03:01'
updated_date: '2026-07-14 03:05'
labels: []
dependencies: []
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
- [ ] #1 Pipeline (bin, lib, bpmnlint plugin, tests, package files) lives under tools/bpmn-pipeline with history-preserving git mv
- [ ] #2 bin/qq-openwiki-bpmn, bin/install.sh, and skills/bpmn-plans/SKILL.md reference the new location; no references to skills/bpmn-plans/pipeline remain
- [ ] #3 npm ci and the pipeline test suite pass from the new location; tests/test-bpmn-plans.sh and tests/test-qq-openwiki-bpmn.sh green
<!-- AC:END -->
