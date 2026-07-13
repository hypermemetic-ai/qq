---
id: TASK-15
title: Keep BPMN conformance inside the owning PR
status: Done
assignee:
  - '@codex'
created_date: '2026-07-13 00:24'
updated_date: '2026-07-13 00:40'
labels: []
dependencies: []
documentation:
  - doc-25
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Revise bpmn-plans so a planned Change ends at a green PR handoff and records conformance as same-PR closeout metadata before Task finalization. Operator merge, disposition polling, primary-main synchronization, and worktree cleanup remain delivery activities outside the BPMN process and never require a post-merge conformance Change. Historical conformance records remain untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 BPMN plans end at the planned Change being green for PR handoff and exclude operator merge, disposition polling, primary-main synchronization, and cleanup nodes
- [x] #2 Completions and the generated conformance report are added to the owning branch and PR before the owning Task is marked Done
- [x] #3 Conformance recording and Task finalization are defined as closeout metadata outside BPMN nodes, and later behavioral changes require conformance to be rerun before handoff
- [x] #4 The Skill explicitly prohibits post-merge conformance Changes while preserving historical records
- [x] #5 The updated Skill and trigger metadata pass validation, realistic forward testing, and independent fresh-context review
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update bpmn-plans so BPMN execution ends at a green owning-PR handoff and excludes closeout/disposition nodes.
2. Require strict conformance artifacts to be generated and appended on the owning branch before Task finalization, with both delivered through the same PR.
3. Validate and forward-test the revised Skill, then run independent fresh-context review.
4. Commit and publish the planned implementation in the owning PR and verify its green state.
5. Record conformance and finalize TASK-15 as same-PR closeout metadata, push the closeout commit, and reverify the PR before handoff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Operator approved the rendered doc-25 BPMN plan before implementation.

Updated bpmn-plans prospectively: planned nodes end at a green owning-PR handoff; conformance recording and Task finalization are same-PR closeout metadata outside the BPMN; operator disposition, merge, primary-main synchronization, and cleanup are excluded; strict conformance must precede Task Done; later behavioral changes invalidate and require replacement conformance; historical records remain untouched.

A valid fresh-context forward test read the revised Skill and selected one owning PR, strict conformance before Task Done, a same-PR closeout commit, final checks after that commit, and no post-merge conformance Change. An earlier test was discarded because its prompt prohibited reading the filesystem Skill.

Independent fresh-context review found one plan evidence citation that pointed at the later finalized-handoff gate and created a sequencing cycle. The citation now points at the pre-finalization publish-and-GitHub-check step; the regenerated diagram is visually byte-identical, all evidence ranges resolve, and the exact corrective delta has no material findings.

Strict doc-25 conformance was generated and reviewed inside owning PR #47 before Task finalization: 12/12 nodes accounted, zero unaccounted, zero divergent, zero unknown, PASS; fresh closeout review found no material findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Revised bpmn-plans so planned execution ends at a green owning-PR handoff, strict conformance and Task finalization remain same-PR closeout metadata, and merge/disposition/main-sync activities stay outside BPMN. Preserved historical records, validated and forward-tested the Skill, resolved the independent plan-evidence finding, published the implementation in PR #47, then generated and reviewed strict 12/12 conformance on the same branch before marking this Task Done.
<!-- SECTION:FINAL_SUMMARY:END -->
