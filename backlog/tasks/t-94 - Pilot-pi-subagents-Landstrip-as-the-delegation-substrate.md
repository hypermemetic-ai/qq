---
id: T-94
title: Pilot pi-subagents + Landstrip as the delegation substrate
status: Done
assignee: []
created_date: '2026-07-19 16:41'
updated_date: '2026-07-19 20:25'
labels: []
dependencies: []
documentation:
  - doc-56
priority: high
type: task
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Largest shrink opportunity from the pi sweep (evidence: doc-56). Compose pi-subagents (orchestration, strict JSON-Schema completion envelopes) with Landstrip (OS sandbox) through the PI_SUBAGENT_PI_BINARY wrapper hook verified in source, selecting sandbox policy by role via PI_SUBAGENT_CHILD_AGENT. Retain qq's outer process-tree timeout during the pilot. The pilot runs WITHOUT the qq-status stage bridge (killed per ledger below): delegate visibility is pi-subagents' native run artifacts plus the orchestrator transcript; the detail-file protocol stays (plain files, not herdr).

Decision ledger:
- Pilot before any retirement of qq-dispatch/codex-profiles: doc-56 recommendation, accepted in this sweep's ticket disposition (operator instruction, T-93 follow-up session).
- Herdr stage/presence/notification machinery dropped entirely with no pilot evaluation gate — pilot runs bridge-less from the start: decision-3 (operator asked-and-answered alignment exchange, 2026-07-19: 'kill the herdr machinery. I''m confident.'). Accepted loss: out-of-transcript blocked-delegate notification. Cockpit, topology scripts, and messaging are out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pilot wrapper selects reviewer/researcher read-only and implementer workspace-write Landstrip policies by role and fails closed when Landstrip is unavailable
- [ ] #2 doc-56's pilot checks pass with fresh evidence, minus the stage-publishing check dropped with the herdr machinery: sandbox confinement, no context/skill leak, schema rejection of bad envelopes, descendant teardown under timeout, signal/pane-close cleanup, auditable artifacts, worktree-resume containment, unsupported-kernel fail-closed
- [x] #3 Pilot findings attached to this task with an adopt/hold verdict for migration
- [x] #4 Decision record for the herdr-machinery drop minted inside this Change per grilling; this ledger switched to the record id before finalization
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PILOT FINDINGS + HOLD VERDICT (delegate evidence verified against tree, 2026-07-19; branch feat/t-94-subagent-pilot, commits 233dfee..e2e734a, 25 pilot/ files, 9 raw logs):

AC #1 wrapper: implemented (role-aware Landstrip policy selection, git-dir discovery, fail-closed, outer timeout retained, bridge-less).
AC #2 NOT MET — 9-check matrix: 7 PASS (3 skill/context stripping, 4 envelope schema rejection, 5 timeout descendant teardown, 6 signal cleanup, 7 auditable artifacts, 8 resume cwd containment, 9 fail-closed absence/unsupported); Check 2 FAIL — Landstrip 0.17.30 nested beneath the outer Codex workspace-write sandbox denies its own explicit allowWrite roots; real Pi exits 127 (libc.so.6 cannot open) with non-empty allowWrite; Check 1 INCONCLUSIVE-UNDER-SUBSTRATE — Codex rejects the loopback control so network denial is unattributable.
AC #3 VERDICT: HOLD adoption of pi-subagents+Landstrip as the delegation substrate. Unblock conditions: reproduction outside outer Codex confinement, or a Landstrip fix + complete 9-check rerun on a substrate permitting network attribution. This HOLD does not reverse the separately aligned herdr-machinery kill (decision record minted in this Change per AC #4).
Full matrix + findings: pilot/evidence/matrix.md + findings.md on the branch. Consequence: T-95 stays parked (gates on adopt).

OPERATOR ACCEPTANCE (2026-07-19, dispatch session): HOLD verdict accepted — T-95 stays parked pending reproduction outside Codex confinement or a Landstrip fix + full 9-check rerun. Evidence-integrity rework (5 verified review findings) in flight before the pilot Change lands; herdr-kill decision-3 stands independently.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pilot complete; verdict HOLD (operator-accepted 2026-07-19). AC #1 met: role-aware wrapper selects read-only/workspace-write Landstrip policies and fails closed. AC #2 ran all nine doc-56 checks with fresh, review-corrected evidence: 6 PASS / 2 FAIL (Check 2 implementer allowWrite EPERM + Pi libc 127; Check 4 composed read-only envelope delivery EPERM even with capture-file grant) / 1 INCONCLUSIVE-UNDER-SUBSTRATE (network) — the box stays unchecked because the checks did not all pass; that IS the HOLD substance, and the ticket's adopt/hold fork (AC #3) resolved to HOLD. AC #3 met: findings + HOLD verdict attached, operator accepted; T-95 stays parked pending reproduction outside Codex confinement or a Landstrip fix + full rerun. AC #4 met: decision-3 (herdr machinery kill) minted in this Change and cited from this ledger. Evidence: pilot/evidence/matrix.md + findings.md on PR #151.
<!-- SECTION:FINAL_SUMMARY:END -->
