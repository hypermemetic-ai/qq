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
  build or refresh it with `/understand`.
- **Sessions** — NTM (`ntm`): many named agents in parallel, coordinated by file
  locks so they don't clobber each other.
- **Externals** — Context7 (live, version-correct library docs), `gh` (GitHub),
  `fd` / `eza` / `rg` (fast filesystem).

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
  starting at Align.

The one invariant: **`verification-before-completion` is never skipped.**

## The loop
1. **Align** — `grilling` / `grill-me`: resolve intent and open decision branches
   before building.
2. **Plan** — `writing-plans`: turn the agreed intent into an executable,
   step-by-step plan. Work it with `executing-plans`; land it with
   `finishing-a-development-branch`.
3. **Build** — implement per the plan, honoring the floor. Stuck on a bug? →
   `diagnosing-bugs`.
4. **Verify (autonomous)** — `verification-before-completion`: run the real
   command, read the full output, and claim only with evidence.
5. **Sign-off (human, gated)** — `uat-signoff`: for user-facing, irreversible, or
   ambiguous changes, walk the owner through observable tests. Seeded by step 4.
6. **Review** — `code-review` (Standards + Intent) to produce the review;
   `receiving-code-review` to weigh the feedback instead of rubber-stamping it.
7. **Compound** — `ce-compound`: capture the solved problem to `docs/solutions/`
   and durable vocabulary to `CONCEPTS.md`, so the next session doesn't relearn it.

Support, any time: `research` (delegated, cited investigation → `research/`);
`handoff` (compact state for a fresh agent when context runs low); `writing-skills`
(author or edit a skill, eval-first).

## Skill index
| skill | reach for it when |
|---|---|
| `grilling` / `grill-me` | starting non-trivial work — pin down intent first |
| `writing-plans` | turning agreed intent into an executable plan |
| `executing-plans` | working a plan task-by-task (stops on blockers; won't touch main without consent) |
| `finishing-a-development-branch` | landing finished work — verify, then merge / PR / cleanup |
| `verification-before-completion` | before ANY "done / passing / fixed" claim (never skipped) |
| `uat-signoff` | a user-facing / irreversible / ambiguous change needs human acceptance |
| `diagnosing-bugs` | a bug, failing test, or unexpected behavior |
| `code-review` | reviewing a diff — Standards + Intent axes |
| `receiving-code-review` | weighing review feedback (verify, don't obey) |
| `ce-compound` | you just solved something worth not relearning |
| `research` | a task turns into reading legwork |
| `handoff` | the context window is filling — hand off to a fresh agent |
| `writing-skills` | authoring or editing a hypercore skill (eval-first) |
| `git-guardrails-claude-code` | (safety rail) blocks destructive git — installed as always-on hooks |

Skills are vendored from MIT sources or authored for hypercore; see
`SKILLS-ATTRIBUTION.md`. The git rail is not invoked during work — it runs as a
Claude Code hook that blocks force-push, `reset --hard`, `clean -fd`, and history
rewrites before they execute.
