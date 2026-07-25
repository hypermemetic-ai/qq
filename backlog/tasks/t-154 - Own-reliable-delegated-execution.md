---
id: T-154
title: Own reliable delegated execution
status: Done
assignee: []
created_date: '2026-07-24 07:12'
updated_date: '2026-07-25 01:00'
labels: []
dependencies: []
documentation:
  - doc-89
  - doc-94
  - doc-98
priority: high
type: feature
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deliver qq-owned reliable delegated execution in two bounded Changes: first restore the production contract with an immutable pinned bridge fork, then qualify and retain pi-subagents as the vendor runtime behind a thin qq adapter instead of rebuilding its general lifecycle machinery.

## Decision ledger

- `decision-14` — the operator superseded decision-12's replacement destination: retain an exact pi-subagents fork as the vendor runtime while qq owns policy, confinement, observation, completion contracts, review, and delivery.
- `decision-8` — delegate network egress remains open beneath the pinned Landstrip drift-net; this work adds no confidentiality or hostile-code boundary.
- `decision-10` — persisted Pi session JSONL remains the sole agent-content observation seam; lifecycle metadata may be live but content capture may not.
- `T-152` / `doc-88` — canonical role and execution-profile authority belongs to qq; same-name project or unrelated user definitions may not occupy canonical delegated seats.
- Approved lifecycle plan — asked-and-answered operator exchange on 2026-07-24, captured in `doc-98` after T-154.3/doc-94 landed.

T-154.1 owns the restored bridge. T-154.2 owns vendor qualification, the thin adapter, an immutable candidate pin, production-shaped canary, and conditional promotion. Context7 adoption is a separate subsequent Change under doc-98.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The pinned bridge restores strict terminal structured completion and contract-preserving resume for production delegation.
- [x] #2 An exact pi-subagents candidate plus the smallest qq adapter passes the advertised vendor suite, qq shared contract, canonical-role source checks, and production-shaped canary before promotion.
- [x] #3 qq retains Completion Envelope, role/model policy, Landstrip dispatch, persisted-session observation, Herdr/operator visibility, fresh review, and merge authority without duplicating vendor lifecycle machinery.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
T-154.2 qualification is locally complete at exact fork pin `9e045ed75e09a163afa17271e55150ed1e8369df`: repeated vendor suites, shared rollback/candidate contract, trusted-seat checks, real-provider async/resume/observer canary, installed workflow checks, and verified rollback are green. Parent and child remain In Progress until the qq Change is reviewed, merged by the operator, observed, and retired.

Settled-composition revalidation is now complete after T-153 landed corrections #242/#243 at `931693a`: final reviewer async+resume, implementer, researcher, exact trusted-seat recovery descriptors, Landstrip role identities, Completion Envelopes, acceptance:none, and persisted-session observations all passed against installed pi-subagents `9e045ed...`; final rollback/candidate shared contracts and all 34 Repository Checks pass. T-154 remains In Progress only through T-154.2 review, operator merge, observation, and retirement.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored reliable delegated execution and settled qq’s long-term boundary: pi-subagents owns vendor orchestration/lifecycle mechanics while qq retains canonical role/model policy, Completion Envelopes, qq-dispatch/Landstrip, persisted-session-only content observation, operator visibility, review, delivery, and merge authority. T-154.1 restored the bridge; T-154.2 qualified and promoted exact retained vendor pin `9e045ed...` through PR #244 with verified rollback. Post-merge observation was finalized and delivery coverage passed. The separately approved researcher-only Context7 lifecycle can now begin after T-154.4 lands and all worktrees retire.
<!-- SECTION:FINAL_SUMMARY:END -->
