---
id: T-179
title: Restore operator-stage guarded-pane verification
status: In Progress
assignee: []
created_date: '2026-07-27 11:34'
updated_date: '2026-07-27 17:49'
labels: []
dependencies: []
modified_files:
  - extensions/qq-operator-stage.ts
  - tests/test-qq-operator-stage-extension.sh
priority: high
type: bug
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore qq operator_stage after repeated cross-Repository live failures on Herdr 0.7.5. Pane split, rename, and send-text succeed, but the extension’s read-back verification cannot observe the unexecuted command and intentionally tears down the owned pane. The operator-only workflow is therefore blocked despite zero command/provider side effects. This Change owns the qq Pi-extension verification seam and focused regression only; it does not modify Herdr, weaken verification, focus a pane, send Enter/keys, execute staged commands, or change danger/notification/outcome semantics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 operator_stage can verify the exact unexecuted staged line in a live Herdr 0.7.5 no-focus pane before notifying the operator.
- [ ] #2 Verification remains literal, fail-closed, bounded, and source enforced; failures tear down the owned pane and no path sends Enter/keys, focuses a surface, or executes the staged command.
- [ ] #3 Focused regression proves the live-compatible read-back source/shape and existing low/high danger, teardown, notification, and drift-net behaviors remain intact.
- [ ] #4 A safe live sentinel UAT leaves the command unexecuted, then cleanup removes the temporary pane; applicable Checks and fresh review pass; the Change is delivered as one unmerged PR.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reproduce the source-selection/read-back incompatibility with a no-focus temporary pane and an unexecuted harmless sentinel; identify the smallest qq extension correction; add focused regression that distinguishes current unsubmitted input from historical output; preserve fail-closed teardown and no-focus/no-key invariants; run focused and applicable Repository Checks, fresh review, safe live UAT, and deliver one unmerged PR.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: qq
created: 2026-07-27 11:36
---
2026-07-27 read-only diagnostic addendum: a global Pi-session search found no live successful operator_stage result after argument validation from the earliest observed 2026-07-24 calls through today, across qq wM and DecIQ w1Y; all discovered calls failed at read-back verification. T-144 records a successful manual pattern demonstration, while the landed focused test mocks pi.exec. Treat this as a never-live-proven integration gap unless implementation evidence proves a later regression. No retry or provider action occurred.
---

author: qq
created: 2026-07-27 17:49
---
2026-07-27 implementation/review evidence — Live Herdr 0.7.5 diagnosis proved the pane-last wait-output invocation was rejected before matching; pane-first invocation observes the exact unsubmitted current input. The fix is one production-line argv reorder (+1/−1; zero decision-point change) plus a state-aware regression. Safe no-execution live probes matched exact staged text, left sentinel effects absent, and proved owned-pane cleanup. Fresh review run 7eb1c7c8-184a-485b-86ea-b5c68113964c returned VERDICT: PASS with no material introduced failures. Harness completion was marked failed only by the recurring missing execution-profile receipt/contradictory structured-output substrate after the verdict.
---
<!-- COMMENTS:END -->
