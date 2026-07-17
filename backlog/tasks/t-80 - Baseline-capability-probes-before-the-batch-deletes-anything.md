---
id: T-80
title: Baseline capability probes before the batch deletes anything
status: Done
assignee: []
created_date: '2026-07-17 17:18'
updated_date: '2026-07-17 19:17'
labels:
  - base-batch
dependencies: []
priority: high
type: task
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Probe and capture the external contracts: agent credentials cannot merge or push main; required CI green-gates main; managed Backlog markdown edits get local feedback; parallel writers get separate worktrees; PR handoff yields a usable URL; delivery completes with Herdr absent. External contracts only — no new internal-state tests.

Decision ledger:
- Scope and external-contracts-only bound — doc-51 (operator-approved relocation and brief, 2026-07-17).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each listed contract has a probe or existing Check demonstrating it, cited where later batch Tasks can reference it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added six on-demand probes under tests/probes/ (one per external contract) plus README.md as the citation matrix. All six demonstrated: C1 REST merge -> HTTP 405 with the specific 'not authorized to push' denial on a green scratch PR; C2 direct push -> GH013 with the same specific denial, main unchanged, push identity confirmed qqp-bot through the repo-pinned core.sshCommand; C3 qq-claude-guard denies a synthetic PreToolUse Edit (exit 2 + stderr feedback); C4 two isolated linked worktrees; C5 gh pr create URL resolves then cleaned; C6 full shell suite green with herdr masked from PATH. C1/C2/C5 owner-run (network/creds); C3/C4/C6 local. Dated evidence committed under tests/probes/evidence/. No probe matches the tests/test-*.sh CI glob; external contracts only. Two review rounds: five findings (fail-closed push identity, specific-denial assertions, cleanup-before-push, README accuracy) fixed and re-verified by owner re-runs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The six external contracts the base batch must preserve now have re-runnable probes (or existing Checks) on a stable citation surface (tests/probes/README.md) that later batch Tasks reference. All six were demonstrated with committed dated evidence; the credentialed merge/push-rejection probes re-prove the T-36/T-37 boundary that T-82 will re-run after removing qq-claude-guard. Delivered on PR #135. AC#1 met.
<!-- SECTION:FINAL_SUMMARY:END -->
