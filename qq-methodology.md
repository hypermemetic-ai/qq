# The qq methodology

The shared operating core every qq-linked repo runs on. Linked live from the qq
repo via a symlinked `@`-import — do not edit a copy; edit it in qq.

## The layers
- **Rules** — the repo's own `AGENTS.md` header plus this shared import: the
  behavioral floor and how work is routed.
- **Actions** — curated skills, invoked as `/<name>`, linked live from qq's
  `skills/` into `~/.claude/skills/`.
- **Knowledge** — the document stack, four documents with one maintainer each:
  - *Code graph* — **codebase-memory** MCP tools (`search_graph`, `trace_path`,
    `get_architecture`, …): a deterministic structural map, fully derived,
    out-of-repo (`~/.cache`), auto-refreshed. Reach for it when a relational
    question (impact, dependencies, architecture) gets expensive by grep;
    plain file reading is still the default. For qq itself, TASK-18 owns the
    remaining operationalization pass: prove the main-tree index, decide how to
    handle throwaway gate-worktree indexes, and diagnose the 2026-07-08
    disconnect.
  - *Intent + work status* — `backlog/` (Backlog.md): the registry of what the
    operator wants and where work stands, one markdown file per task
    (`backlog task create/edit/list`, `backlog board`). Create tasks in the
    session that owns the main tree and **commit the new task file immediately**
    — IDs are minted from committed branch state, so uncommitted tasks in
    parallel worktrees can mint duplicates. Workers claim by setting `assignee`
    to their branch and only edit tasks they claim. Until TASK-16 automates Done
    flips in the gate's document step, move a task to Done only in the
    gate-handoff registry commit after verification is green; if the landing
    fails or is abandoned, revert that flip first.
    The gate enforces the mechanical trust prerequisite: a landing that doesn't
    touch the registry is refused; semantic correctness is still reviewed in
    the PR (see Git below).
  - *Durable descriptive docs* — `openwiki/` (OpenWiki): agent-written docs of
    what the system *is*, refreshed inside the gate transaction at landing —
    never pointed at the registry (it would rewrite "want" into "is").
  - *Episodic docs* — `docs/solutions/` + `CONCEPTS.md` via `compound`:
    solved problems and stabilized vocabulary, captured opportunistically.
- **Sessions** — herdr (`herdr`): many named agents in parallel, each isolated in
  its own git worktree; herdr's sidebar shows which agent is blocked / working /
  done / idle, so you see at a glance which one needs you. Agents can also talk
  to each other directly through herdr — `herdr agent list`, `send <target>
  <text>` (follow with `herdr pane send-keys <pane> Enter` to submit), `read
  <target>`, `wait <target> --status idle|working|blocked` — use it when
  coordination helps; there is deliberately no protocol beyond these primitives
  yet.
- **Cockpit** — the operator's tuned terminal surface, linked from the qq repo:
  herdr, yazi, broot, glow, mdcat, shell navigation, and the `qq-phase` status line.
- **Externals** — Context7 (live, version-correct library docs), `gh` (GitHub),
  `fd` / `eza` / `rg` (fast filesystem), and **the gate** (`no-mistakes`, an
  external MIT tool): every landing is *driven through it* — an independent
  pipeline reviews the diff, runs the checks, requires a registry touch once
  `backlog/` is adopted, refreshes adopted descriptive docs, and opens a PR. It
  is capability you invoke, not process you maintain.

## Behavioral floor (always)
1. **Think before coding** — surface assumptions, offer interpretations, ask
   before proceeding. Never hide confusion.
2. **Simplicity first** — the minimum that solves the problem; nothing speculative.
3. **Surgical changes** — touch only what you must; preserve the surrounding
   style; clean up only your own mess.
4. **Goal-driven** — define verifiable success criteria, then loop until verified.

## Routing
Triage every task by size and reversibility first. **Triage scales ceremony,
never the landing path** — there is one workflow, and everything lands through
the gate.
- **Trivial + local + reversible** (typo, rename, one-liner): skip Align/Plan —
  just do it, run `verification-before-completion`, commit on green to the
  current working branch. Small changes batch on a branch and land as one
  gated push; they do not commit straight to `main`.
- **Everything else** (multi-file, ambiguous, irreversible): run the loop below,
  starting at Align — or hand the whole task to `orchestrate`, which conducts the
  loop end-to-end (Claude aligns / plans / verifies / reviews; Codex implements
  in a named herdr pane).

Triage also flags parallelism — without being asked: every **unclaimed To Do**
task gets its `parallel-ok` label (or explicit dependencies) and its
`hitl`/`afk` attendance label at creation or first triage (claimed tasks are
exempt — see §Parallel operation). When the operator asks for the next task and
the queue is deep, don't default to serial: run `bin/qq-frontier` and propose a
wave of independent frontier tasks fanned out via herdr worktrees (see
§Parallel operation).

Two invariants: **`verification-before-completion` is never skipped**, and
**no change reaches `main` except through the gate** — the second is what makes
the intent registry (`backlog/`) trustworthy: one landing path means one
enforcement point.

## The loop
1. **Align** — `grilling` / `grill-me`: resolve intent and open decision branches
   before building.
2. **Plan** — `writing-plans`: turn the agreed intent into an executable,
   step-by-step plan. Work it with `executing-plans`; land it with
   `finishing-a-development-branch` — through the gate, like everything else.
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
7. **Compound** — `compound`: fires on its own after a verified solve — captures
   the solved problem to `docs/solutions/` and durable vocabulary to `CONCEPTS.md`,
   so the next session doesn't relearn it.

Support, any time: `research` (delegated, cited investigation → `research/`);
`handoff` (compact state for a fresh agent when context runs low); `writing-skills`
(author or edit a skill, eval-first).

**Progress is stamped.** Long-running work records its current phase to
`.qq/state.json` via `qq-phase <Phase>` at each boundary — cheap, token-free,
per-repo, never an LLM call. The Claude Code status line reads it (`qq-phase
render`, merging the gate's own `no-mistakes axi status` steps), so loop position
and pipeline position show as one. Orchestrate's loop is the first producer; any
background skill can stamp the same surface with free-form phases (e.g.
`capturing`, `researching`) and mark completion with `qq-phase done --producer
<id>`. Producers stamp concurrently without clobbering: each writes its own slot
(`--producer <id>`, default `main`) and `render` shows every active slot — one
producer finishing never resets another's state. Bare `qq-phase clear` wipes all
state; `qq-phase clear --producer <id>` removes one slot.

## Git — how work lands
- **Commit on green.** A commit is a claim: commit only what
  `verification-before-completion` just proved — one commit per verified task or
  batch. History stays bisectable. Un-green WIP never reaches a shared branch.
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
  task-<id>-<slug>`, then
  `herdr agent start <name> --cwd <worktree> -- claude`. Isolation *is*
  the coordination model — no file locks. True shared-file work stays serial in the
  main tree, one agent at a time.
- **Branches die at merge.** Every GitHub repo sets delete-branch-on-merge
  (`gh repo edit --delete-branch-on-merge`) — set it when a repo is created or
  linked (operator decision, 2026-07-08), so merged branches are pruned
  automatically. A superseded-but-unmerged branch is deleted only after verified
  content supersession (`git cherry` / diff against `main`) and explicit owner
  confirmation; the git rail mechanically blocks local force-deletes
  (`git branch -D`) and remote delete forms (`git push --delete`,
  `git push --prune`, `git push origin :branch`). Unmerged remote deletion
  therefore requires the same verified-supersession + explicit owner
  confirmation procedure and owner action. Unlanded work is never deleted in
  cleanup — it lands through the gate or stays.

**Merge gate: all-gated — one landing path.** Green work accumulates on its
branch; landing is always through the gate — the independent pipeline reviews
the diff, runs the checks (including the registry check: a diff that doesn't
touch `backlog/` is refused once the registry exists), refreshes `openwiki/`
inside the same transaction once configured, and opens a PR a human merges with
one click. The former `trunk` / `blast-radius` modes are retired (operator
decision, 2026-07-07): a second landing path would be a second — unenforced —
registry producer, and partial coverage cannot serve as truth. Agents never
touch `main`.

**The landing agent owns the run (operator decision, 2026-07-08).** Drive the
gate with `no-mistakes axi run --intent "<backlog task + acceptance criteria>"`
— exact intent in, transcript inference demoted to fallback. For qq itself,
while it has no configured CI, use `no-mistakes axi run --skip ci --intent
"<backlog task + acceptance criteria>"`; remove the skip flag once real CI
exists. `git push no-mistakes <branch>` is only the fallback when no skip flags
are needed and no explicit intent is available. The pipeline is fire-and-forget
for the operator: objective review findings auto-fix (`auto_fix.review: 3` in
`.no-mistakes.yaml`); `ask-user` findings park the run and the landing agent —
never the operator — relays the question, then answers with `no-mistakes axi
respond --action approve|skip|fix`, using `--findings` and `--instructions`
when the answer asks the gate to fix. The operator's only touchpoints are a
relayed judgment call and the PR merge click. A parked landing agent shows as
blocked in herdr; the `qq-phase` status line shows the gate step.

## Parallel operation
Working the backlog serially wastes the isolation model. When the queue is
deep, the default posture is a **wave**: independent tasks fanned out to
parallel workers, one per worktree, each landing through the gate on its own.
These are the rules that make that safe.

- **The frontier** — the set of claimable tasks: status `To Do`, every
  dependency `Done`, unassigned, **and no `task-<id>` branch anywhere** (local
  or remote). `bin/qq-frontier` computes it mechanically (`--afk` filters to
  unattended-safe work, `--json` for tooling). Background agents and wave
  dispatchers pick only from the frontier — never from the raw To Do column,
  which under-reports claims (see below) and over-reports readiness.
- **Claim-by-assignment** — claiming a task is three moves, atomically on your
  own branch: create `task-<id>-<slug>`, set the task's assignee to that branch
  name, commit the claim immediately. Because claims land on `main` only at
  merge, the registry's assignee field is invisible to other trees while work
  is in flight — **the branch itself is the cross-tree claim signal**, which is
  why the frontier checks branches, not just assignees.
- **Branch naming** — task work branches are `task-<id>-<slug>`
  (e.g. `task-5-compound-rename`); slices of a parent task are
  `task-<id>.<n>-<slug>`. Conventional `feat/` / `chore/` prefixes are retired
  for task work (operator decision, 2026-07-08): the registry already types the
  intent, and the task id is the join key for claims, Done flips (TASK-16), and
  the lifecycle view (TASK-11).
- **Triage labels** — set at task creation or first triage, alongside
  dependencies: `parallel-ok` (surface-disjoint; safe in a wave) and one of
  `hitl` (needs the operator in the loop — judgment calls, interactive tests)
  or `afk` (runs unattended end-to-end; the operator's only touchpoint is the
  merge click). A task that can't be labeled yet isn't triaged yet. The
  invariant covers **unclaimed To Do tasks only** (operator decision,
  2026-07-08): once a task is claimed — a `task-<id>` branch exists — labels
  are moot for dispatch, and the task file is worker-owned, so cross-tree
  label backfills are forbidden by the tree-ownership rule.
- **The dispatchability bar** — a task is handed to a worker only when Align is
  done: intent resolved with the operator and encoded in the task file plus the
  dispatch brief. The dispatcher front-loads Align; the worker enters the loop
  at Plan. Under-specified tasks never go to workers — they stay with the
  conductor (the operator's main session) for grilling first. A worker that
  finds real ambiguity anyway stops and asks; grinding ahead is the failure
  mode, not the protocol.
- **Worker composition** — a worker starts as one Claude session in its
  worktree. For conducted work, `orchestrate` turns that session into a task
  tab: the Claude conductor pane stays first, and Codex implementer panes spawn
  as **right splits** in the same tab (TASK-8.1; operator direction,
  2026-07-08; cap ~3 panes per tab; live e2e proof captured in TASK-8.2). The
  gate's independent review preserves the fresh-eyes property for inline
  workers; `orchestrate` preserves it earlier by keeping Claude out of Build.
- **Tree ownership** — one writer per working tree. The main tree belongs to
  the operator's interactive session; a background producer in a tree it does
  not own is read-only there and stamps its own `qq-phase` producer slot.
- **Shared surfaces** — append-and-merge, never cross-tree edits: `CONCEPTS.md`
  entries and `docs/solutions/` / `research/` files are written on your own
  branch (date+slug filenames keep merges trivial); `ideas/NN-` sequence
  numbers are claimed by creating the file on your branch. True shared-file
  work stays serial in the main tree.
- **Global config is shared state** — `skills/` and `cockpit/` are live-linked
  into every session from the main checkout. Edit them in a worktree and land
  via the gate; never live-edit the linked copies from a worker.
- **Conductor duties** — dispatching a wave doesn't end the dispatcher's job:
  watch the herdr sidebar, nudge workers that end a turn on an announcement
  instead of an action, relay `ask-user` gate findings to the operator, queue
  dependent tasks behind their blockers, and clean up merged worktrees.

## Skill index
| skill | reach for it when |
|---|---|
| `orchestrate` | running a non-trivial task through the whole loop end-to-end — Claude conducts, Codex implements in a named herdr pane |
| `grilling` / `grill-me` | starting non-trivial work — pin down intent first |
| `writing-plans` | turning agreed intent into an executable plan |
| `executing-plans` | working a plan task-by-task (stops on blockers; won't touch main without consent) |
| `finishing-a-development-branch` | landing finished work — the gate does rebase / push / PR, so this narrows to the merge decision |
| the gate (`no-mistakes axi run --intent`; `git push no-mistakes` only when no skip flags are needed) | landing work, always — the external pipeline validates the diff and opens a PR; add `--skip ci` only after confirming no CI exists; see "Git — how work lands" |
| `verification-before-completion` | before ANY "done / passing / fixed" claim (never skipped) — and the pre-push smoke test before handing a branch to the gate |
| `uat-signoff` | a user-facing / irreversible / ambiguous change needs human acceptance |
| `diagnosing-bugs` | a bug, failing test, or unexpected behavior |
| `code-review` | reviewing a diff — author-side Standards + Intent (design & spec); the gate reviews correctness |
| `receiving-code-review` | weighing review feedback — from `code-review` or the gate (verify, don't obey) |
| `compound` | you just solved something worth not relearning — fires on its own, no prompt |
| `research` | a task turns into reading legwork |
| `handoff` | the context window is filling — hand off to a fresh agent |
| `writing-skills` | authoring or editing a qq skill (eval-first) |
| `git-guardrails-claude-code` | (safety rail) blocks destructive git — installed as always-on hooks |

Skills are linked from qq, vendored from MIT sources or authored for qq; see qq's
`SKILLS-ATTRIBUTION.md`. The git rail runs as an always-on hook that blocks
force-push, `reset --hard`, `clean -fd`, `git branch -D`, remote branch deletion,
`reflog expire`, `update-ref -d`, and history rewrites before they execute —
argv-aware, so a command that merely mentions a dangerous phrase in quoted prose
is not blocked.
