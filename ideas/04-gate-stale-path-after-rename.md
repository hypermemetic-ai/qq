# Gate silently stuck after a repo rename — `no-mistakes init` repairs it

**Status:** _both failure modes root-caused. (1) stale-path → one-command repair (below).
(2) the "post-review stall" is not a stall at all — the run parked in `awaiting_approval`
waiting for a human to approve review findings; see below (root-caused 2026-07-07).
2026-07-08 update: qq now drives landings with `no-mistakes axi run --intent`,
sets `auto_fix.review: 3`, and handles parked questions through
`no-mistakes axi respond`; the `attach` advice below is incident history, not
current procedure._

## Symptom
`git push no-mistakes <branch>` **succeeds** (`* [new branch] …`) but no pipeline
runs and no PR ever opens — you sit waiting on a review that never starts.
`no-mistakes status` from the repo says *"repo not initialized."* Looks stalled;
it's actually a dead registration, and the push "success" hides it.

## Root cause
The `hypercore → qq-ac → qq` renames moved the repo directory but never updated the
**no-mistakes gate registration**. The gate stored the repo's working-tree path (in
`~/.no-mistakes/state.sqlite`, table `repos`) and the gate bare repo's
`remote.origin.url` under the *original* identity — `/home/qqp/projects/hypercore`
and `…/hypercore.git`. On every push the notify-push hook `chdir`s to that path to
configure the run's worktree git identity and dies:

```
configure worktree git identity: … chdir /home/qqp/projects/hypercore: no such file or directory
```

notify-push exits 1 → no run is created. But the ref push itself already landed, so
the failure is **silent to the pusher** — only a `remote:` warning line hints at it.
Every branch on that gate is affected at once (this blocked both the methodology
push and the parallel `herdr-pull-agent` push).

## The repair (verified)
Run from the repo at its current path:

```
no-mistakes init      # idempotent: "refreshes the bare repo, repairs the no-mistakes
                      # remote, records the repo in the DB" — corrects path + origin
                      # URL in the SAME gate repo (hash unchanged)
no-mistakes rerun     # trigger the branch that was already pushed
```

After init, `status` shows the correct `repo /home/qqp/projects/qq` +
`remote …/qq.git`, and the already-pushed branch reruns. One `init` fixes every
branch on that gate (it unblocked the parallel session too).

## Second failure mode: NOT a wedge — the run parked in `awaiting_approval` (root-caused 2026-07-07)
The note above guessed a "shared-daemon fault / two-concurrent-run deadlock." Wrong.
The frozen run's own recorded state (`~/.no-mistakes/state.sqlite`, table
`step_results`) shows the `review` step ended with **`status = awaiting_approval`**,
the next step (`test`) still `pending`, and the run row carries
`awaiting_agent_since = 1783390760` (2026-07-06 21:19:20). The run isn't wedged — it's
**waiting for a human to approve the review findings**, and the approval prompt was
never surfaced into the operator's flow.

Why it parked: review returned two `action:auto-fix` findings at `risk_level: medium`
(the `jq`-guard + reject-`0` issues on `bin/qq-herdr-pull`), and the gate config sets
`auto_fix.review: 0` → review findings are **not** auto-applied; the run parks and
asks. Nobody attached, so it sat forever. Both concurrent runs "froze together" for
the mundane reason that **both had review findings** — not a race. The silent
`state.sqlite-wal` and "no new step logs" are exactly what a *parked* run looks like
(no CPU, no writes); `no-mistakes status` reporting the run as plain "running" is the
real trap — `awaiting_approval` is a distinct state hidden behind that label. (The
findings were ultimately applied by hand on `main` as commit `c64a1fd`; the run was
abandoned in `awaiting_approval`, where it still sits as of 2026-07-07.)

**The correct move when a run "stalls after review":** current qq procedure is
`no-mistakes axi status`, then `no-mistakes axi respond --action approve|skip|fix`
for the parked gate. At the time of the incident this was handled with
`no-mistakes attach`; the same lesson holds, but objective review findings now
auto-fix via `auto_fix.review: 3` and only judgment-bearing questions should park.

## Prevention
- **Add "refresh the gate" to the repo rename/move checklist:** any no-mistakes repo
  that is renamed or moved needs `no-mistakes init` at the new path. The `qq-ac`
  reframe re-registered the Claude Code plugin but missed the gate — same class of
  miss.
- **"Stalled after review" = check for a parked gate first.** Run
  `no-mistakes axi status`, then answer with `no-mistakes axi respond` before
  assuming a crash. The earlier "don't run two gate runs at once" advice was based on
  the misdiagnosis and is dropped — concurrent runs are fine; both just needed approval.
- **Make hidden states loud (upstream asks):** (1) a failed notify-push should not
  leave `git push` looking successful — a `no-mistakes doctor` check flagging a
  registered repo path that no longer exists would have caught failure-mode #1
  instantly. (2) `no-mistakes status` should surface `awaiting_approval` distinctly
  (and ideally notify) instead of reporting a run that needs you as plain "running" —
  that hidden state is what made #2 read as a 14-hour freeze.

_(2026-07-06)_
