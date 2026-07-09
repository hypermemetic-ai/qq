# Methodology audit → parallel-safety plan

_Banked 2026-07-07. Status: audit complete (three parallel readers + main-session
verification of every load-bearing claim); sequencing proposed. Update 2026-07-08:
TASK-3 landed the qq-phase, WIP-ref, and rail hardening from Part 2; Codex resume
scoping moved to TASK-8, and TASK-8.1 resolved orchestrate's runtime path by moving
Codex Build handoffs into named herdr worker panes. Update 2026-07-09: TASK-4
landed the instruction layer: §Parallel operation, claim-by-task-branch, frontier
listing, and shared-surface rules.
Trigger: operator asked "make the whole workflow parallel safe" + "audit the whole
methodology for coherence, soundness, simplification — then see where concurrency
fits in."_

## Verdict in one paragraph

The qq-authored core is sound: `qq-phase`, `qq-wip*`, `orchestrate`, `grilling`,
`verification-before-completion`, `uat-signoff`, `research`, `handoff` are lean and
internally coherent. The rot is concentrated in **vendored skills that were never
re-homed** (they still speak "Superpowers", reference skills/paths qq doesn't have,
and — worst — route work *around* the gate), and in **one piece of infrastructure**:
the Understand-Anything knowledge layer, which is git-tracked *and* auto-rewritten
per commit in every session — the single biggest parallel hazard in the system.
At audit time, parallelism was one methodology paragraph ("isolation on demand")
plus one orchestrate convention ("Codex holds the tree") — directionally right,
but with no tree-ownership protocol, no shared-file conventions, and three
mechanical races that instructions alone couldn't fix.

## Part 1 — Coherence & soundness findings

### HIGH — vendored skills contradict the gate model
- `skills/finishing-a-development-branch/SKILL.md` never mentions
  `no-mistakes`/`blast-radius`. Its Option 1 (`:97-120`) merges to base locally
  (`git checkout <base>` — also physically impossible from a herdr worktree when
  main is checked out elsewhere); Option 2 (`:124-125`) does `git push -u origin`
  + manual PR — both bypass the gate. Methodology (`qq-methodology.md:113`) says
  this skill should narrow to *the merge decision*; it's the biggest offender.
- Worktree logic is written for Superpowers layouts: provenance check only
  recognizes `.worktrees/`/`worktrees/` (`:173,217,231`), so cleanup never
  triggers for herdr worktrees; every finishing agent runs `git worktree prune`
  (`:179,241`) on the shared git dir — a cross-agent mutation.
- `skills/writing-plans/SKILL.md` saves to `docs/superpowers/plans/` (`:18,160`)
  — real path is `docs/plans/` — and bakes
  `REQUIRED SUB-SKILL: superpowers:subagent-driven-development` into **every
  generated plan header** (`:61,169,173`). Neither the prefix nor the skill
  exists here; the intended implementer is `orchestrate`/Codex.
- `skills/executing-plans/SKILL.md` (`:14,36,68-70`): `superpowers:*` refs, a
  dead `../using-superpowers/references/` path, and no trace of qq's git rails
  (commit-on-green / push-after-green / revert-not-reset).

### MED — dead references and drift
- `skills/code-review/SKILL.md:13,29`: `/setup-matt-pocock-skills` and
  `docs/agents/issue-tracker.md` — neither exists; the Spec-source step dead-ends.
- `skills/diagnosing-bugs/SKILL.md:134`: hands off to
  `/improve-codebase-architecture` — doesn't exist. `:10` points at `CONTEXT.md`
  + ADRs — conventions qq doesn't use (it has `CONCEPTS.md` + the knowledge layer).
- `skills/research/SKILL.md:15`: Context7 tool `get-library-docs` is stale — the
  server now exposes `query-docs`.
- Naming drift: methodology calls the second review axis **Intent**
  (`qq-methodology.md:58,118`); `code-review` and `orchestrate` call it **Spec**.
  Pick one.
- `skills/writing-plans/` self-contradicts: Self-Review says "not a subagent
  dispatch" (`:146`) while the dir ships `plan-document-reviewer-prompt.md`.
- `bin/qq-activate.sh`: hardcoded partner repo `meeting-reviewer` (`:23,126-131`)
  aborts all of activation if that repo moves; the git rail is **copied** into
  `~/.claude/hooks/` (`:68`) while everything else is symlinked — a drift-by-design
  exception to the repo's own link-not-copy plan.
- Rail matching (`~/.claude/hooks/block-dangerous-git.sh:30-34`) was resolved by
  TASK-3: the rail is now argv-aware, allows benign quoted prose such as
  `git commit -m "block reset --hard"`, and additionally blocks remote branch
  deletion (`push --delete` / `push :branch`), `reflog expire`, `update-ref -d`,
  and force-push `+refspec`s.

### LOW
- Provenance leaked into skill bodies (`diagnosing-bugs:137-138`,
  `ce-compound:12`) — duplicates `SKILLS-ATTRIBUTION.md` into runtime context.
- `bin/install.sh:29`: `eza` "no apt package" hint is stale.
- `~/.claude/settings.local.json` carries stale `hypercore`/`portable-core`
  allow-list entries; `settings.json.*.bak` residue from the renames.
- `qq-phase` commit trailer in `qq-activate.sh:120,129` names the wrong model.

## Part 2 — Parallel-safety inventory

**Already safe (verified):** `.qq/state.json` is per-worktree (keyed to
`show-toplevel`, gitignored) — cross-worktree stamping never collides. WIP
snapshots use a PID-scoped temp index and branch-keyed refs — cross-worktree safe.
Statusline renders each session's own worktree state. Concurrent gate runs are
fine (root-caused in idea #4). The rail allows `git push no-mistakes`.

**Mechanical hazards — instructions can't fix these:**
1. **Knowledge layer (HIGH, twice over).** `knowledge-graph.json` + `meta.json` +
   `fingerprints.json` are git-tracked AND rewritten by a PostToolUse hook after
   every commit in every session → parallel worktrees deterministically conflict
   on a machine-generated JSON blob when branches land. Plus `meta.json` pins one
   branch's HEAD, so every other worktree's SessionStart sees "stale" and pushes
   a rebuild — N worktrees, N redundant rebuilds. → superseded by idea #7 (drop
   the plugin; see below).
2. **`.qq/state.json` single-slot with invited multi-producers (MED) — resolved
   by TASK-3.** `bin/qq-phase` now stores slots under `producers{}` keyed by
   `--producer <id>` (default `main`), serializes read-modify-write with `flock`,
   keeps fresh-run reset/detail/status/gate state per slot, migrates legacy
   single-slot files on first stamp, and renders every active slot. `qq-phase
   clear` wipes all state; `qq-phase clear --producer <id>` removes one slot.
3. **`codex exec resume --last` was not worktree-scoped (MED) — resolved for
   orchestrate by TASK-8.1.** Two old-style orchestrate runs in two worktrees
   could cross-resume each other's Codex session — silently corrupting "the
   reviewer is never the author". Current orchestrate no longer uses headless
   `codex exec`: Codex runs as `cx-<branch>` in a herdr pane, handoffs go through
   `.qq/handoffs/`, repair stays in-pane, and a dead pane resumes by explicit
   session id (`herdr agent get` → `agent_session.value` →
   `codex resume <session-id>`). `--last` is banned in parallel operation.
   Records retirement and live e2e proof remain TASK-8.2.
4. **Same-tree Stop-hook race (LOW) — resolved by TASK-3.** Two sessions in one
   tree no longer clobber `refs/wip/<branch>`: `qq-wip-snapshot.sh` updates the
   ref with compare-and-swap against the previously read value, retries against
   the current value when the tree changed, and never fails the Stop hook.
5. **Gate-daemon polling (LOW-MED).** With a `gate_run_id` attached, every
   session's statusline polls `no-mistakes axi status` every 3s — N sessions,
   N pollers against one daemon. Fine at N=2; worth a cache file at N=6.

**Instruction gaps — this is the "clear agent instructions" part:**
- **No tree-ownership protocol.** "Shared-file work stays serial in the main
  tree" is stated once, but no skill tells an agent to establish who owns the
  tree it's in, and orchestrate's "Codex holds the tree" convention only covers
  Claude↔Codex inside one session. Needed: a short §Parallel operation in
  `qq-methodology.md` — one writer per working tree at a time; the main tree
  belongs to the operator's interactive session; background producers in a tree
  they don't own are read-only + stamp their own state slot; fan-out always goes
  through `herdr worktree create`.
- **Shared-surface conventions.** `CONCEPTS.md` appends, `docs/solutions/`
  pruning (`ce-compound:57-63,94`), `ideas/NN-` and `research/` date-slug
  numbering — all race across parallel writers. Convention: shared-doc writes
  happen on the agent's own branch and land via the normal merge path (append-only
  + date-slug makes conflicts trivial); sequence numbers get claimed by filename
  creation, not by reading the README.
- **Global config is live-shared.** `~/.claude/skills` and `~/.config/*` symlink
  into the *main checkout* — an agent editing `skills/` on a branch in the main
  tree changes live behavior for every running session. Rule: skill/cockpit edits
  happen in a worktree and land via the gate like any real work.
- `handoff:8` writes to bare `/tmp` with no unique-name scheme — point it at the
  session scratchpad / `mktemp`.

## Part 3 — Simplification opportunities

- **Re-home or rewrite the three vendored loop skills** (`writing-plans`,
  `executing-plans`, `finishing-a-development-branch`). Finishing should shrink
  to what the methodology already promises: the merge decision (gate vs trivial
  vs discard) — its 241 lines restate the same rules three times in Quick
  Reference / Common Mistakes / Red Flags tables.
- `receiving-code-review` (213 lines) states "no performative agreement" four
  times; `verification-before-completion` re-encodes its Iron Law across six
  sections. Both collapse substantially without losing force.
- `writing-plans`' mandatory per-task TDD ceremony + orphaned reviewer prompt =
  process qq's ethos rejects; cut or make advisory.
- Drop inline provenance from skill bodies (lives in `SKILLS-ATTRIBUTION.md`).
- `bin/qq-activate.sh` vs `bin/qq-link.sh`: two symlink-with-backup
  implementations and two backup schemes; consolidate. Rail should be linked,
  not copied.
- Phase-stamping spec is fully stated in both `orchestrate/SKILL.md:40-48` and
  `qq-methodology.md:69-75`; make one point at the other.

## Part 4 — Idea #7: drop Understand-Anything for an agent-maintained map

**Original (verbatim — surlej, 2026-07-07):**

> an idea I have for understand anything is just drop it for something better
> engineered (I don't buy this implementation). basically I want to outsource
> the construction and maintenance of some document or data structure usefully
> describing the system to an agent. the human understanding component I don't
> care for, the visuals aren't game changing and could just be an agent skill
> that explains visually, which I'm sure exists already and could be grafted on.

**Audit corroborates it independently.** The knowledge layer produced this
audit's two HIGH infra findings (tracked auto-rewritten JSON; per-commit hook ×
every session) plus the SessionStart staleness nag — it is the one component
that is *process qq maintains* rather than capability qq invokes, and it's the
worst parallel citizen. Dropping it deletes the #1 mechanical hazard instead of
engineering around it.

**Replacement shape (small):** a curated, human-readable codebase map (e.g.
`MAP.md` or `docs/map.md`) owned by an agent skill — structured enough to answer
"where is X / what depends on Y", maintained **at landing time only** (a compound
step or post-merge on `main`, single writer at the merge point — not per commit
per worktree). Markdown merges trivially where the JSON blob could not. Visuals,
when wanted, become an on-demand "explain visually" skill over the map — grafted,
not resident. Retire: the plugin, its hooks, `.understand-anything/` tracking,
and the `/understand` setup step in README.

**Update (07-07, operator — supersedes the "compound covers pillars 2/3" claim
below/in the research file):** compound is a different document type — episodic
memory ("general memory"), not systematic, never exhaustive. The knowledge layer
proper is a **three-layer coverage model**:

> the bare minimum is something detailing what I want and where work stands
> relative to that, for EVERYTHING or we can't trust it as truth. then ideally
> something covering business logic. THEN I think we have everything covered:
> files+graph tools, intent vs reality, business logic.

1. **Structure** — files + deterministic graph tools (✅ layer choice adopted:
   codebase-memory-mcp, on-demand MCP; operationalization gap registered as
   TASK-18 after 2026-07-08 found no qq-main index and noisy gate-worktree
   indexing).
2. **Intent vs reality** — an exhaustive registry of what the operator wants and
   where the implementation stands against each item. Trust condition:
   **total coverage, updated at landing** — partial coverage cannot serve as
   truth (likely the root of the OpenSpec skepticism: per-change spec deltas
   never sum to a global, current picture). Note the gate already extracts
   per-push intent (`intent.enabled`) — a natural producer to accumulate from.
3. **Business logic** — domain flows / business rules / why-it-does-what-it-does.

**✅ Round 2 researched (07-07)** →
[`research/2026-07-07-intent-and-business-logic-layers.md`](../research/2026-07-07-intent-and-business-logic-layers.md).
The model is independently corroborated (2026 SDD literature names both the
trust condition — "specification rot… eroding trust" — and the fix: same-commit
spec update + drift as a merge-blocking error). Verdicts: **layer 2 — nothing
shipping enforces the trust condition; compose it**: markdown spec-registry
substrate (OpenSpec/Spec-Kit layout) + **the no-mistakes gate as enforcer**
(refuse to land a push that doesn't reconcile the registry; seed from
`intent.enabled`). OpenSpec's actual failure: delta→registry consolidation is
an optional manual step — deltas don't sum to truth unless landing forces it.
**Layer 3 — adopt `OpenWiki`** (langchain-ai, MIT, agent-built docs in-repo)
with its daily-cron refresh swapped for a gate-triggered `--update`. Open holes
recorded in the report: brownfield "EVERYTHING" backfill, and the blast-radius
escape hatch bypassing registry enforcement for ungated commits.

**Decisions (07-07, operator, after round 2):**

- **Layer 2 reframed and re-picked: `beads`** (gastownhall/beads, MIT, 25k★).
  The operator's actual want is a hybrid of intent and status tracking —
  "something like tickets… cleanly nestable and with a deterministic merge…
  something sharp out of the box" — i.e. a work-item graph, not a spec corpus.
  beads is purpose-built for agents: hierarchical epics (`x` → `x.1` → `x.1.1`),
  typed deps + `bd ready`, per-issue acceptance criteria, atomic claim, audit
  trail; issues live in an embedded Dolt DB synced via `refs/dolt/data` —
  *outside the branch dimension*, so worktrees share one workspace with nothing
  to merge (✅ smoke-tested 07-07: worktree sharing, concurrent writes from two
  worktrees, claim/close/ready, git-clean tree). Gate stays the enforcer:
  landing must map to claimed/closed bd issues; `intent.enabled` seeds new
  ones. OpenSpec drops out of layer 2. See the addendum in
  [`research/2026-07-07-intent-and-business-logic-layers.md`](../research/2026-07-07-intent-and-business-logic-layers.md).

  **Update (07-08, operator): beads dropped — layer 2 is `Backlog.md`**
  (MrLesk/Backlog.md, MIT, ~6k★: per-task markdown files in an in-repo
  `backlog/` dir, CLI + terminal/web kanban, agent-oriented). Intent + work
  status in one plain-markdown surface; the gate stays the enforcer with the
  same wiring idea. ✅ **Smoke-tested + adopted same day** (see Addendum 2 in
  the research file above for the full result): committed-state ID minting is
  worktree-safe; the *uncommitted* window can mint duplicate IDs that Backlog
  then mishandles silently — closed by an operating rule (create tasks in the
  main-tree session, commit immediately; workers only edit claimed tasks).
  Wired in `feat/document-stack`: `backlog/` seeded with the live queue,
  `bin/qq-registry-check.sh` as the gate's `commands.test` (a landing that
  doesn't touch `backlog/` is refused), `bin/qq-openwiki-refresh` as
  `commands.format` (guarded no-op until openwiki is generated + keyed).

- **Layer 3 scope widened: OpenWiki takes *all* descriptive docs**, not just
  business logic — anything that documents what the system *is* consolidates
  under `openwiki/`. Layer 2 stays out of it by design: the registry records
  what the operator *wants*, which is not derivable from the repo, and
  OpenWiki's refresh loop treats code as the source of truth — pointed at the
  registry it would rewrite "want" into "is", silently documenting drift as
  truth (the exact corruption the trust condition forbids), and it can never
  create the most valuable rows: wants not yet in the code. Doc estate, one
  maintainer each: `openwiki/` (descriptive — OpenWiki) · registry
  (intent + status — the gate) · `docs/solutions/` + `CONCEPTS.md` (episodic —
  compound).
- **Escape hatch dropped: single workflow.** Every change lands through the
  gate ("we manage a single workflow and figure out small changes from
  there") — no more commit-on-green straight to `main`; small changes batch on
  a branch and land as one gated push. This closes the registry-exhaustiveness
  hole (one enforcement point) and collapses the merge-gate taxonomy for qq to
  all-gated. Triage still scales *ceremony* (a typo needs no Align/Plan); only
  the landing path unifies. Implementation: rewrite the Routing/"escape hatch"
  and merge-gate sections of `qq-methodology.md` + the CLAUDE.md header — folds
  into step 2 of the sequencing below (the skills re-home branch touches the
  same text).

**✅ Researched (07-07)** →
[`research/2026-07-07-understand-anything-replacement.md`](../research/2026-07-07-understand-anything-replacement.md)
(deep-research round: 21 primary sources, 25 claims adversarially verified).
Committed recommendation: **two-layer stack** — (1) **`codebase-memory-mcp`**
(MIT, arXiv:2603.27277): deterministic tree-sitter graph, 158 langs, single
binary, 14 MCP tools, auto-configures Claude Code + Codex, index fully derived
in `~/.cache` (nothing tracked — deletes this hazard by construction); (2) a
**Google OKF-format markdown wiki** (`knowledge/`, plain md + YAML frontmatter —
OKF is real, v0.1 Draft, Apache-2.0, formalizes exactly the Karpathy LLM-wiki
pattern) written by a small qq skill at landing time — the `MAP.md` sketch
above, upgraded to a standard format. **Gate before adopting:** 15-min smoke
test of concurrent indexing across two herdr worktrees (its multi-worktree
behavior is undocumented); fallback pillar-1 is `denfry/codebase-index` (MIT,
per-worktree index by construction). GitNexus is functionally the best
all-in-one but PolyForm Noncommercial. Details, refuted claims, and open
questions in the research file.

## Part 5 — Proposed sequencing (the ordering call)

1. **Decide idea #7** (drop Understand-Anything → agent-maintained map). It
   removes the biggest hazard by deletion and unblocks the hardening scope.
2. **Re-home the vendored skills** (Part 1 HIGH/MED + Part 3). Do this *before*
   writing parallel-safety instructions — no point hardening text that's about
   to be rewritten, and the worst instruction-level hazards (local merge to
   main, `worktree prune`) live inside it.
3. **Mechanical hardening** (Part 2, items 2-4): completed for `qq-phase`
   producer slots, WIP-ref CAS, and argv-aware rail hardening in TASK-3. Codex
   resume scoping and the orchestrate handoff model were resolved for the live
   skill in TASK-8.1; TASK-8.2 keeps the live e2e proof/records check.
4. **The instruction layer — completed by TASK-4.** `qq-methodology.md` now has
   §Parallel operation (frontier, claim-by-task-branch, triage labels, tree
   ownership, shared-surface conventions, global-config rule), `bin/qq-frontier`
   lists claimable tasks, and the shared-surface one-liners are threaded into
   the affected skills.
5. **Then build ideas #2 (`compound`) and #1 (`/idea`)** on the now-safe
   substrate — #1 depends on the multi-producer fix in step 3.

Steps 2-4 are each a gate-sized branch. Step 1 is a decision, then a small
removal branch + a new skill authored via `writing-skills`.
