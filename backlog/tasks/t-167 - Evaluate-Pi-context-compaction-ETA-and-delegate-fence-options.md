---
id: T-167
title: 'Evaluate Pi context, compaction, ETA, and delegate fence options'
status: Done
assignee: []
created_date: '2026-07-27 03:35'
updated_date: '2026-07-27 04:55'
labels: []
dependencies: []
documentation:
  - doc-106
  - doc-107
priority: high
type: spike
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Investigate six external candidates against qq's current operating model: pi-context-view; pi-blackhole and the broader state of the art in drop-in Pi compaction; pi-eta; and the ZeroBoot, Gondolin, and Microsandbox alternatives to qq's current Landstrip-backed delegate confinement. Produce decision-grade evidence and explicit adopt / isolated-trial / hold / reject recommendations. Refine the ETA trigger around the next point where the operator is expected to interact with the system, coordinating that transition with the concurrent voice-design Change.

Boundary: assessment, isolated temporary probes where practical, and one durable report only. Do not install a candidate into the live Pi runtime, change delegate confinement, or encode the ETA rule into qq. Any adoption or migration is a separately aligned Change.

Decision ledger:
- Approved investigation plan and ownership boundary: doc-106, approved in the operator asked-and-answered alignment exchange, 2026-07-27, this session.
- Integrated research scope, no adoption or host mutation, and the operator-waiting-interval ETA rule as a working hypothesis: same operator-approved exchange.
- The transition means the next expected point of operator interaction, not a generic “operator-ready handoff”; reconcile its vocabulary and semantics with the concurrent voice-design Change: operator clarification in the same exchange.
- pi-blackhole assessment broadens to state-of-the-art compaction that could automatically improve on Pi's native compaction, not merely validation of one package: operator clarification in the same exchange.
- Candidate recommendations remain open outcomes of this Task; no adoption decision is embedded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pi-context-view, pi-blackhole/state-of-the-art Pi compaction, and pi-eta receive source-audited, compatibility-aware recommendations grounded in opened primary sources and isolated probes where practical
- [x] #2 ZeroBoot, Gondolin, and Microsandbox are compared with current Landstrip against qq's declared threat model, platform and lifecycle constraints, worktree and credential needs, and integration cost
- [x] #3 The ETA measurement transition is reconciled with the concurrent voice-design Change and stated as an observable triggering and closing rule with research-before-implementation, time-to-PR, scope-change, parallel-work, and post-merge examples
- [x] #4 Exactly one cited, confidence-tagged research report is attached and gives explicit adopt / isolated-trial / hold / reject recommendations, dependencies, gaps, and smallest follow-up checks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research completed 2026-07-27. Source audit: recovered researcher run d6df7808 (original run 8868479c timed out during synthesis); accountable owner reopened recommendation-controlling sources. Final report: doc-107. Live installation, compaction, and VM probes remained outside the approved boundary.

Fresh review 1f43c21a reported three P2s: scope-replacement ETA continuity, duplicated T-123 proxy work, and missing compaction privacy comparison. All were fixed. Fix review 78503792 closed them and found one pending-summary persistence overstatement; corrected against source. Second fix review 48866f81 passed with no findings. Mechanical fix deltas: production LOC +0; runtime decision points +0.

After PR publication, coordination exposed that earlier PR #254 reserved doc-102/doc-103 and active T-170 reserved doc-104/doc-105. T-167 was renumbered to plan doc-106 and report doc-107; all owned references were repaired while T-165.1's intentional nested doc-103 citation was retained. Fresh collision-fix review 541942e2 passed with no findings. Mechanical delta: production LOC +0; runtime decision points +0; durable identity collisions -2.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered doc-107, the sole T-167 research report. Recommendations: isolated trial for pi-context-view after a real turn and for Microsandbox as a whole-delegate candidate; reject pi-blackhole as qq default and ZeroBoot for delegates; hold automatic compaction replacement, pi-eta, and Gondolin; retain current Landstrip and the operator-declined T-123 proxy-trial disposition. Defined operator actionable wait from accepted input to planned alignment:operator-turn-opened, with critical-path dispatch latency as a diagnostic. No runtime, confinement, or host state changed.
<!-- SECTION:FINAL_SUMMARY:END -->
