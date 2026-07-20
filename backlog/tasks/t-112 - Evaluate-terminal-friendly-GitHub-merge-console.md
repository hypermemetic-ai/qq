---
id: T-112
title: Evaluate terminal-friendly GitHub merge console
status: To Do
assignee: []
created_date: '2026-07-19 19:58'
labels: []
dependencies: []
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator direction (T-107, 2026-07-19): with slopchop taking local diff review, make the remaining GitHub merge-console jobs — Checks status, review state, merge disposition — terminal-friendly. Baseline candidate: gh CLI (gh pr checks/view) already authoritative in deliver-change. Package candidates from the doc-55 sweep (doc-63: both UNPROVEN — trial-shaped): @narumitw/pi-github-pr (PR checks/review/comments as extension status; renders in pi-footer's extension-status row), pi-merge-ready (advisory readiness diagnostics for deliver-change step 7; authoritative gh fields and operator merge unchanged). Fresh discovery allowed. Ends in adopt/trial/drop with evidence, same shape as T-107.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 #1 Per-candidate disposition recorded with hands-on evidence
- [ ] #2 #2 If adopted, deliver-change references the terminal surface; operator merge stays the disposition point
<!-- AC:END -->
