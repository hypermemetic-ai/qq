---
id: T-154
title: Own reliable delegated execution
status: In Progress
assignee: []
created_date: '2026-07-24 07:12'
updated_date: '2026-07-24 19:24'
labels: []
dependencies: []
documentation:
  - doc-89
  - doc-94
  - doc-96
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
- Approved lifecycle plan — asked-and-answered operator exchange on 2026-07-24, captured in `doc-96` after T-154.3/doc-94 landed.

T-154.1 owns the restored bridge. T-154.2 owns vendor qualification, the thin adapter, an immutable candidate pin, production-shaped canary, and conditional promotion. Context7 adoption is a separate subsequent Change under doc-96.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The pinned bridge restores strict terminal structured completion and contract-preserving resume for production delegation.
- [ ] #2 An exact pi-subagents candidate plus the smallest qq adapter passes the advertised vendor suite, qq shared contract, canonical-role source checks, and production-shaped canary before promotion.
- [ ] #3 qq retains Completion Envelope, role/model policy, Landstrip dispatch, persisted-session observation, Herdr/operator visibility, fresh review, and merge authority without duplicating vendor lifecycle machinery.
<!-- AC:END -->
