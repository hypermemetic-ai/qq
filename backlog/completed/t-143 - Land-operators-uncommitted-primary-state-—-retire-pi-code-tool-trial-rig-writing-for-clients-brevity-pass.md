---
id: T-143
title: >-
  Land operator's uncommitted primary state — retire pi-code-tool trial rig,
  writing-for-clients brevity pass
status: Done
assignee: []
created_date: '2026-07-22 23:38'
updated_date: '2026-07-23 02:31'
labels: []
dependencies: []
type: chore
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The operator tore down the pi-code-tool A/B trial rig (T-135) directly in primary main without committing: deleted bin/qq-code-trial, lib/qq-code-trial.mjs, .pi/extensions/qq-code-tool-trial.ts, tests/test-qq-code-trial.sh; moved the T-135 task record to backlog/archive/; removed the trial's 62 README lines. The same uncommitted state carried an unrelated operator-authored writing-for-clients brevity pass (length discipline added to reader profile, voice rules, and the hardening checklist). This Change lands both verbatim as two clean commits.

Decision ledger: teardown performed by the operator uncommitted in primary main (state preserved verbatim); recreation as a proper Change at operator disposition — asked-and-answered alignment exchange, accountable project-home session 2026-07-22; writing-for-clients edit is operator-authored content landed as-is, same exchange; prose ratchet raise 7468→7606 for the brevity pass — operator-approved commit, same exchange 2026-07-22.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Working-tree state recreated byte-identical to primary main's uncommitted state (cmp-verified on README, SKILL.md, archived task; deletions absent)
- [ ] #2 Test suite green with the trial test removed
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered: operator's uncommitted primary state rescued byte-identical into managed Change (PR #206, merged 2026-07-22); pi code-tool trial rig retired; writing-for-clients brevity pass landed with approved ratchet raise 7468 to 7606.
<!-- SECTION:FINAL_SUMMARY:END -->
