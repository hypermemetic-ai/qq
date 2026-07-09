# Driving gate fix loops on security-adjacent parsers

**Date:** 2026-07-08 · **Landing:** task-3 (PR #8) · **Steps involved:** gate review × 11 fix rounds (3 auto + 8 authorized), ~2h review step

## Symptom

A rewrite of the git rail (argv-aware matching, ~170 lines) entered the gate and
the review step ran **11 fix rounds** (3 within the auto_fix.review budget + 8
explicitly authorized at fix_review gates) — 30 findings, 12 fix commits, the
file grew to ~1100 lines — before passing. Each round's fresh reviewer found
real bypasses in the previous round's own fix code (heredoc handling alone
sprouted five generations of edge cases). Rounds cost ~10 min each; the landing
agent had to judge every gate.

## Root cause

Two compounding dynamics, neither a bug:

1. **Fresh eyes per round.** Each no-mistakes review/fix round is a new Codex
   process with no session memory (verified in `review.log`: distinct pids, no
   resume). That's why the loop *works* — the reviewer isn't attached to its own
   earlier fixes — and why it doesn't self-terminate: every round re-litigates
   the file with full paranoia and no notion of "good enough."
2. **Unbounded threat model.** A parser guarding against "destructive commands"
   has no natural stopping point — shell metaprogramming makes the bypass space
   infinite (`eval`, `env -S`, heredocs-into-pipes, `find -exec`, …). Without a
   written boundary, every round can honestly claim `error, auto-fix`.

## Fix

The landing agent draws the line, in three moves, escalating only as needed:

1. **Write the threat model into the file** (round 4): a header paragraph —
   *accident rail for well-intentioned agents, not a security boundary;
   string-execution vectors out of scope by design* — and instruct the fixer
   that reviews evaluate against it. Fresh reviewers read the file; the boundary
   travels with the code, not with any session.
2. **Cap by trigger plausibility, not defect class** (round 8): fixes stay
   justified only for triggers a well-intentioned agent plausibly emits (single
   shell feature, common idiom — `$((1<<2))`, `nohup --`, `restore --staged .`).
   Constructs needing 3+ composed features (heredoc+pipe+group) are accepted
   residual risk in both directions, recorded in test-table comments.
3. **Prefer shrinking fixes**: when a construct can't be confidently attributed,
   fall back to the conservative whole-line scan for it instead of modeling more
   grammar. The fallback can false-positive but can never *swallow* (silently
   skip analysis of real commands) — swallowing was the only defect class worth
   chasing to the end, because its triggers are benign (`echo $[1<<2]` disabling
   the rail for every following line).

Always-fix classes, no matter the round: **false positives** on benign commands
(the rewrite's founding purpose) and **swallowing-class** defects. Everything
else gets weighed against the written model.

## Verification

Review passed after the 8th authorized round (risk downgraded
high→medium→pass). Final state locally re-verified on the merge candidate:
150/150 rail block/allow cases, 20/20 qq-phase/WIP concurrency cases. The test
table (tripled by the loop) now locks every fixed bypass and every protected
false positive, including the documented conservative case (double-heredoc
pipelines).

## Reusable rules

- Ship the threat model **in the code header before the gate sees it** — it's
  cheaper than negotiating it round-by-round, and it binds stateless reviewers.
- Budget ~3 rounds; at the cap, amend the line explicitly (trigger plausibility)
  rather than silently approving — the amendment goes in `--instructions`, so
  the run record carries the policy.
- Every authorized fix round should also grow the committed test table — fixes
  without regression locks re-litigate next landing.
- Watch file growth: 6× line count through a fix loop is tolerable only because
  the table holds it; flag a simplification pass if the file needs human
  maintenance again.
