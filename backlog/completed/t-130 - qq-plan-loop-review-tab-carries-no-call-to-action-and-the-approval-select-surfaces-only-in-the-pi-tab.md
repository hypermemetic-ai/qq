---
id: T-130
title: >-
  Retire the qq-plan-loop bridge and pi-hunk; grilling re-owns the planning
  interaction
status: Done
assignee: []
created_date: '2026-07-21 05:57'
updated_date: '2026-07-22 00:07'
labels: []
dependencies: []
documentation:
  - doc-77
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Realigned 2026-07-21. Original incident (preserved): plan_loop_submit opened the hunk review surface in a NEW tab; the approval select appeared only in the pi tab after that tab closed; an aborted submit silently idled the loop and refused resubmit. Operator ruling in this session's exchange: the plan-loop machinery is the weakness — radically simplify back to the grilling step rather than patch the interaction, and retire hunk too ('I want something that just works, I don't want to answer any design questions around the planning step'; 'proceed').

Decision ledger:
1. Retire cockpit/pi/qq-plan-loop.ts and its test outright (no CTA/abort patches) — operator ruling, 2026-07-21 exchange.
2. Grilling re-owns the interaction (partial revert of T-119's slimming): native structured questions, plan drafted in .pi/plans/ and presented inline, explicit operator approval in conversation as the gate, fail-closed preserved — operator ruling, same exchange.
3. Retire pi-hunk: deliver-change diff review goes vendor-neutral (present inline); package uninstalled at land — operator ruling ('we can probably retire hunk too'), confirmed 'proceed', same exchange.
4. Operator-machine removals (settings.json extension entry, pi-hunk package) ride at land time — deliver-change convention.

Non-goals: no replacement plan software adoption (Option B checked: the loop WAS the in-house software; no pi-native plan mode exists); openwiki refresh (maintainer Actor); T-122 plans-doc capture survives unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cockpit/pi/qq-plan-loop.ts and tests/test-plan-loop.sh deleted; no tracked reference to qq-plan-loop, plan_loop_submit, or pi-hunk remains outside backlog/ historical records
- [x] #2 grilling owns the interaction: structured questions via the native question tool, plan drafted under .pi/plans/ and presented inline, explicit conversational approval as the fail-closed gate; T-122 plans-doc capture retained
- [x] #3 deliver-change diff review is vendor-neutral (no pi-hunk prescription); ratchet baselines re-measured and tests/test-ratchet.sh green
- [x] #4 operator-machine removals at land: settings.json drops the qq-plan-loop.ts extension entry; pi-hunk package uninstalled
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landed 2026-07-21 via PR #198. Operator-machine removals executed: ~/.pi/agent/settings.json dropped the qq-plan-loop.ts extension entry; @roodriigoooo/pi-hunk uninstalled (settings and node_modules verified clean). Next pi start runs without the bridge; planning is conversational under grilling.
<!-- SECTION:NOTES:END -->
