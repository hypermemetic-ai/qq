# Gate silently stuck after a repo rename — `no-mistakes init` repairs it

**Status:** _stale-path root cause found + one-command repair; a second post-review stall (below) is still open._

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

## Second failure mode (open): run stalls right after review
`init` + `rerun` cleared the notify-push death — runs then **started** and moved
through `rebase → intent → review` cleanly. But both concurrent runs (the
methodology branch and `herdr-pull-agent`) then **froze immediately after the
review step** and never reached `document / lint / push / pr`. The whole gate went
silent: no new step logs, and `state.sqlite-wal` — the daemon's write heartbeat —
stopped at 21:19 and still hadn't moved 16 min later, with the daemon process
alive and `status` still reporting the run "running." No PR ever opened.

So the path repair is necessary but here was **not sufficient**: something wedges
after review, and it hit both runs at once — pointing at a shared-daemon fault (the
auto-fix/apply step, or a two-concurrent-run deadlock), not the branch content.
`herdr-pull-agent` was unblocked in the moment by **bypassing the gate** —
cherry-picking its two commits onto the (since-advanced) `origin/main` and pushing
straight to main. The post-review stall itself is **unresolved**; repro next with
one run in isolation vs. two concurrent to isolate a possible concurrency lock.

## Prevention
- **Add "refresh the gate" to the repo rename/move checklist:** any no-mistakes repo
  that is renamed or moved needs `no-mistakes init` at the new path. The `qq-ac`
  reframe re-registered the Claude Code plugin but missed the gate — same class of
  miss.
- **Make the trap loud (upstream ask):** a notify-push that fails should not leave
  `git push` looking successful. A `no-mistakes doctor` check that flags a
  registered repo path which no longer exists would have caught this instantly.
- **Until the post-review stall is understood, don't run two gate runs at once** on
  the same daemon — both froze together on 2026-07-06 right after review.

_(2026-07-06)_
