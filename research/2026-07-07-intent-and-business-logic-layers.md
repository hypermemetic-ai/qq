# Knowledge layers 2+3: intent-vs-reality and business logic

_2026-07-07 · deep-research round 2 (5 search angles → 21 sources fetched → 105
claims extracted → **selective verification by operator direction**: only the 12
load-bearing claims got an adversarial check, one skeptic each — 9 confirmed,
3 refuted; the other 42 supporting claims, including most of the tool-landscape
detail, are accepted at face value and flagged as such). Companion to
`2026-07-07-understand-anything-replacement.md`, which adopted layer 1
(structure = files + codebase-memory-mcp). Fast-moving field: comparison
sources date May–June 2026; OpenWiki's latest release is dated the research day
itself._

## Question

The operator's three-layer knowledge model, layers 2 and 3: **(A) intent vs
reality** — an exhaustive registry of what the operator wants with live status
of where the implementation stands per item; trust condition verbatim: it must
cover "EVERYTHING or we can't trust it as truth", updated at landing,
single-writer, parallel-safe across worktrees. **(B) business logic** — domain
flows, rules, why-the-system-does-what-it-does. Rank adoptable, agent-maintained,
treat-as-black-box candidates; diagnose why OpenSpec failed the operator; assess
whether the gate's intent extraction (`intent.enabled`) can feed the registry;
validate the three-layer + episodic-compound model against independent findings.

## Verdict

**Layer A — nothing off the shelf enforces the trust condition; compose it:
open registry substrate + the gate as enforcer.** [medium — mechanism verified,
composition is synthesis]

- **The condition is real and independently named.** 2026 SDD literature
  articulates it almost verbatim [verified, primary]: discipline-based spec
  updates decay into **"specification rot"** that "erodes trust"
  (Piskala, arXiv:2602.00180); the articulated fix is structural — *the agent
  updates the affected spec in the same commit, and drift is a blocking merge
  error* ("transforms drift from a social/process problem into a structural
  impossibility", Grabowski's Spec Growth Engine, arXiv:2606.27045).
- **But the only architecture that enforces it is vaporware** [verified]: the
  Spec Growth Engine (orphan code = hard merge-block, so every file must have a
  spec owner) is a single-author design paper — no release, no implementation,
  no evaluation. Every *shipping* SDD tool (Spec Kit, OpenSpec, Kiro, Tessl)
  leaves registry updates to invocation discipline — the exact decay mechanism.
- **OpenSpec diagnosis** [verified against first-party docs]: the per-change
  delta documents are not the failure — the **unforced consolidation** is.
  Deltas in `openspec/changes/` reach the `openspec/specs/` registry only via
  an explicit, optional `openspec archive` / `/opsx:sync` invocation; no hook,
  no CI, no merge-time automation. Skip the step and the "living registry"
  silently stops being truth. This confirms the operator's read: per-change
  deltas never sum to a global current picture *unless something forces the
  summation at landing*.
- **Committed recommendation:** adopt a plain-markdown spec registry as
  substrate (OpenSpec's `openspec/specs/` layout or Spec-Kit-style specs;
  EARS notation optional) and make **no-mistakes the enforcer**: a gate check
  that refuses to land a push whose diff doesn't reconcile the registry, with
  entries seeded/accumulated from the gate's existing per-push intent
  extraction (`intent.enabled`). Landing time is already qq's single-writer
  choke point, so the registry is parallel-safe by construction — worktrees
  never write it concurrently. This is the only configuration available today
  that turns "EVERYTHING, updated at landing" from a habit into an invariant.

> **SUPERSEDED same day (layer A pick only — the enforcement analysis stands):**
> the operator reframed layer 2 as a *hybrid of intent and status tracking* —
> "something like tickets I suppose, but cleanly nestable and with a
> deterministic merge… something sharp out of the box." That's a work-item
> graph, not a spec corpus, and it changes the candidate class. New pick:
> **beads** — see the addendum at the end of this file. The gate-as-enforcer
> conclusion is unchanged; only the substrate moves.
>
> **RE-SUPERSEDED next day (07-08):** the substrate moved once more, beads →
> **Backlog.md** — see Addendum 2 at the end of this file.

**Layer B — adopt `OpenWiki` (langchain-ai, MIT), gate-triggered.** [high on
the load-bearing facts — verified in-run against the repo and re-spot-checked
same day: MIT license, "writes and maintains agent documentation for your
codebase", v0.0.2 released 2026-07-07, ~9k stars in its first week]

- CLI that generates **and refreshes** an in-repo `openwiki/` docs directory
  built for agent consumption; injects consult-the-wiki wiring into
  `AGENTS.md`/`CLAUDE.md` (zero bespoke integration for Claude Code + Codex)
  [wiring detail unverified].
- **Caveat that matters:** its native maintenance loop is a **daily-cron PR**
  (verified: the shipped GitHub Action triggers on cron/manual only — no
  on-merge hook), i.e. asynchronous, not landing-time. Fix is the same move as
  Layer A: have the gate run `openwiki --update` at landing so refresh rides
  the single-writer transaction instead of drifting up to 24 h.
- Risk: days old. Mitigation: it's MIT, output is plain markdown in-repo —
  exit-friendly commodity, same argument as OKF.

## Rankings

**Layer A (intent vs reality)** — ranked by ability to hold the trust condition:

| # | Candidate | License | Why this rank |
|---|---|---|---|
| 1 | **Registry substrate (OpenSpec/Spec-Kit layout) + no-mistakes gate enforcement** | MIT + MIT | Only option where "updated for EVERYTHING at landing" is machine-enforced; reuses the gate's intent extraction |
| 2 | Spec Kit (GitHub, MIT) as-is | MIT | Best open substrate, agent-agnostic slash-commands; but phase-based spec-first, no living-registry enforcement, weak on small iterative changes [face-value] |
| 3 | OpenSpec as-is | MIT | Operator-tested; fails on unforced delta→registry consolidation [verified] |
| 4 | Kiro / Tessl / Augment Intent | proprietary | Kiro: IDE-resident (EARS notation adoptable, machinery not); Tessl: closed beta, JS-only, non-deterministic regen; Augment: commercial beta [all face-value] |
| — | Spec Growth Engine (arXiv:2606.27045) | none | The blueprint for the enforcement model — watch for its promised public release |

**Layer B (business logic / domain knowledge):**

| # | Candidate | License | Why this rank |
|---|---|---|---|
| 1 | **OpenWiki** (langchain-ai) | MIT | Purpose-built agent docs, generate+maintain, in-repo markdown, AGENTS.md wiring; cron→gate-trigger swap needed |
| 2 | deepwiki-open | MIT | 17k stars, local-first RAG wiki — but May 2026 README strip → commercial "2.0" pivot is disqualifying abandonment risk for a black-box dependency [face-value] |
| 3 | EventCatalog | MIT | Solid versioned-markdown model but scoped to event-driven architectures — domain mismatch for qq [face-value] |
| — | OKF-conformant codebase tooling | — | Still none verified to exist (consistent with round 1) |

## Trust-condition assessment (the ranking criterion)

Structurally enforced: **nothing shipping**. Enforceable via composition: the
gate (single writer at landing, `intent.enabled` already extracting per-push
intent) is the natural enforcement point — and merge/landing time is the
*correct* choke point in a many-worktree setup [medium; structural argument
verified, worktree specifics blog-grade]. Everything else — Spec Kit, OpenSpec,
Kiro, Tessl, OpenWiki's cron — decays into partial coverage because the update
step is invocable rather than unconditional. Verified residuals even under gate
enforcement: (1) the gate proves the registry was *touched*, not that its
content is *true* — semantic drift still needs operator review at PR time;
(2) **brownfield backfill is unsolved** — no adoptable tool proves initial
"EVERYTHING" coverage against an existing codebase (SGE's orphan-code error is
the only articulated forcer, unreleased); (3) **qq's blast-radius escape hatch
is an exhaustiveness hole** — trivial work commits straight to `main` without
passing the gate. _(3) resolved same day by operator decision: the escape
hatch is dropped — everything lands through the gate, one workflow, one
enforcement point._

## Model validation

The operator's taxonomy maps onto independent articulations [Layer A verified;
memory half face-value]: **Layer A** = the spec-anchored tier of the 2026 SDD
taxonomy (Piskala names the trust condition; Grabowski names the landing-time
mechanism). **Layer B** = the LLM-wiki tool class (OpenWiki/DeepWiki).
**Compound** = episodic memory: agent-memory research (arXiv:2602.19320)
separates structured/graph, semantic, and episodic/reflective memory as
distinct classes — the operator's structure / knowledge / solved-problems
split. Two face-value findings from that paper worth keeping: agent memory
writes can *silently fail* while the agent appears to function (supports
gate-proved updates over agent self-report), and asynchronous background
maintenance empirically risks staleness (supports landing-time over cron).

## Caveats

- Selective verification by design: the 9 confirmed findings are single-skeptic
  checks, not 3-vote panels; the 42 supporting claims (tool licenses/status
  landscape, OpenWiki's AGENTS.md injection, deepwiki-open's pivot,
  EventCatalog detail, memory-research results) are unverified face-value.
- Both anchor papers are single-author, non-peer-reviewed preprints; SGE has
  zero implementation. Its enforcement is also asymmetric — code-without-spec
  hard-fails, spec-without-code-evidence only warns.
- OpenWiki states no exhaustiveness guarantee for what its docs cover, and its
  maturity is unknown (v0.0.1 → v0.0.2 in three days).
- The Layer A recommendation is a composition nobody has shipped — it becomes a
  qq gated branch (registry layout + a gate check + a seeding step), which
  brushes against "I don't want to own this"; the counterweight is that the
  substrate and enforcement pieces are both adopted commodities and the glue is
  a config-level check, not a tool.

## Open questions

1. ~~Blast-radius escape hatch~~ **Resolved (07-07, operator):** the escape
   hatch is dropped entirely — every change lands through the gate ("we manage
   a single workflow and figure out small changes from there"), so the registry
   has a single enforcement point and needs no second producer.
2. Brownfield backfill: how is initial exhaustive coverage of the existing
   codebase achieved *and proven*? (No adoptable coverage-completeness check
   exists.)
3. Will the Spec Growth Engine release, and is its spec-per-node + merge-gate
   checker adoptable alongside/inside no-mistakes when it does?
4. What independent check should the gate run to confirm an OpenWiki refresh
   actually reflected the landed diff, rather than trusting the invocation?

## Refuted during verification (do not rely on)

- "Kiro-style per-change specs are ephemeral (deleted after guiding
  generation)" — refuted; misread of the SGE paper.
- "Tessl's spec-as-source package structurally mandates per-spec
  file-ownership/test traceability" — refuted (schema doesn't require it).
- "spec-as-source's three check-scripts mechanically prevent code-spec drift" —
  refuted (they lint spec files' internal consistency, not code-spec sync).

## Key sources

- arxiv.org/abs/2606.27045 (Spec Growth Engine — drift-enforced architecture)
- arxiv.org/abs/2602.00180 (Piskala — SDD taxonomy, "specification rot")
- github.com/Fission-AI/OpenSpec · tessl.io/registry/…/openspec-propose
  (delta→registry consolidation mechanics)
- github.com/langchain-ai/openwiki (Layer B pick; license + CI recipe verified)
- github.com/AsyncFuncAI/deepwiki-open · github.com/event-catalog/eventcatalog
- arxiv.org/html/2602.19320v1 (agent-memory taxonomy)
- Landscape (face-value, blog-grade): martinfowler.com "exploring-gen-ai/sdd-3-tools",
  spec-compare (cameronsjo), glukhov.org, intent-driven.dev, thoughtworks.com,
  dev.to comparisons, augmentcode.com worktree guide.

## Addendum (07-07, same day) — layer 2 reframed: the pick is **beads**

The operator's sharper statement of layer 2 — nestable tickets hybridizing
intent and status, deterministic merge, sharp out of the box, zero appetite to
build it — points at the **git-native agent issue-tracker class**, which the
SDD-framed research round didn't sweep. The standout is **beads** (`bd`,
github.com/gastownhall/beads — Steve Yegge's "distributed graph issue tracker
for AI agents"): **MIT, 25k stars, v1.1.0 (2026-07-04), pushed the day of
writing** [verified via GitHub API]. Purpose-built for exactly this: "replaces
messy markdown plans with a dependency-aware graph" that agents maintain as a
matter of process.

Fit against the operator's spec, all **verified by local smoke test** (v1.1.0,
scratch repo, 2026-07-07):

- **Nestable decomposition** ✅ — epics with hierarchical hash IDs
  (`bdtest-r1p` → `bdtest-r1p.1` → `bdtest-r1p.1.1`), plus typed deps
  (blocks / parent-child / related / discovered-from) and `bd ready`
  (no-open-blockers detection).
- **Intent + status hybrid** ✅ — per-issue `--acceptance` (acceptance
  criteria), description/design/notes fields, status flow with atomic
  `bd update --claim`, close-with-reason, full audit trail; `bd remember`
  for standing project memory injected via `bd prime`.
- **Deterministic merge — better: no merge** ✅ — issues live in an embedded
  Dolt database (cell-level-merge SQL DB) under `.beads/`, synced via
  `refs/dolt/data` on the git remote, *outside the branch dimension entirely*;
  hash IDs prevent collisions. Smoke test: issues created in main tree and a
  linked worktree are one shared workspace (worktree-aware discovery), and
  **two concurrent creates from two worktrees both succeeded** (file-locked
  single writer serializes; working tree stays git-clean as issues change).
- **Out of the box** ✅ — `bd init` + `bd setup claude|codex` (first-class:
  AGENTS.md wiring, a beads skill, benign hooks — SessionStart `bd prime`
  context injection, Codex compact hooks; nothing search-intercepting);
  `beads-mcp` exists on PyPI.

**Revised layer-2 composition: beads (substrate) + the gate (enforcer).**
Intent items are bd issues (nestable, with acceptance criteria); status truth
is bd's normal agent workflow; the gate makes it exhaustive — at landing,
refuse a push that doesn't map to claimed/closed bd issues, and seed new issues
from `intent.enabled` extraction. bd is JSON-queryable, so the gate check is a
few lines. Standing invariants (what the system must *always* be) are not
tickets — the few, slow-moving ones stay in AGENTS.md/methodology, and
descriptive truth is OpenWiki's job (layer 3).

Caveats: Dolt DB is a binary store (gitignored; `issues.jsonl` is a passive
export) — cross-machine sync is `bd dolt push/pull`, and upgrades can carry
schema migrations that exactly one clone should run. `bd init` auto-commits its
wiring files, so adopt on the gated branch, not mid-flight. OpenSpec drops out
of layer 2 entirely.

## Addendum 2 (07-08, operator) — layer 2 re-picked: **Backlog.md**

Settled the next day: **beads is dropped; the layer-2 substrate is
`Backlog.md`** (MrLesk/Backlog.md), covering **intent + work status** in one
surface. Verified against the repo 07-08: MIT, "Markdown-native Task Manager &
Kanban visualizer for any Git repository", ~6k stars, v1.47.1 (2026-06-17);
tasks are plain per-item markdown files in an in-repo `backlog/` directory;
CLI (`backlog task create/edit/list`, `backlog board`, `backlog search`),
terminal kanban + local web board (`backlog browser`); built for AI-assisted
development (spec/plan/code review checkpoints; MCP integration for Claude
Code and Codex). The gate-as-enforcer conclusion is unchanged — landing must
reconcile the backlog; only the substrate moves (again).

Trade against beads, stated honestly: Backlog.md's tasks are plain tracked
markdown — human-legible, diffable, exit-friendly, no binary Dolt store, no
schema migrations. But they live **in the branch dimension** (beads' one
verified superpower was living outside it), so cross-worktree task visibility
and merge behavior needed the same smoke test beads got.

**✅ Smoke test executed (07-08, v1.47.1, scratch repo, two worktrees):**
- **ID minting is cross-branch aware for *committed* state** — with
  `check_active_branches: true`, worktree B minted task-3 after seeing
  worktree A's committed task-2 on a sibling branch. ✅
- **Uncommitted window mints duplicates** — a task created-but-uncommitted in
  one worktree is invisible to the other; both minted task-3. After merging,
  git is clean (different filenames) but Backlog mishandles the duplicate
  *silently*: `task list` shows one task-3, `backlog task 3` opens the other. ❌
- **Same-task edits on two branches** → an ordinary, *visible* git conflict in
  the task file (status line) — predictable, resolvable, not silent. ✅
- **Operating rule adopted** (now in the methodology): create tasks in the
  session that owns the main tree and commit the new task file immediately;
  workers only edit tasks they claim. That closes the duplicate window;
  everything else merges like normal markdown.

The full settled document stack as of 07-08 (operator): structure =
codebase-memory-mcp (an efficient, different way for agents to look at the
codebase) · intent + work status = Backlog.md · durable descriptive docs =
OpenWiki · opportunistic/episodic docs = compound · enforcement = the gate at
landing. Adjacent same-day decisions (agent-to-agent comms over herdr
primitives; Codex workers become first-class herdr panes) are banked in
`ideas/README.md` (#8, #9).

## Addendum 3 (07-08, TASK-7) - OpenWiki engine decision

TASK-7 kept the Layer B decision and narrowed the execution engine. Durable
descriptive docs still target `openwiki/` and still refresh inside the gate
transaction, but the follow-up implementation should not depend on the upstream
OpenWiki CLI plus an API key. The adopted path is a bespoke
`codex exec`-driven, sub-only refresh that vendors OpenWiki's MIT prompt
discipline, preserves the `openwiki/.last-update.json` gitHead protocol, and
keeps the existing self-guarding refresh behavior. The current
`bin/qq-openwiki-refresh` remains the CLI/API-key-guarded stopgap until that
follow-up lands; see `research/2026-07-08-openwiki-engine-sub-only.md` and
`backlog/tasks/task-7 - Generate-the-initial-openwiki-wiki.md`.
