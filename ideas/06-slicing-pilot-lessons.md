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
4. **Unattended runs queue cleanly.** The gate daemon serializes runs;
   submit-and-continue (background `axi run`, keep working the next slice)
   costs nothing and keeps the worker unattended end-to-end.
5. **Dependency links carried the sequencing.** `--dep` on the sub-tasks plus
   stacked branches encoded "land in order" without any coordination protocol.

## Friction to design around

1. **Gate rebase vs stacked branches.** The gate rebases + force-pushes each
   branch at run time (slice 0's head changed under the stack), so a later
   slice's PR shows the *cumulative* diff until its predecessors merge. Content
   is patch-identical, so the gate's per-run rebase dedupes once predecessors
   land — but: **merge slice PRs in dependency order**, and if a stacked PR
   looks noisy, a fresh `axi run` on it after the predecessor merges re-rebases
   it clean. Candidate executing-plans rule.
2. **Review redundancy on stacks.** Each stacked run re-reviews unmerged
   predecessor content. Fine at three small slices; on long stacks either
   tolerate it or wait for merges between slices.
3. **`axi run` is current-branch-bound.** The branch is pinned at submission,
   so submit, then switch branches freely. One landing agent can drive N slice
   runs from one worktree.

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
  per slice, stacked; each slice's accept criteria checked in its own landing.
- Executing-plans should own: claim slice → build → verify → Done-flip →
  gate run → next slice; merge-order rule from friction #1; abandoned-landing
  repair = revert the Done flip first.
