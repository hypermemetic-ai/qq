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

Nine distinct incidents, all the same shape. A command returned output, exit 0,
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
| `bash -n` on a `bash -c '...'` body | a fix introduced single-quoted `printf` formats **inside** the outer single-quoted literal, terminating it. The quote count stayed even, so the file parsed and `bash -n` reported it valid — while the body had silently stopped being one string. Twice cited as evidence that the spawn blocks were sound. Only a behavioral run shows it. |
| `backlog task create -l a -l b -l c` | repeated flags keep only the **last**; exit 0, no warning. TASK-20 shipped with one label of three, and the agent reported all three applied. The CLI wants one comma-separated list. |

Two more sit just outside the table because their output was not merely wrong but
*plausible*: a `SLUG` sanitiser (`${SLUG//[^a-z0-9-]/}`) that turns
`../../etc/foo` into `etcfoo` and installs it, rather than refusing; and a
verification harness that ran `qq-wave` from the wrong working directory, so its
`git rev-parse --show-toplevel` resolved to the real repo — the test passed the
"fix" while never reproducing the bug. **A fix validated against a test that does
not reproduce the defect proves nothing.** Prefer refuse-on-bad-input to
sanitise-on-bad-input: a clamp that rewrites is this same failure shape wearing a
safety costume.

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

Where this is already enforced on main today: `qq-frontier` reads a pinned
revision (`--ref <rev>`); `qq-gate-view` guards every status read on the
reported branch and supervises `attach`; and `qq-wave` reads the frontier from
the same commit its workers branch from (gate finding RV-002). Where it is *not*
yet enforced: the `qq-activate.sh` install list is still hand-maintained, and
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
The pilot's own verdict is in `ideas/06-slicing-pilot-lessons.md`, which landed
with TASK-8.3 (PR #16) and is on main.

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
  `qq-frontier --ref <rev>` pins committed task-file reads to a
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

**Qualification, added after the fact.** Round count alone is the wrong signal. A
loop that surfaces a *new, real* defect each round is **converging**, not running
away — `task-6` reached round 8 and the finding was the nested-quote break, which
was genuine and which no earlier round had seen. The runaway signal is a round
that re-litigates a finding already resolved, or that trades one stylistic
preference for another. Cap on *novelty*, not on iterations. This cuts against the
"cap by trigger plausibility" prescription above; both readings are provisional.

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

## Reading 6 — the gate has exactly one agent, and no fallback (2026-07-09)

`codex` hit its subscription usage limit. `.no-mistakes.yaml` on `main` sets
`agent: codex`, and **every** pipeline stage — review, test, document, lint —
spawns that agent. Not one landing could complete for about ten hours. Three
escape routes were checked and all are closed:

- `agent` is read from the **default branch**, never the pushed SHA. Verified
  rather than assumed: a probe branch declaring `agent: claude` still spawned
  codex. So the switch cannot be made on the branch that needs it.
- `no-mistakes axi run` has no `--agent` flag, and the binary reads no
  agent-selecting environment variable.
- codex here is subscription-auth only (no `OPENAI_API_KEY`), so there is no
  billing fallback.

The pin exists for speed (gpt-5.5 on the priority tier). The operator's ruling is
that the gate's independence comes from the reviewer having **fresh context** —
no memory of the authoring session — not from a different vendor. On that reading
the pin is a performance choice that silently became an availability
single-point-of-failure. Registered as TASK-22.

What actually landed the work: fresh-context Claude subagents performed the review
step, and the gate's own check commands (`shellcheck`, `bin/qq-registry-check.sh`)
were run verbatim. That is a **substitution of the gate's review, not of the
gate** — and it is worth being precise that the resulting landings carry no
`no-mistakes` run id. Their evidence lives in PR comments instead. The subagents
earned their keep: they reproduced a `qq-wave` rollback that destroyed a live
worker's branch and files when a *monitoring pane* failed to spawn, and an
`attach_supervised` loop that froze forever on an unqueryable run — the exact
freeze it existed to prevent. Neither was visible to `shellcheck`.

A related scope gap fell out of the same review: the git rail blocks
`git branch -D` when an agent types it, but the rail is a `PreToolUse` hook and
never sees git invoked from inside a script. `bin/qq-wave` force-removes
worktrees and force-deletes branches in its rollback trap. Registered as TASK-23.

## What to reconsider next session

- Should `qq-activate.sh` glob `bin/qq-*` instead of enumerating? (Changes
  install semantics for non-user scripts.)
- Does `check_active_branches` survive TASK-16?
- Is the slice pattern worth keeping in any form, or is the parent-task-plus-one
  branch the honest unit?
- Should the gate's fix-round cap be policy rather than judgment? (See the
  novelty-not-iterations qualification above.)
- If fresh-context subagents can stand in for the gate's review step, what
  exactly does the gate provide that they do not? Candidate answer: a run id, an
  evidence trail, and an enforcement point nobody can skip — none of which is the
  review itself. Worth stating plainly before the substitution becomes habit.
- Should an unlanded-branch delete be an operator action forever? It is today,
  because the rail blocks the agent's direct branch deletion — but `bin/qq-wave`
  force-deletes from inside a script, where the rail cannot see it (TASK-23).
  TASK-24 now covers the operator-handoff mechanics; TASK-23 still decides
  whether the rollback path is sanctioned or must become non-destructive.
