---
id: T-112
title: Evaluate terminal-friendly GitHub merge console
status: Done
assignee: []
created_date: '2026-07-19 19:58'
updated_date: '2026-07-21 22:48'
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
- [x] #1 #1 Per-candidate disposition recorded with hands-on evidence
- [x] #2 #2 If adopted, deliver-change references the terminal surface; operator merge stays the disposition point
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Trial results 2026-07-20 (project-home session, hands-on against PR #164):

1. **gh CLI (baseline) — ADOPT (already authoritative).** `gh pr checks 164` and `gh pr view 164 --json state,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup` returned complete, correct state (checks SUCCESS; mergeable MERGEABLE; mergeStateStatus BLOCKED; reviewDecision empty). This remains deliver-change's authoritative terminal surface; operator merge stays the disposition point.
2. **@narumitw/pi-github-pr@0.23.0 — ADOPT as ambient surface (pending operator footer confirmation).** Installed via `pi install`. Source-verified: passive statusline extension (`ctx.ui.setStatus`), gh-CLI auth (stores no token), no tool/command/polling service; renders PR #, checks state, review state, comment counts in pi-footer's extension-status row. Remaining evidence: operator glances at the footer on a PR branch after next pi restart.
3. **@robhowley/pi-merge-ready@0.12.0 — HOLD (named fix condition).** Installed (the doc-55 name 'pi-merge-ready' resolves to this scoped package; unscoped name 404s). Its `merge_ready_status` tool works against a real PR and correctly reported checks=passing and mergeability=blocked — but reported `review: "approved"` while gh authoritative fields showed reviewDecision empty with zero reviews. On qq's owner-held review gate, an advisory that labels an unreviewed PR 'approved' misleads the exact surface it exists to summarize. Revisit if upstream maps the review signal to GitHub's reviewDecision field; its repair-loop skill also overlaps deliver-change mechanics and stays out regardless.

Environment consequence: both packages now sit in ~/.pi/agent settings (trial installs; pi-merge-ready's removal rides its HOLD if the operator concurs).

Closure 2026-07-21: operator concurred with all three dispositions (asked-and-answered exchange). pi-merge-ready removed (pi uninstall npm:@robhowley/pi-merge-ready; settings entry and node_modules gone). pi-github-pr remains installed as the ambient footer surface; the pending footer confirmation is discharged by continued operator usage. AC#2: deliver-change step 8 now names the gh CLI as the authoritative terminal surface; operator merge remains the sole disposition point (step 9 unchanged).
<!-- SECTION:NOTES:END -->
