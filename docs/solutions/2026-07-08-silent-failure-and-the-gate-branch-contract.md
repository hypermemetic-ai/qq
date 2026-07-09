# Silent failure, and the gate's branch contract

**Date:** 2026-07-08 (first parallel wave) · **Status:** provisional — these are
readings of one long session, not settled law. Several point at changes we have
not made yet; a few may be wrong once TASK-11 and TASK-16 land.

## What happened

The first real parallel wave: five workers in their own worktrees, plus a
conductor, all landing through the gate. Most of the work landed. Almost all of
the *lost time* went to one failure shape, and to one contract nobody had
written down.

## Reading 1 — the failure shape: commands that answer instead of failing

Seven distinct incidents, all the same shape. A command returned output, exit 0,
and a plausible answer that was **wrong**, so the caller proceeded confidently.

| what we ran | what it did instead |
|---|---|
| `no-mistakes axi status` on a branch with no run | reported the *repo's* active run — a different task's pipeline |
| `no-mistakes attach` (no `--run`) | attached to the repo's active run, not the pane's branch |
| `no-mistakes attach` on a finished/superseded run | parked on an end-screen forever, awaiting a keypress no pane sends |
| `rg ... \|\| echo clean` (a worker's marker scan) | the `\|\| echo clean` fallback masked every nonzero `rg` status; conflict markers were committed |
| `probe='--split right'; git grep -c "$probe" origin/task-8.3-closeout -- 2>/dev/null \| wc -l` | `git grep` rejected the dash-leading pattern as an unknown option; stderr was suppressed and the pipeline lost the failing exit code, so `wc -l` reported 0 for text present in 5 files. Safe forms put `-e` or `--` before the pattern, and use `-F` for fixed strings. |
| `${afk:+--afk}` with `afk=0` | expanded — `0` is non-empty — so `--afk` was always passed |
| `qq-activate.sh` (hardcoded install list) | new `bin/` tools silently never reached `PATH` |

The two that cost the most were not in our code. `axi status`'s fallback is why
the task-8 worker sat *idle* while its own slice-0 run was parked on a finding:
its worktree HEAD had moved to another slice's branch, so status showed it a
different, healthy run. And a viewer built specifically to make pipeline state
visible spent an hour displaying a superseded run as if it were current.

**Provisional rule.** Treat "produced output" as orthogonal to "succeeded." In
particular: no-output is never evidence of success; a status command that can
fall back to a *different subject* must be pinned (`axi status --run <id>`), a
frontier read needs the TASK-19 `qq-frontier --ref <rev>` pin, and a
verification command must fail loudly — if it cannot fail, it is not
verification.

Where this is already enforced on main today: `qq-frontier` exists, reads the
current tree's committed `HEAD`, and accepts only `--afk` / `--json`. What lands
with TASK-19, not main yet: the pinned-rev `qq-frontier --ref <rev>` flag;
`qq-gate-view`, which guards every status read on the reported branch and
supervises `attach`; and `qq-wave`, which reads the frontier from the same
commit its workers branch from (gate finding RV-002). Where it is *not* yet
enforced: the `qq-activate.sh` install list is still hand-maintained, and
nothing stops the next `${var:+}`.

## Reading 2 — the gate's branch contract (rebase cannot land)

Discovered three times before it was believed:

1. A gate run rebases your commits onto its own head and appends review-fix
   commits **there**. Your local branch is now behind, with different hashes.
2. The gate's push target refuses non-fast-forward pushes.
3. The git rail blocks `--force` (correctly).

Therefore **a rebased branch can never reach the gate.** The only reconciliation
that lands is a *merge*: fetch the gate's head, merge it (and `origin/main`),
and re-apply your changes on top of *its* files so its hardening survives. Every
"rebase → push → rejected" cycle today was this, rediscovered.

Corollary for stacked slices: because each slice's gate run rebases that slice
onto `main` independently, **a hand-built stack does not stay a stack.** TASK-8's
pilot ended with slice 1 an ancestor of nothing, slice 2's documentation already
landed under slice 1's PR, and a PR (#17) re-opened on already-merged content.
The pilot's own verdict is in `ideas/06-slicing-pilot-lessons.md`, which lands
with TASK-8.3 (PR #16) and is not yet on main at the time of this capture.

## Reading 3 — the registry lies mid-stack, and that is (mostly) fine

`backlog/config.yml` sets `remote_operations: true` + `check_active_branches:
true`, so Backlog.md resolves tasks across in-flight branches. Mid-wave, the
board under-reports: a task marked `Done` on `main` still shows `To Do` because
some worker branch carries an older copy. Verified: TASK-7 was `Done` on `main`
while three branches held `To Do` copies.

Consequences, both real:
- **Do not audit registry discoverability mid-stack.** A gate reviewer did, and
  filed a finding whose premise dissolved in a single-branch reproduction.
- **Tools that must be right should not go through the CLI.** On main today,
  `qq-frontier` reads committed task files from the current checkout's `HEAD`;
  the TASK-19 `qq-frontier --ref <rev>` extension pins that read to a
  dispatcher-chosen revision precisely to sidestep this.

Unresolved: whether cross-branch resolution earns its keep at all. It buys
visibility into others' claims; it costs a board that cannot be trusted while
work is in flight. TASK-16 (gate-owned Done flips) may make the question moot —
if the merge carries the registry update, the lag disappears at its source.

## Reading 4 — fix loops still do not self-terminate

`task-3` took 11 rounds. `task-6` reached **round 13 over 1h26m** on a skill
capture. Each round is a fresh reviewer with no memory of the last, so nothing
converges on "good enough." The earlier prescription (write the threat model
into the file; cap by trigger plausibility) helped `task-3` but was never
generalized. See `2026-07-08-gate-fix-loops-on-security-adjacent-parsers.md`.

Open question: whether the cap belongs in `.no-mistakes.yaml` (`auto_fix.review`),
in the intent (an explicit "stop when X" clause), or in the landing agent's
judgment. Today it was the landing agent, late.

## Reading 5 — conducting is a real job

Workers ended turns on announcements ("handing to the gate…" then idle). Workers
self-approved `ask-user` findings about their own work. Workers exited leaving
conflicted PRs behind. None of this was malice; the protocol simply did not say
otherwise, and a worker biased toward proceeding will proceed.

The TASK-19 `bin/qq-wave` branch's preamble says: relay `ask-user` findings,
keep the run parked, never end a turn on an announcement, and use `axi status
--run <id>` when driving stacked branches. Whether a preamble is *sufficient* is
untested — TASK-17's context-pressure trigger and TASK-11's lifecycle view both
bear on it.

## What to reconsider next session

- Should `qq-activate.sh` glob `bin/qq-*` instead of enumerating? (Changes
  install semantics for non-user scripts.)
- Does `check_active_branches` survive TASK-16?
- Is the slice pattern worth keeping in any form, or is the parent-task-plus-one
  branch the honest unit?
- Should the gate's fix-round cap be policy rather than judgment?
