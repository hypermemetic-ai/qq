# Ideas

Informal backlog — dump thoughts here as they come, no ceremony. One line is
fine; a rough paragraph is fine. Nothing here is a commitment or a plan — it's a
holding pen. Groom it whenever: promote an idea to a plan (`writing-plans`), fold
it into `AGENTS.md`, or just delete it.

Quick thoughts go as bullets under **Backlog**. When an idea outgrows a line, give
it its own `NN-slug.md` file in this folder and leave a one-line pointer here.

## Backlog

> **Session 2026-07-07 worked this folder; statuses below are current. #5 is now
> built (writer + status-line reader), and #2 is built as `compound` — remaining
> build order: #1 (`/idea`). Design is locked — no more design
> questions, just build.**

- **#1 · The `/idea` capture skill** → [`01-btw-ideas-skill.md`](01-btw-ideas-skill.md).
  _Design locked (07-07)._ Renamed off `/btw` — that's a **built-in Claude Code command**
  (ephemeral, read-only side-question) — to **`/idea`**. A thin durable-capture skill:
  capture verbatim in-turn → detached researcher writes `ideas/NN-slug.md` → completion
  shows as **ambient status on #5's surface, never a reply in the transcript**. Rides #5;
  build last. _(2026-07-06 → 07)_
- **#2 · Auto-compound + rename to `compound`** ✅ **Done (TASK-5, 2026-07-09).**
  Drop the `ce` prefix —
  we own it, call it **`compound`** (rename `skills/ce-compound/` + all refs + the
  `~/.claude/skills` link). And stop asking: it **auto-fires when appropriate**, with the
  appropriateness judgment living *inside* the skill, not a yes/no prompt. _(2026-07-06 → 07)_
- **#5 · Background-status substrate** → [`02-orchestrate-phase-state.md`](02-orchestrate-phase-state.md).
  ✅ **Built + verified (07-07), landing via the gate** (branch `feat/status-substrate`).
  Resurrected the salvaged patch and widened it per the note: **`bin/qq-phase`**
  stamps producer slots to **`.qq/state.json`** (neutral home, not `.orchestrate/`), and the
  reader is folded into the same script as **`qq-phase render`** — wired into the **Claude Code
  status line** via `qq-activate.sh`, joining active slots and merging the live gate step from
  `no-mistakes axi status`. Any producer can stamp free-form phases (`capturing`, `researching`)
  with `--producer <id>` and finish with `qq-phase done --producer <id>`, so **#1 rides it for
  free**. The `02-*.md` note now records the built shape; the archived patch is safe to retire
  once merged. _(2026-07-06 → 08)_
- **#3 · `codex exec` stdin-hang** → [`03-codex-exec-stdin-hang.md`](03-codex-exec-stdin-hang.md).
  ✅ **Superseded for orchestrate (TASK-8.1, 07-08).** The old `< /dev/null`
  rule still matters for detached/headless helpers, but orchestrate Build no
  longer uses `codex exec`: Codex runs in a visible herdr worker pane with
  `.qq/handoffs/` brief/report files. Note kept for background-job rationale.
  _(2026-07-06 → 08)_
- **#4 · Gate "stall" after a rename** → [`04-gate-stale-path-after-rename.md`](04-gate-stale-path-after-rename.md).
  ✅ **Root-caused (07-07).** (1) stale-path → `no-mistakes init` repairs it. (2) the
  "post-review freeze" was **not** a deadlock — the run parked in `awaiting_approval`
  (review had auto-fix findings, `auto_fix.review:0`). Current policy (07-08):
  `auto_fix.review:3`, drive with `no-mistakes axi run --intent` (add
  `--skip ci` only when the repo has no CI; `git push no-mistakes` is fallback
  only), and resolve parked questions through `no-mistakes axi respond`. A
  14h-orphaned run still sits parked (its work is already on main — safe to
  dismiss). _(2026-07-06 → 08)_
- **Agents should self-wrap-up on context pressure** _(new, 07-07)._
  ✅ **Registered as TASK-17 (07-08).** Make agents
  context-aware: as they approach ~200–250k tokens they should proactively start wrapping
  up / handing off on their own, rather than *beginning* fresh work deep in a window ("you
  shouldn't start here"). Relates to `handoff` (the transfer) and the Stop-hook WIP snapshot
  — this is the *trigger* that should fire the wrap-up. _(2026-07-07 → 08)_
- **#6 · Methodology audit → parallel-safety plan** →
  [`05-methodology-audit-parallel-safety.md`](05-methodology-audit-parallel-safety.md).
  Full audit (07-07): the vendored loop skills contradict the gate model (finishing
  merges around the gate; `superpowers:*` refs baked into every generated plan), three
  mechanical concurrency hazards (then-single-slot `.qq/state.json`, `codex resume --last`
  cross-worktree bleed, WIP-ref race), and a proposed 5-step sequencing. **TASK-3 has now
  landed the multi-producer phase slots, WIP-ref CAS, and argv-aware rail hardening; TASK-4
  landed §Parallel operation plus `bin/qq-frontier`; TASK-8.1 resolved orchestrate's Codex
  resume hazard by moving Build to worker panes and banning `--last`.**
  _(2026-07-07 → 09)_
- **#7 · Drop Understand-Anything for an agent-maintained map** → Part 4 of
  [`05-methodology-audit-parallel-safety.md`](05-methodology-audit-parallel-safety.md).
  Operator's call, independently corroborated: the knowledge layer produced both HIGH
  infra findings (git-tracked auto-rewritten JSON, rewritten per commit in every
  session). ✅ **Researched + adopted (07-07)** →
  [`research/2026-07-07-understand-anything-replacement.md`](../research/2026-07-07-understand-anything-replacement.md):
  **`codebase-memory-mcp`** (MIT) chosen and installed — worktree smoke test
  passed, wired as **on-demand MCP tools only** (no search-intercepting hooks;
  Claude Code user scope + Codex config), `auto_index`/`auto_watch` on.
  ⚠️ **Operationalization gap registered as TASK-18 (07-08):** qq's main tree
  had no index while throwaway gate worktrees were auto-indexing; task covers a
  real main-tree query smoke, gate-worktree exclusion or accept decision,
  multi-worktree verification, and the disconnect diagnosis.
  **OKF: format direction adopted, dependency deferred** (pre-ecosystem; keep
  compound's outputs OKF-compatible markdown, plug in a conformant toolchain when
  one exists). **Round 2 (07-07): layers 2+3 researched** →
  [`research/2026-07-07-intent-and-business-logic-layers.md`](../research/2026-07-07-intent-and-business-logic-layers.md):
  intent-vs-reality = **spec registry substrate + the gate as enforcer** (nothing
  shipping enforces "EVERYTHING at landing"; OpenSpec fails on unforced
  delta→registry consolidation); business logic = **OpenWiki** (langchain-ai,
  MIT), cron refresh swapped for gate-triggered `--update`.
  **Post-round-2 decisions (07-07):** OpenWiki takes **all descriptive docs**
  (layer 2 stays separate — intent isn't derivable from code, and OpenWiki's
  code-is-truth refresh would rewrite "want" into "is"); **escape hatch
  dropped** — everything lands through the gate, single workflow, single
  registry-enforcement point; ~~layer 2 = `beads`~~ **superseded 07-08: layer 2
  = `Backlog.md`** (MrLesk/Backlog.md, MIT — intent + work status as per-task
  markdown files in an in-repo `backlog/` dir, CLI + terminal/web kanban,
  agent-oriented) with the gate enforcing "landing maps to backlog tasks" —
  beads and OpenSpec both drop out.
  **Settled stack (07-08):** structure = codebase-memory-mcp (an efficient,
  different way for agents to look at the codebase) · intent + work status =
  Backlog.md · durable descriptive docs = OpenWiki · opportunistic/episodic
  docs = compound · enforcement = the gate at landing.
  ✅ **Built (07-08, branch `feat/document-stack`):** Understand-Anything
  untracked + de-referenced (plugin disable is user-side); methodology
  rewritten to the four-document stack and the single all-gated landing path
  (escape hatch removed from Routing/merge-gate/AGENTS.md); Backlog.md
  smoke-tested (see #6 file Part 4) and adopted — `backlog/` seeded with the
  live queue, `bin/qq-registry-check.sh` wired as the gate's test command,
  `bin/qq-openwiki-refresh` as its format command (guarded no-op until the
  wiki exists). **TASK-7 resolved the engine research:** the adopted path is a
  codex-exec-driven, sub-only refresh plus one-time init; implementation is a
  follow-up, and linked-repo rollout remains backlog task-9. The `code-graph`
  routing skill is **deferred by eval** —
  the RED baseline (07-08) showed an unguided agent answers qq-scale
  relational queries correctly with `rg` alone, so per `writing-skills` no
  skill ships without an observed failure (backlog draft-1). The queue now
  lives in `backlog/`, not here. _(2026-07-07 → 08)_
- **#8 · Agent-to-agent comms = plain herdr** _(decided 07-08)._ When agents need
  to talk to each other, they use herdr's own primitives — `herdr agent list` /
  `send <target> <text>` / `read <target>` / `wait <target> --status …` (verified
  present in the installed CLI) — no new infrastructure; much simpler than an MCP
  agent-mail server. Deliberately unformalized: *teach* the agents the primitives
  and watch what they do with them before designing any protocol. ✅ The teaching
  note landed in the methodology's Sessions layer (branch `feat/document-stack`,
  07-08); now we watch. _(2026-07-08)_
- **#9 · Codex workers get their own herdr pane** _(decided 07-08)._ Codex is
  about to become the main driver, so its workers stop being second-class.
  Run Codex workers as herdr agents (`herdr agent start <name> -- codex …`) —
  one approach for every worker: own pane, sidebar visibility, reachable via
  #8's send/read/wait.
  ✅ **Mechanics smoke-tested (07-08):** `herdr agent start … -- codex` is
  auto-detected as agent `codex` with live idle/working/done state plus blocked
  prompts; `send` + a brief read/settle before `pane send-keys Enter` submits
  prompts; `wait --status idle` unblocks when Codex surfaces `done`; and herdr
  captures the codex **session id**, which dissolves the `resume --last`
  hazard. **Approved substrate (07-08):** tab-per-task topology, ~3 panes/tab
  cap, per-pane `--cwd` worktree affinity, read-only `herdr terminal session
  observe` for watch/debug only, and dead-pane recovery by explicit
  `codex resume <session-id>` (`--last` banned). Tracked as backlog TASK-8 and
  sliced as TASK-8.1 (skill rewrite) → TASK-8.2 (records retirement + live e2e)
  → TASK-8.3 (lessons + close-out). ✅ **TASK-8.1 rewrote `orchestrate` Build
  (07-08):** handoffs now use
  `cx-<branch>` worker panes, `.qq/handoffs/<n>-{brief,report}.md`, idle waits,
  file-based reports, in-pane repair, and explicit `codex resume <session-id>`
  recovery for dead panes. TASK-8.2 captured the live e2e proof and residual
  records check; TASK-8.3 banked the pilot lessons and closed the parent; design doc:
  [`docs/plans/2026-07-08-orchestrate-codex-panes.md`](../docs/plans/2026-07-08-orchestrate-codex-panes.md).
  _(2026-07-08)_
- **#10 · Expand–contract for wide refactors** _(captured 07-08)._ mattpocock
  v1.1's `to-tickets` slices a wide refactor (one mechanical change,
  whole-codebase blast radius, no green vertical slice possible) by
  expand–contract: expand the new form beside the old, migrate call sites in
  batches, contract the old form away. Deliberately not folded into
  `writing-plans` yet — nothing speculative; reach for it when a real wide
  refactor shows up. _(2026-07-08)_
- **#11 · Slicing-pilot lessons for serial gated slices** →
  [`06-slicing-pilot-lessons.md`](06-slicing-pilot-lessons.md).
  ✅ **Banked from TASK-8 (07-08).** Parent + dependency-linked slice sub-tasks
  work, but hand-built branch stacks delinearize under the gate; future
  `writing-plans` / `executing-plans` guidance should land one slice PR at a
  time, each re-driven after its predecessor reaches `main`. _(2026-07-08)_
