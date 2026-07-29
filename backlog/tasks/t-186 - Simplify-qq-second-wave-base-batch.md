---
id: T-186
title: 'Simplify qq: second-wave base batch'
status: To Do
assignee: []
created_date: '2026-07-29 15:22'
updated_date: '2026-07-29 15:23'
labels:
  - base-batch
  - simplification
dependencies: []
documentation:
  - doc-124
priority: high
type: feature
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Plan:** doc-124 (attached). Second-wave simplification base batch, succeeding doc-51. Driver (operator, verbatim): "It's preemptive at this point. I saw how bad it got and I now wanna prevent the same kind of debt accumulation."

**Decision ledger** (all settled in the 2026-07-28/29 alignment walkthrough; records mint in encoding Changes as noted):

1. Driver preemptive; prevent re-accumulation — asked-and-answered exchange.
2. Scope all of qq; base-batch umbrella mode; PR-278 simplification-shaped findings fold in — asked-and-answered exchange.
3. Delegate runtime rebuilt ground-up as the minimum (role separation, parallel batch, completion-as-artifact, observation-as-records); reverses T-154.2 — exchange; record mints in E3.
4. Blocking dispatch; no async/wake/inbox — exchange.
5. Operator channel during runs = fork-and-chat; qq-split-fork retained slim — exchange.
6. Confinement deleted (Git owns isolation; read-only roles = brief + verification) — exchange; record mints in E3.
7. Observer ground-up: ledger materialized, intake registry dissolved (backlog-search coverage + dispositions doc), span core deleted post-verification, dual-run machinery expires — exchange.
8. Observer dispositions doc lives in external backlog store — exchange.
9. Backlog state migrates to `~/.local/state/qq/store/` + repo symlink; autosync sync; whole-store move — fork-settled 2026-07-29, delivered verbatim; born-in-worktree retired, record mints in M3.
10. Merge authority verbatim: "I would rather really allow you to merge everything." Bot-merge for all batch Changes + capture PR given green CI + fresh review + verified envelope — batch-scoped opt-out, recorded verbatim.
11. Orchestration in a fresh accountable session; sequential delivery — exchange.

**Question card (the one answered card):**

- Q driver → "It's preemptive at this point... prevent the same kind of debt accumulation."
- Q scope → "All of qq." Q mode → "Base-batch style umbrella." Q findings → "Fold simplification-shaped ones in."
- Q plan shape → "Way too many components. We're gonna have to discuss each one together." (component walkthrough held; rulings 3–9 resulted)
- Q change set → 10 Changes approved with execution-mode rulings.
- Q merge authority → "I would rather really allow you to merge everything." Q orchestration → "fresh session."
- Replaced dependencies: pi-subagents vendor runtime; born-in-worktree convention; Landstrip confinement; observer ledger/registry stores; backlog-in-repo.
- Retained dependencies: GitHub Flow; ruleset + qqp-bot identity; worktree isolation; completion envelopes + owner tree-verification; observer flow; execution profiles (repo-resident policy); qq-split-fork (slimmed).
- Undecided (parked, doc-124): A2 pins, A3 reaper cadence, B3, B4, B5, B7, C1/C3, Q4 review gate, Q6 mirror boundary, Q8 reopenings, fork-and-settle convention.

**Orchestration:** sequential, one Change at a time; per Change: fresh Checks + fresh-context review + envelope verification + bot-merge per decision 10; stop and notify operator on any new consequential decision (doc-124 orchestration rules are binding).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All ten child Changes landed and merged per doc-124
- [ ] #2 Ratchet green on operator machine and CI with identical answers
- [ ] #3 Delegate runs terminalize truthfully (no completed-but-failed)
- [ ] #4 backlog is a symlink into ~/.local/state/qq/store with autosync heartbeats
- [ ] #5 qq-observe reduced to ~2,500 lines or less with registry stores deleted
<!-- AC:END -->
