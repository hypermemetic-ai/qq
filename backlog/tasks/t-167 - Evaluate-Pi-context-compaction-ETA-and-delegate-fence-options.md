---
id: T-167
title: 'Evaluate Pi context, compaction, ETA, and delegate fence options'
status: In Progress
assignee: []
created_date: '2026-07-27 03:35'
updated_date: '2026-07-27 04:19'
labels: []
dependencies: []
documentation:
  - doc-102
  - doc-103
priority: high
type: spike
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Investigate six external candidates against qq's current operating model: pi-context-view; pi-blackhole and the broader state of the art in drop-in Pi compaction; pi-eta; and the ZeroBoot, Gondolin, and Microsandbox alternatives to qq's current Landstrip-backed delegate confinement. Produce decision-grade evidence and explicit adopt / isolated-trial / hold / reject recommendations. Refine the ETA trigger around the next point where the operator is expected to interact with the system, coordinating that transition with the concurrent voice-design Change.

Boundary: assessment, isolated temporary probes where practical, and one durable report only. Do not install a candidate into the live Pi runtime, change delegate confinement, or encode the ETA rule into qq. Any adoption or migration is a separately aligned Change.

Decision ledger:
- Approved investigation plan and ownership boundary: doc-102, approved in the operator asked-and-answered alignment exchange, 2026-07-27, this session.
- Integrated research scope, no adoption or host mutation, and the operator-waiting-interval ETA rule as a working hypothesis: same operator-approved exchange.
- The transition means the next expected point of operator interaction, not a generic “operator-ready handoff”; reconcile its vocabulary and semantics with the concurrent voice-design Change: operator clarification in the same exchange.
- pi-blackhole assessment broadens to state-of-the-art compaction that could automatically improve on Pi's native compaction, not merely validation of one package: operator clarification in the same exchange.
- Candidate recommendations remain open outcomes of this Task; no adoption decision is embedded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pi-context-view, pi-blackhole/state-of-the-art Pi compaction, and pi-eta receive source-audited, compatibility-aware recommendations grounded in opened primary sources and isolated probes where practical
- [ ] #2 ZeroBoot, Gondolin, and Microsandbox are compared with current Landstrip against qq's declared threat model, platform and lifecycle constraints, worktree and credential needs, and integration cost
- [ ] #3 The ETA measurement transition is reconciled with the concurrent voice-design Change and stated as an observable triggering and closing rule with research-before-implementation, time-to-PR, scope-change, parallel-work, and post-merge examples
- [ ] #4 Exactly one cited, confidence-tagged research report is attached and gives explicit adopt / isolated-trial / hold / reject recommendations, dependencies, gaps, and smallest follow-up checks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research completed 2026-07-27. Source audit: recovered researcher run d6df7808 (original run 8868479c timed out during synthesis); accountable owner reopened recommendation-controlling sources. Final report: doc-103. Live installation, compaction, and VM probes remained outside the approved boundary.
<!-- SECTION:NOTES:END -->
