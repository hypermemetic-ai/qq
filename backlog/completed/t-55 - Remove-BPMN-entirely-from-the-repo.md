---
id: T-55
title: Remove BPMN entirely from the repo
status: Done
assignee: []
created_date: '2026-07-16 04:10'
updated_date: '2026-07-16 04:37'
labels: []
dependencies: []
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator directive: delete the BPMN stuff entirely. Remove all live BPMN functionality: the bpmn-plans skill, tools/bpmn-pipeline, bin/qq-openwiki-bpmn, its test, generated .bpmn plan assets, and scrub BPMN wiring/references from bin/qq-openwiki, bin/install.sh, CI, README, the openwiki-maintainer skill, tests, and openwiki pages. Historical Backlog records (completed tasks, decisions, plan/research documents) remain as history.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 skills/bpmn-plans, tools/bpmn-pipeline, bin/qq-openwiki-bpmn, and tests/test-qq-openwiki-bpmn.sh no longer exist
- [x] #2 No live file (bin/, skills/, tests/, tools/, CI, README, openwiki/) references BPMN or the bpmn pipeline
- [x] #3 Generated .bpmn plan assets are removed from backlog/docs/plans/assets
- [x] #4 Remaining test suite and CI checks pass without the BPMN steps
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope decision: 'entirely' covers all live BPMN machinery and generated artifacts — the bpmn-plans skill, tools/bpmn-pipeline, bin/qq-openwiki-bpmn plus its test and wiring (qq-openwiki, install.sh, CI, README, openwiki-maintainer, tests, openwiki pages) and the generated backlog/docs/plans/assets/ diagram bundles. Historical Backlog markdown (completed tasks, decisions, plan/research document text) stays as history; their diagram image links intentionally go dead with the deleted assets. Installer link pruning is automatic (sync_skills / prune_removed_commands), so installed symlinks for bpmn-plans and qq-openwiki-bpmn self-clean on the next install run. Execution dispatched codex-first per work order.

Final summary: BPMN removed entirely in one Change (PR #105). Deleted skills/bpmn-plans, tools/bpmn-pipeline, bin/qq-openwiki-bpmn, tests/test-qq-openwiki-bpmn.sh, and the generated bundles under backlog/docs/plans/assets (doc-19, doc-23-35; doc-43 screenshots kept — not a BPMN bundle). Scrubbed qq-openwiki diagram authoring plus publisher/Node resolution, install.sh npm install and command link, the bpmn-tests CI job, README, openwiki-maintainer step, three test harnesses, and all openwiki pages (eleven skills now). Evidence: all seven remaining tests/test-*.sh harnesses pass locally; CI shell-tests green on PR #105; repo-wide sweep shows no BPMN reference in live files; fresh-context code review returned two confirmed prose findings (workflows.md process-bundle check, operations.md ignored-dependency claim), both fixed in-scope; docs-only delta re-verified with git diff --check.
<!-- SECTION:NOTES:END -->
