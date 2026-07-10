# Slicing-pilot lessons — TASK-8 (parent + dependency-linked tracer slices)

_Banked 2026-07-08 by the TASK-8 worker. Status: pilot complete; feeds the
`writing-plans` / `executing-plans` rework (operator decision 2026-07-08: those
skills get reworked only from this pilot's lessons). Shape piloted: parent
backlog task + dependency-linked slice sub-tasks, each slice landing through
the gate as its own small unattended run on its own branch._

## What was piloted

TASK-8 (orchestrate rework: Codex workers as first-class herdr panes) planned
by hand as parent + three slices: **8.1** skill rewrite → **8.2** records
retirement, executed *through* the new Build path as its live e2e exercise
(dep: 8.1) → **8.3** close-out (dep: 8.1, 8.2). Plus a **slice 0**: the plan
itself (design-doc substrate + minted sub-tasks) landed as its own first run.

## What worked

1. **Slice 0 = the plan as a landing.** Landing the design doc + minted slice
   tasks first gives the operator early visibility, publishes the sub-task IDs,
   and satisfies the registry gate before any code moves. It also forces the
   slicing to be explicit *before* build starts — the pilot's whole point.
2. **Sub-task IDs dissolve the worktree minting hazard.** `task-8.x` IDs can
   only collide inside one parent, and the parent has one owner — so a worker
   in a worktree can mint its own slices safely, where top-level IDs would race
   with parallel workers. Slice planning belongs to the task's own worker.
3. **Merged slices where the verification IS the work.** Old plan had "retire
   records" and "e2e verification" as separate tasks; running the records edit
   *through* the new lifecycle collapsed them into one tracer bullet — the
   deliberate red→repair round exercised the repair path on real work instead
   of a synthetic drill.
4. **Unattended runs queue cleanly within a slice.** The gate daemon serializes
   work without babysitting; background `axi run` is fine once a slice is ready.
   Successor slices can keep moving locally, but don't submit their gate run
   until the predecessor reaches `main` and the successor branch has absorbed it.
5. **Dependency links carried the sequencing.** `--dep` on the sub-tasks
   encoded "land in order" without any coordination protocol. (The *branch*
   stacking that accompanied them did not survive the gate — see friction #1;
   the dep links are the part worth keeping.)

## Friction to design around

1. **Main-relative gate runs mean a hand-built stack does not stay a stack.**
   This is the pilot's biggest structural lesson. Each `axi run` validates and
   lands its own branch against the `main` it saw; it does not preserve sibling
   stack ancestry or update successor branches. After four runs the stack had
   **delinearized**: `slice0` was still an ancestor of `slice1`, but `slice1`
   was no longer an ancestor of `slice2`, nor `slice2` of `slice3` (verified
   with `git merge-base --is-ancestor`). One PR was already CONFLICTING against
   `main` while the others read MERGEABLE — a state that silently invalidates
   any "just merge them in order" plan, because each merge invalidates the next.

   Don't fight it: **treat slices as serially landed, never as a live stack.**
   Land slice N, wait for it to hit `main`, then merge `origin/main` into slice
   N+1's branch and re-drive that gate run. The landing path must not depend on
   rebase + force-push repair: the git rail blocks force-push, and the gate's
   push target rejects non-fast-forward updates. Only one slice PR should be
   open-and-green at a time. Merging out of order, or merging a green PR whose
   predecessor just landed, is how you get a cumulative or conflicted diff.
   This is the rule `executing-plans` should encode.
2. **Corollary: a green PR is only green against the `main` it was checked on.**
   Re-check `gh pr view <n> --json mergeable` after every merge; expect the
   successors to flip to CONFLICTING and need an `origin/main` merge plus a
   fresh run, not a hand-fix.
3. **Review redundancy on stacks.** Each stacked run re-reviews unmerged
   predecessor content. Fine at three small slices; on long stacks either
   tolerate it or wait for merges between slices.
4. **`axi run` is current-branch-bound.** The branch is pinned at submission,
   so submit, then switch branches freely. One landing agent can drive N slice
   runs from one worktree.
5. **Never audit registry discoverability mid-stack.** `backlog/config.yml` sets
   `remote_operations: true` + `check_active_branches: true`, so Backlog.md
   resolves each task across *all* active branches. With four stacked branches
   carrying divergent copies of the same task files, `backlog task list
   --parent/--labels` **under-reports** — and which subset it shows depends on
   which branch you stand in. (Caught live: a gate reviewer saw only TASK-8.2
   and concluded dotted sub-task IDs were broken; from another branch the same
   files showed only TASK-8.1. Copying those exact files + the exact config into
   a single-branch repo listed all three correctly.) The dotted IDs are
   Backlog.md's own native subtask form, minted by `task create --parent`.
   Verify discoverability against the *merged* state, never the stack.
6. **Gate auto-fixes on a mid-stack branch collide with fix-forward commits
   on the successor.** The slice-2 run's review fixes rewrote the same skill
   hunk slice 3 had already fix-forwarded (both encoding the same lesson,
   different words). Don't leave that to the next run's conflict repair:
   **merge the gate-fixed predecessor branch into the successor and resolve
   by hand** before submitting the successor's run — deterministic, and the
   merge also absorbs `main` drift early. (Caught live: settled-submit wording,
   slice 2 → slice 3.)

## Worker-pane lessons (fed back into the skill in slice 3)

- `herdr agent send` → **pause ~2s** → `pane send-keys Enter`: the Enter can
  land before the text reaches the composer; verify submission via
  `agent read` when in doubt (caught live: prompt sat unsubmitted).
- Codex surfaces **`done`** (not `idle`) at turn end; `agent wait --status
  idle` still unblocked on the transition, but don't poll for literal `idle`.
- Startup can show an **update prompt** before (or instead of) the trust
  prompt — same treatment: read the pane, answer, move on. Don't update
  mid-run.
- Session-id capture at first handoff worked exactly as designed
  (`herdr agent get` → `agent_session.value`, stable across the repair round);
  `--last` was never needed.

## For the writing-plans / executing-plans rework

- Plans should emit: parent task + dep-linked slice sub-tasks (minted by the
  task's own worker), slice 0 = the plan landing, one branch + one gated run
  per slice — **branched from `main`, not stacked**; each slice's accept
  criteria checked in its own landing.
- Executing-plans should own the serial landing loop: claim slice → build →
  verify → Done-flip → gate run → **wait for merge to `main`** → re-drive the
  next slice only after merging `origin/main` into its branch. One green slice
  PR open at a time (friction #1). Abandoned-landing repair = revert the Done
  flip first.
- Neither skill should teach hand-built branch stacks: the gate should not be
  treated as branch repair, and the landing agent never rewrites branch
  history.
