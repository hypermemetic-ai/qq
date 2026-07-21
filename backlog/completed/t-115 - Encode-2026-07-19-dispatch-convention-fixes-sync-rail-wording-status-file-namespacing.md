---
id: T-115
title: >-
  Encode 2026-07-19 dispatch-convention fixes: sync-rail wording + status-file
  namespacing
status: Done
assignee: []
created_date: '2026-07-19 21:28'
updated_date: '2026-07-19 21:46'
labels: []
dependencies: []
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two methodology wrinkles surfaced by the 2026-07-19 batches, operator-approved to settle ('all approved', 2026-07-19 exchange with the T-107 follow-on dispatcher): (a) deliver-change step 11's sync rail literally requires every untracked primary-checkout entry to be a managed Task record under backlog/tasks/, but the tree routinely holds uncommitted managed Backlog docs (plans, research, decisions, completed/archive records); the rail's actual failure mode is clobbering, excluded by path-overlap verification. Amend the rail text to the managed-docs intent WITH the zero-path-overlap requirement, and re-pin tests/test-qq-herdr-home.sh in the same Change (it pins the current strings). (b) doc-43's status-file derivation keys on dispatcher workspace, so two orchestrators in one project home collide on wM.status (observed live: doc-62 and T-107-follow-on dispatchers). Amend delegate-batch's derivation to namespace per dispatcher (e.g. a batch/session suffix), keeping the popup rendering contract. Decision ledger: both dispositions operator-approved verbatim in the 2026-07-19 transcript exchange; T-108 verdict acceptance recorded as decision-4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deliver-change step 11 rail text matches managed-docs intent with explicit zero-path-overlap requirement; test-qq-herdr-home re-pinned and passing
- [x] #2 delegate-batch status-file derivation namespaces per dispatcher; two dispatchers cannot collide by construction
- [x] #3 ratchet baselines updated (only-down unless operator-cited increase)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FINAL SUMMARY (2026-07-19, dispatch orchestrator): (a) step-11 rail now scopes to managed Backlog markdown under backlog/ with the zero-path-overlap clobber guard explicit; blocking conditions enumerated; test re-pinned. (b) status file derives per dispatcher batch (<workspace>-<batch-label>.status); bin/qq-status --batch-label added (validated, legacy path retained); doc-43 amended via CLI and landed in this Change. Review round 1: 2 findings (qq-status publisher gap, unpinned blocking clauses) fixed and owner-verified. Full suite green. Ratchet prose 11417 → 11498 (approval cited). PR #155.
<!-- SECTION:NOTES:END -->
