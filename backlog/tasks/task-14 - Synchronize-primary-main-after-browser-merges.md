---
id: TASK-14
title: Synchronize primary main after browser merges
status: Done
assignee:
  - '@codex'
created_date: '2026-07-12 23:46'
updated_date: '2026-07-13 00:10'
labels: []
dependencies: []
documentation:
  - doc-24
modified_files:
  - skills/deliver-change/SKILL.md
  - skills/deliver-change/agents/openai.yaml
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the operator merges a Change in GitHub, the accountable deliver-change agent safely fast-forwards the primary main checkout so local Backlog files and the standing Herdr board reflect landed state. Synchronization must be observable, fast-forward-only, and refusal-first when the primary checkout is dirty, absent, on another branch, or otherwise unsafe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After GitHub reports the PR merged, deliver-change identifies the primary checkout and synchronizes it with origin/main using a fast-forward-only operation
- [x] #2 Synchronization proceeds only when the primary checkout is clean and on main; unsafe or non-fast-forward states are left untouched and reported with evidence
- [x] #3 The procedure verifies local main matches the fetched remote main after synchronization and makes clear that fetch alone does not update the Backlog board
- [x] #4 The updated Skill passes validation and independent fresh-context review
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update deliver-change so a verified merged disposition proceeds to guarded primary-main synchronization.
2. Validate the Skill and exercise the documented success/refusal conditions.
3. Run fresh-context review; correct only confirmed in-scope findings.
4. Finalize TASK-14, publish one PR, and follow the approved post-merge synchronization flow.
5. Record BPMN conformance after landing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Operator approved the rendered doc-24 BPMN plan before implementation.

Implemented deliver-change steps 7 and 10-12 with mergeCommit retrieval, landed-state ancestry, exact main-worktree discovery, clean/on-main and exclusive-use gates, one checkout-local fetch, capture and validation of the immutable fetched target OID, merge --ff-only of that object, final branch/cleanliness/target-SHA/merge-commit verification, explicit evidence reporting, and refusal/retention behavior. Skill validation and YAML parsing pass.

Fresh-context scenario tests exercised clean-behind, dirty, diverged, absent-main, and rewritten-main states. Independent review identified and drove fixes for pull's post-check fetch race, mutable origin/main integration, missing final merge-commit ancestry, and stale BPMN evidence lines. The unchanged approved diagram was regenerated with corrected evidence stamps.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extended deliver-change through safe post-merge primary-main synchronization. The agent now verifies the PR merge commit, refuses unsafe or non-exclusive main checkouts, captures and validates one immutable fetched target, fast-forwards only to that object, and rechecks branch, cleanliness, target SHA, and merge ancestry before claiming the Backlog board can be current. Validated the Skill and metadata, exercised success/refusal/race scenarios in fresh contexts, and resolved all independent review findings; the final corrective delta has no material findings.
<!-- SECTION:FINAL_SUMMARY:END -->
