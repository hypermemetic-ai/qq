---
id: T-93
title: Evaluate pi-ecosystem replacements for qq surfaces
status: Done
assignee: []
created_date: '2026-07-19 15:51'
updated_date: '2026-07-20 18:41'
labels: []
dependencies: []
documentation:
  - doc-54
  - doc-55
  - doc-56
  - doc-57
  - doc-58
  - doc-59
  - doc-60
  - doc-65
  - doc-68
priority: high
type: task
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-approved research sweep (alignment brief approved in-session): for every major qq-owned surface, find the best maintained drop-in replacement in the pi ecosystem (pi >= 0.80.10 native capabilities or packages from https://pi.dev/packages), plus QoL additions qq lacks. Aim: shrink qq by outsourcing owned machinery to maintained packages.

Verdict weighting (operator-set): judge as a USER of the package, not its maintainer; do not penalize internal complexity the operator would never touch. Well-engineered and maintained beats minimal.

Decision ledger:
- Partition into seven researcher clusters (A task system, B change delivery, C delegated agents, D session/workspace topology, E knowledge/docs, F methodology skills, G cockpit QoL + internal lean machinery): asked-and-answered alignment exchange, this session.
- Discovery source https://pi.dev/packages as primary catalog: operator instruction, this session.
- Complexity-related methodology machinery (ratchet/tests) in scope for findings: operator instruction, this session.
- Research only; no installs or code changes. Each adoption is its own later Change: alignment brief, this session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Seven cluster research documents (A-G) attached to this task, each reconciled from its researcher's raw findings per the research skill
- [x] #2 Every major qq-owned surface in the cluster inventories has an adopt/shortlist/hold/reject verdict with citations, and any residual qq must keep is named
- [x] #3 QoL additions that replace nothing are reported separately in each cluster doc
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Close-out summary (2026-07-20): sweep complete. Seven reconciled cluster reports landed — A task system (doc-54), B change delivery (doc-55), C delegated agents (doc-56), D session/workspace topology (doc-57), E knowledge/docs (doc-58), F methodology skills (doc-59), G cockpit QoL + lean machinery (doc-60) — plus the QoL de-biased round (doc-63), plan-review evaluations (doc-65, doc-68) and the all-terminal plan-review trial results (doc-69). Every qq-owned surface carries an adopt/shortlist/hold/reject verdict with citations; residuals named per cluster. Dispositions already enacted or ticketed as their own Changes: T-106, T-110, T-111, T-112, T-115, T-116, T-117, T-118, T-119, T-120, T-121, and the T-95 migration this sweep scoped. No Repository code mutated under this Task, per its research-only bound.
<!-- SECTION:NOTES:END -->
