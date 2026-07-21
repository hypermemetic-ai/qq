---
id: T-117
title: >-
  Trial: all-terminal plan/review loop — revdiff vs Hunk on pi 0.80.10 under
  Herdr
status: Done
assignee: []
created_date: '2026-07-19 23:37'
updated_date: '2026-07-20 03:11'
labels: []
dependencies: []
documentation:
  - doc-68
  - doc-65
  - doc-69
priority: high
type: task
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator-approved trial (evidence-generating, per doc-63's structural note). Find the best ALL-TERMINAL human-in-the-loop plan/review loop for qq: read-only exploration → plan → operator annotation → structured feedback → revision with plan-version diff → explicit approval → execution; plus post-implementation diff review. Polish is the top-weighted criterion: these are the highest-value moments where operator judgment enters the system. Evidence: doc-68 (terminal-loop research), doc-65 (plannotator round, superseded on modality).

Corpus (one identical run per candidate): a real markdown plan from a genuine qq work item, a revised version of that plan after annotations, and the resulting implementation diff.

Candidates:
- revdiff + its pi package (pin version at trial time): `--only` plan annotation, `--compare-old/--compare-new` version diffs, direct pi terminal handoff (blocking takeover).
- Hunk + @roodriigoooo/pi-hunk (0.8.0+): second-pane/watch topology, explicit checkpoint semantics.
- Phase-control slot: pi-openplan (file-backed plans under .pi/plans/) AND @narumitw/pi-plan-mode (0.20.0; T-107 DROP re-opened for evidence only — see ledger). A thin qq-owned bridge extension is the fallback if neither composes.

Axes to score hands-on: annotation ergonomics (the polish criterion); plan-version-diff handling; approval-gate behavior (confirm/deny revdiff's exit-0 clean-vs-discard ambiguity; verify pi-hunk submitted-empty-review = approval); topology feel (blocking takeover vs dedicated Herdr pane); full-loop glue gaps; coexistence with rpiv-todo, slopchop, qq-backlog-guard, fff.

Hard constraints:
- Plan artifacts NEVER under backlog/ (guard-enforced; convention from T-101/doc-54). Use .pi/plans/ or session temp.
- Pin all versions; record every install/settings mutation (prefer `pi -e` ephemeral where the package supports it).
- Trial is evidence-generating ONLY. It reverses nothing: adoption, any T-107 (pi-plan-mode) or T-110 (slopchop) reversal, and any grilling slimming are later dispositions with their own alignment. grilling remains in force during the trial.
- Code-diff axis: winner-vs-slopchop comparison is IN evidence scope (operator-approved reversal axis), but slopchop stays the review surface until an adoption Change says otherwise.

Decision ledger:
- Trial approved with BOTH reversal axes (pi-plan-mode re-trial; winner-vs-slopchop) in evidence scope: operator, asked-and-answered alignment exchange, 2026-07-19 project-home session ('yesssss! let's do it!' approving the proposal that named both reversals as operator decisions).
- Phase-control candidates pi-openplan + pi-plan-mode on trial, thin qq bridge as fallback: same exchange.
- Plan artifacts outside backlog/: T-101 convention + doc-54, guard-enforced.
- Trial does not authorize adoption or disposition reversals: this ticket's own constraint text, operator-aligned in the same exchange.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both review candidates (revdiff, Hunk/pi-hunk) run end-to-end on the full corpus on pi 0.80.10 under Herdr; per-axis scores and evidence (notes/recordings) captured
- [x] #2 Approval-gate behavior documented per candidate: revdiff exit-0 ambiguity confirmed or denied hands-on; pi-hunk empty-submit-approval verified
- [x] #3 Full loop (explore → plan → annotate → revise → version-diff → approve → execute) trialed with at least one phase-control candidate; every glue gap named
- [x] #4 Winner-vs-slopchop code-diff comparison recorded (evidence only; no surface change)
- [x] #5 Coexistence check: rpiv-todo, slopchop, qq-backlog-guard, fff unaffected; zero writes under backlog/ outside CLI-managed records
- [x] #6 Findings reconciled into one Backlog research doc attached here, with adopt/hold verdict and residual gaps; all installs/mutations listed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TRIAL EXECUTED 2026-07-19 (operator-delegated agent run, fresh tmux-driven pi sessions): all four passes complete, all six ACs met; full reconciliation in doc-69. Verdict: revdiff = plan-review surface (ADOPT-qualified), pi-openplan = phase component (ADOPT-qualified), slopchop keeps code review (no re-open), hunk/pi-hunk HOLD (mine its submit semantics for the bridge), pi-plan-mode stays dropped. Bridge extension requirements converged (4 items, doc-69). NOTE (2026-07-19 later): operator questioned doc-69's surface ranking as polish-inverted; ranking declared provisional. Demo reel recorded (agent-operated, asciinema): /tmp/t117/reel/*.cast + REEL-GUIDE.md — the surface call (revdiff vs hunk+pi-hunk) settles by operator viewing, then adoption is its own aligned Change. Artifacts: /tmp/qq-t117-trial (scratch worktree, live-loop diff, TRIAL-NOTES.md raw log).
---
SETUP LOG (2026-07-19, project-home session):
Installed (pinned): brew revdiff 1.11.1, brew hunk 0.17.3. Later: brew asciinema 3.2.1 (demo reel recording). pip --user pexpect attempted, PEP-668 refused (no change; tmux used instead).
Pi packages: ZERO settings mutation — all candidates load via `pi -e` ephemeral (verified leaves no persistent trace in ~/.pi/agent): npm:@narumitw/pi-plan-mode@0.20.0, npm:pi-openplan@1.7.0, npm:@roodriigoooo/pi-hunk@0.8.0, git:github.com/umputun/revdiff@v1.11.1. npm caches tarballs in ~/.npm (cache, not configuration).
Corpus: scratch worktree /tmp/qq-t117-trial (detached at origin/main c890f1b, post-#157). .pi/plans/t111-plan-v1.md + -v2.md (T-111 material, marked TRIAL CORPUS, NOT ALIGNED FOR DELIVERY); staged impl diff of v2 (6 files, +15/−104). TRIAL-RUNBOOK.md + TRIAL-NOTES.md live there.
Headless pre-checks PASS: (1) all four candidates load on pi 0.80.10 with baseline packages present and complete a print-mode turn; (2) qq-backlog-guard unit-probed in worktree context: write/edit under backlog/ BLOCKED, .pi/plans/ allowed; (3) corpus diff self-smoke: bash -n clean, y/qqy removed, qqbr/br/qqroot/qtree present, PATH mount intact, herdr config.toml parses.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Trial complete 2026-07-19: all six ACs met (doc-69 + addendum). Operator viewed the agent-operated demo reel and settled the surface call: hunk + pi-hunk wins (polish-first criterion + superior approval semantics); revdiff not adopted; pi-openplan owns the phase slot; slopchop keep/retire and the adoption Change shape go to a new alignment brief (follow-up ticket). Artifacts: /tmp/qq-t117-trial, /tmp/t117/reel.
<!-- SECTION:FINAL_SUMMARY:END -->
