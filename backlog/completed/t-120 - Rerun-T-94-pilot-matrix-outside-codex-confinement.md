---
id: T-120
title: Rerun T-94 pilot matrix outside codex confinement
status: Done
assignee: []
created_date: '2026-07-20 16:51'
updated_date: '2026-07-20 17:47'
labels: []
dependencies:
  - T-94
priority: high
type: task
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
T-94's operator-accepted HOLD names its unblock conditions: reproduction of the 9-check pilot matrix outside outer Codex confinement, or a Landstrip fix plus full rerun. This experiment takes the first path: stage the pilot launch contract (pi-subagents@0.35.1 + native Landstrip + jiti under .pi/npm) in a fresh worktree and rerun pilot/checks/run-all.sh plus the real-Pi smoke probe from a pi-hosted shell with no outer codex sandbox, capturing fresh raw evidence. Output is a verdict: matrix green outside codex confinement (T-95 un-parks) or a defect that survives outside confinement (HOLD stands with attribution).

Decision ledger:
- Run the unblock experiment now, as the first track of the fast-path (cache/preload/parallelize) capability, with the one-store/three-rails design and sequence: operator approval, asked-and-answered alignment exchange, 2026-07-20 project-home session.
- Unblock condition itself (reproduction outside outer Codex confinement): T-94 operator-accepted HOLD, recorded in T-94 Implementation Notes and T-95 park note, 2026-07-19.
- Fast-path guardrails (no semantic answer-reuse, read-only speculation, 3-5 ticket cap stands, fresh-context independence preserved, latency probes as Checks): operator-approved in the same 2026-07-20 alignment exchange.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pilot/checks/run-all.sh executed from a pi-hosted shell outside codex confinement; fresh raw logs captured under pilot/evidence/raw/ distinguishing this run from the codex-confined run
- [ ] #2 Real-Pi smoke probe across the wrapper/Landstrip boundary succeeds or fails with fresh attribution outside codex confinement
- [ ] #3 pilot/evidence/matrix.md and findings.md updated with the rerun verdict; if green, T-95's park note is recommended for removal
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All nine pilot checks PASS outside outer Codex confinement (7 consecutive green runs), satisfying T-94's stated release condition; the codex-confined failures were substrate-nesting artifacts. findings.md records ADOPT and recommends removing T-95's park note. The checker's narrative layer was restructured so generated prose equals observed facts by construction (strict three-state attemptOk, predicate-list verdicts, static rule text). Review trail: five fresh-reviewer rounds, one operator circuit-breaker design call, final round PASS with zero findings. Evidence: pilot/evidence/matrix.md + raw logs, branch feat/t-120-pilot-rerun.
<!-- SECTION:FINAL_SUMMARY:END -->
