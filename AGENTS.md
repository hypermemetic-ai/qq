# hypercore — agent operating rules

hypercore is a lean engineering system: sharp skills you invoke on demand, a
knowledge layer that maps the code, a session layer for parallel agents, and a
thin external surface. It is capability you reach for — not process you maintain.
Every part earns its place by being *invoked*, not by being *reported to*.

## The five layers
- **Rules** — this file: the behavioral floor and how work is routed.
- **Actions** — `skills/`: atomic capabilities, invoked by name (indexed below).
- **Knowledge** — `.understand-anything/knowledge-graph.json`: the map of what the
  code *is*. Consult it for architecture / dependency / "where is X" questions;
  build it with `/understand` — **always pass `--auto-update`** (the standing
  default for every project) so the plugin's post-commit and session-start hooks
  keep the graph current with no manual refresh. The graph dir is committed to
  the repo (only `intermediate/`, `tmp/`, and `.trash-*/` scratch are gitignored).
- **Sessions** — herdr (`herdr`): many named agents in parallel, each isolated in
  its own git worktree; herdr's sidebar shows which agent is blocked / working /
  done / idle, so you see at a glance which one needs you.
- **Externals** — Context7 (live, version-correct library docs), `gh` (GitHub),
  `fd` / `eza` / `rg` (fast filesystem), and **the gate** (`no-mistakes`, an
  external MIT tool): real work is *pushed to it* — an independent pipeline
  reviews the code, runs the checks, and opens a PR. It implements the
  `blast-radius` / `human` merge gates below — capability you push to, not
  process you maintain.

## Behavioral floor (always)
1. **Think before coding** — surface assumptions, offer interpretations, ask
   before proceeding. Never hide confusion.
2. **Simplicity first** — the minimum that solves the problem; nothing speculative.
3. **Surgical changes** — touch only what you must; preserve the surrounding
   style; clean up only your own mess.
4. **Goal-driven** — define verifiable success criteria, then loop until verified.

## Routing (the escape hatch)
Triage every task by size and reversibility first.
- **Trivial + local + reversible** (typo, rename, one-liner): just do it — then
  still run `verification-before-completion`.
- **Everything else** (multi-file, ambiguous, irreversible): run the loop below,
  starting at Align — or hand the whole task to `orchestrate`, which conducts the
  loop end-to-end (Claude aligns / plans / verifies / reviews; Codex implements).

The one invariant: **`verification-before-completion` is never skipped.**

## The loop
1. **Align** — `grilling` / `grill-me`: resolve intent and open decision branches
   before building.
2. **Plan** — `writing-plans`: turn the agreed intent into an executable,
   step-by-step plan. Work it with `executing-plans`; land it with
   `finishing-a-development-branch` — real work through the gate (`git push
   no-mistakes`), trivial work straight to `main`.
3. **Build** — implement per the plan, honoring the floor. Stuck on a bug? →
   `diagnosing-bugs`.
4. **Verify (autonomous)** — `verification-before-completion`: run the real
   command, read the full output, and claim only with evidence.
5. **Sign-off (human, gated)** — `uat-signoff`: for user-facing, irreversible, or
   ambiguous changes, walk the owner through observable tests. Seeded by step 4.
6. **Review** — `code-review` (Standards + Intent) is the *author-side design &
   spec* review; the gate's pipeline is the *independent correctness* review
   (bugs / security / perf) — complementary, not redundant. `receiving-code-review`
   weighs either one's findings instead of rubber-stamping them.
7. **Compound** — `ce-compound`: capture the solved problem to `docs/solutions/`
   and durable vocabulary to `CONCEPTS.md`, so the next session doesn't relearn it.

Support, any time: `research` (delegated, cited investigation → `research/`);
`handoff` (compact state for a fresh agent when context runs low); `writing-skills`
(author or edit a skill, eval-first).

## Git — how work lands
- **Commit on green.** A commit is a claim: commit only what
  `verification-before-completion` just proved — one commit per verified task or
  batch. History stays bisectable, and the post-commit knowledge-graph hook keeps
  the map fresh (commits are its heartbeat). Un-green WIP never reaches a shared branch.
- **Push the branch after each green commit** — always fast-forward-safe; durability
  plus live visibility for your partner.
- **Undo is `git revert`** to the last green commit — forward and clean, never
  `reset --hard` (the rail blocks it). Commit-on-green is what makes revert cheap.
- **In-flight work is never lost.** A `Stop` hook snapshots the working tree to
  `refs/wip/<branch>` every idle — the un-green counterpart to commit-on-green,
  and non-destructive (never touches HEAD, the index, or `main`). Recover with
  `qq-wip list | diff | branch <name>`.
- **Isolation on demand** — serial work runs in the main tree on a branch; fan out
  parallel agents and each gets its own worktree: `herdr worktree create --branch
  <name>`, then `herdr agent start <name> --cwd <worktree> -- claude`. Isolation *is*
  the coordination model — no file locks. True shared-file work stays serial in the
  main tree, one agent at a time.

**Merge gate is a per-project setting** — how green work reaches `main`:
- `trunk` — commit on green straight to `main` and push; review is in-process
  (`code-review`) plus async audit. Fastest; fits a solo repo.
- `blast-radius` — low-risk green work commits straight to `main`; real work
  (user-facing / irreversible / ambiguous) is pushed through **the gate**
  (`git push no-mistakes <branch>`) — an independent pipeline validates it and
  opens a PR a human merges. The git gate mirrors the Sign-off routing.
- `human` — every task lands via a human-approved PR (the same gate, every task
  routed to a PR); agents never touch `main`.

**This project: `blast-radius` via the gate.** Trivial + local + reversible work
still commits on green straight to `main` (the escape hatch — `orchestrate` and
trivial fixes commit the moment the pre-push smoke test passes). **Real work**
(multi-file / user-facing / irreversible) is pushed through the gate:
`git push no-mistakes <branch>` → the pipeline reviews correctness, runs the
checks, and opens a PR you merge with one click. For gated work, "green" is no
longer a fact the agent *asserts* — it is a fact the gate *proves*, independently,
with a committed evidence trail. (`/no-mistakes` drives the same gate headlessly.)

## Skill index
| skill | reach for it when |
|---|---|
| `orchestrate` | running a non-trivial task through the whole loop end-to-end — Claude conducts, Codex implements |
| `grilling` / `grill-me` | starting non-trivial work — pin down intent first |
| `writing-plans` | turning agreed intent into an executable plan |
| `executing-plans` | working a plan task-by-task (stops on blockers; won't touch main without consent) |
| `finishing-a-development-branch` | landing finished work — for gated work the gate does rebase / push / PR, so this narrows to the merge decision |
| `git push no-mistakes` (the gate) | landing *real* work — an external pipeline validates the diff and opens a PR; see "Git — how work lands" |
| `verification-before-completion` | before ANY "done / passing / fixed" claim (never skipped) — and the pre-push smoke test before handing a branch to the gate |
| `uat-signoff` | a user-facing / irreversible / ambiguous change needs human acceptance |
| `diagnosing-bugs` | a bug, failing test, or unexpected behavior |
| `code-review` | reviewing a diff — author-side Standards + Intent (design & spec); the gate reviews correctness |
| `receiving-code-review` | weighing review feedback — from `code-review` or the gate (verify, don't obey) |
| `ce-compound` | you just solved something worth not relearning |
| `research` | a task turns into reading legwork |
| `handoff` | the context window is filling — hand off to a fresh agent |
| `writing-skills` | authoring or editing a hypercore skill (eval-first) |
| `git-guardrails-claude-code` | (safety rail) blocks destructive git — installed as always-on hooks |

Skills are vendored from MIT sources or authored for hypercore; see
`SKILLS-ATTRIBUTION.md`. The git rail is not invoked during work — it runs as a
Claude Code hook that blocks force-push, `reset --hard`, `clean -fd`, and history
rewrites before they execute.
