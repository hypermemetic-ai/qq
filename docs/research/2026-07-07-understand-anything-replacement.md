# Replacing Understand-Anything: an agent-maintained codebase-knowledge stack

_2026-07-07 · deep-research round (5 search angles → 21 primary sources fetched →
103 claims extracted → 25 adversarially verified at 3 votes each: 22 confirmed,
3 refuted, 0 left unverified). All surviving claims rest on primary sources
(repos, spec text, code) at 3-0 votes; none relies on blog coverage alone.
Versions verified live as of today: GitNexus v1.6.9, codebase-memory-mcp v0.8.1,
denfry/codebase-index v1.6.0, cocoindex-code v0.2.37, OKF v0.1 Draft — all are
fast-moving 2026 projects; expect drift._

## Question

Replace the Understand-Anything plugin with something GOOD: an out-of-the-box
thing (or small set of easily connectable things) treated as a black box,
maintained by agents as a matter of process. Three pillars: (1) structural code
graph, deterministic where possible; (2) business-logic / domain knowledge;
(3) a Karpathy-style LLM-wiki — including what "Google's OKF" is and whether
anything implements it. Constraints: single operator, local-first, Claude Code +
Codex consumption (files or MCP), MIT/OSS strongly preferred, parallel-safe
across herdr worktrees (no tracked auto-rewritten artifacts; single-writer at
landing time or fully derived/gitignored).

## Verdict — adopt a two-layer stack

**Layer 1 (pillars 1): `codebase-memory-mcp`** (DeusData, MIT, 28k stars,
arXiv:2603.27277) — the structural graph. **[high confidence, 3-0 ×5 merged claims]**

- Deterministic tree-sitter AST extraction across 158 languages, plus "Hybrid
  LSP" static type resolution (native C reimplementation, no language-server
  process) for Python, TS/JS/JSX/TSX, PHP, C#, Go, C, C++, Java, Kotlin, Rust.
- Single self-contained binary, 100% local, no telemetry.
- 14 MCP tools (`index_repository`, `search_graph`, `trace_path`, `query_graph`,
  `get_architecture`, `detect_changes`, …). `codebase-memory-mcp install`
  auto-configures Claude Code (MCP + skills + pre-tool hooks) and Codex CLI
  (MCP + `.codex/AGENTS.md`).
- Maintenance is exactly the black-box model wanted: a background file watcher
  re-indexes on change; the index is a **fully derived** SQLite (WAL) store in
  `~/.cache/codebase-memory-mcp/` — nothing tracked, nothing committed, no
  human curation. This deletes the audit's #1 parallel hazard by construction.

**Layer 2 (pillars 2+3): an OKF-format markdown wiki** maintained by a small qq
skill at landing time. **[high confidence]**

- "Google's OKF" is real and verified: the **Open Knowledge Format**, v0.1
  Draft spec published 2026-06-12 in `GoogleCloudPlatform/knowledge-catalog`
  (`okf/SPEC.md`, Apache-2.0, 6.4k stars) — Google's blog names Karpathy's LLM
  Wiki gist as the pattern it formalizes. It is a directory of plain markdown
  files with YAML frontmatter (only `type` required); no SDK, no database, no
  server. "If you can `cat` a file, you can read OKF; if you can `git clone` a
  repo, you can ship it." **[high, 3-0 ×6 merged claims]**
- **The codebase-shaped gap is ours to fill** — and it's small. Google's
  reference implementations are data-catalog-oriented (BigQuery enrichment
  agent, HTML visualizer, sample bundles); nothing first-party targets code.
  Two adjacent claims were **refuted (0-3)**: the spec does *not* encode an
  agent-driven maintenance model, and `okf-skill` is *not* a verified adoptable
  plugin. So: adopt the **format**, author the **process** — a qq skill that has
  the landing agent write/update `knowledge/*.md` OKF docs at merge time.
  Single-writer at landing, plain tracked prose that diffs and merges cleanly —
  precisely the parallel-safety model the audit called for, and it subsumes the
  earlier `MAP.md` sketch with a standard instead of a bespoke format.

## Ranking

| # | Candidate | License | Pillars | Why this rank |
|---|---|---|---|---|
| 1 | **codebase-memory-mcp + OKF wiki** | MIT + Apache-2.0 | 1 + 2/3 | Meets every stated constraint; graph is derived + out-of-repo; wiki is single-writer prose |
| 2 | **GitNexus** | PolyForm Noncommercial | 1 + hooks + wiki cmd | *Functionally the strongest single tool*: worktree-aware (`git rev-parse --git-common-dir`), stale-index PostToolUse hooks for both Claude Code and Codex, gitignored `.gitnexus/` index, built-in `wiki` command — blocked purely on license (not OSI; commercial tier via akonlabs.com) |
| 3 | **denfry/codebase-index** | MIT | 1 | Fallback if the shared-cache worktree test fails: index lives under the *project root* (`.claude/cache/codebase-index/`), so each worktree is isolated by construction. Weakness: ~6 weeks old, 5 stars, one maintainer |
| 4 | **CocoIndex Code** | Apache-2.0 engine | semantic search only | Complement, not replacement — tree-sitter is used for chunking into an embedding index; no symbol/dependency graph. Its branch-delta multi-worktree claim was **refuted 0-3** |

## Pre-adoption gate — ✅ RUN AND PASSED (07-07)

**The one untested assumption in the #1 pick** was multi-worktree behavior
(undocumented in the README). Smoke test executed 2026-07-07 on
meeting-reviewer (Python, 55 files): baseline index = 752 nodes / 1674 edges in
**0.196 s**; two detached worktrees indexed **concurrently** against the shared
`~/.cache` store → both exit 0, each keyed as its own path-derived project,
counts correct; a `search_graph` query against one project returned correct
results **while the other was mid-reindex**, exit 0. One-edge nondeterminism
observed in the derived `semantic_edges` pass (1673 vs 1674 on identical
trees) — fuzzy-similarity edges, not corruption. Verdict: parallel-safe for
qq's worktree model.

## Adoption record (07-07, operator decisions)

- **GitNexus dropped** — operator wants the genuinely open-source option;
  license analysis retained below for the record.
- **Exposure mode: on-demand tool, not forced path.** The monolithic
  `codebase-memory-mcp install` (which adds Grep/Glob-intercepting PreToolUse
  hooks) was **not** run — installed via `install.sh --skip-config`, then wired
  manually: `claude mcp add --scope user codebase-memory` + an
  `[mcp_servers.codebase-memory]` block in `~/.codex/config.toml` (backup at
  `config.toml.pre-cbm.bak`). Rationale: the 83%-vs-92% datapoint indicts
  graph-*mediated* answering, not graph-*assisted*; hooks that steer every
  search toward the graph are how you buy the 83%. A thin qq skill (to be
  authored via `writing-skills`) will route agents to it for relational/impact
  queries only. `auto_index=true`, `auto_watch=true` (black-box freshness;
  index is derived, out-of-repo, 0.2 s to rebuild). **Operationalization
  follow-up (07-08):** TASK-18 records that adoption did not leave the qq main
  tree indexed, while throwaway gate worktrees were being indexed; it owns the
  main-tree query smoke, gate-worktree exclusion/accept decision, multi-worktree
  verification, and disconnect diagnosis.
- **OKF: adopt the format direction, defer the dependency.** The spec was 3.5
  weeks old at research time; Google's reference implementations are
  data-catalog-shaped and the sole community plugin failed verification —
  pre-ecosystem, not abandoned. Nothing to adopt without owning it. Keep any
  knowledge files OKF-compatible (plain markdown, optional YAML frontmatter);
  revisit when a codebase-oriented OKF implementation exists.
- **SUPERSEDED same day:** the initial conclusion that compound's surfaces
  (`CONCEPTS.md`, `docs/solutions/`) cover pillars 2/3 was overruled by the
  operator — compound is *episodic memory*, a different document type, never
  exhaustive. The knowledge layer proper is a three-layer model: structure
  (graph+files, adopted) · **intent vs reality** (exhaustive registry of wants
  + implementation status, "for EVERYTHING or we can't trust it as truth",
  updated at landing) · **business logic** (domain flows/rules). Layers 2+3 are
  the subject of deep-research round 2 (2026-07-07, report lands separately in
  `research/`); see `ideas/05-methodology-audit-parallel-safety.md` Part 4.

## Caveats worth knowing

- **It buys token economy, not better answers.** Its own paper reports 83%
  answer quality vs 92% for plain file exploration, traded for ~10× token
  savings. Worth validating on real qq architecture questions.
- **Codex-side integration is weaker**: MCP + AGENTS.md but no pre-tool hook
  (upstream issue #330); Claude Code gets the full treatment.
- **OKF is a v0.1 vendor-authored draft** with zero codebase-oriented tooling
  today; the format is adoptable, the process is DIY (a plus for qq: the skill
  is a few dozen lines, and the format is an exit-friendly commodity).
- **GitNexus license question stays open**: whether single-operator qq use
  qualifies as "noncommercial" under PolyForm 1.0.0 is a legal reading, not a
  research finding. If yes, it re-enters as the best all-in-one.
  _License detail (fetched 07-07, LICENSE @ main = stock PolyForm NC 1.0.0):_
  permitted "Personal uses" = "research, experiment, and testing …, personal
  study, private entertainment, hobby projects, amateur pursuits …, **without
  any anticipated commercial application**". First-violation cure window: 32
  days from written notice. README: "Commercial use of the OSS version is also
  available with proper licensing" — no public pricing; contact
  founders@akonlabs.com / Discord (Akan Labs runs the managed/self-hosted
  enterprise tier).

## Open questions

1. codebase-memory-mcp shared `~/.cache` SQLite under concurrent worktree
   indexing — the smoke test above.
2. Is a community codebase-to-OKF generator emerging? (None verified today.)
3. Does personal use qualify under GitNexus's PolyForm Noncommercial?
4. Does the 83%-vs-92% quality tradeoff matter on qq's real questions, or is
   the graph mainly for token economy?

## Refuted during verification (do not rely on)

- CocoIndex "handles branches as deltas over a shared main index" — 0-3.
- "OKF spec encodes agent-driven maintenance" — 0-3 (it's format-only).
- "okf-skill is an adoptable MIT Claude Code plugin" — 0-3.

## Key sources (primary)

- github.com/DeusData/codebase-memory-mcp · arxiv.org/abs/2603.27277
- github.com/GoogleCloudPlatform/knowledge-catalog → `okf/SPEC.md` ·
  cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/
- github.com/abhigyanpatwari/GitNexus (incl. LICENSE @ main)
- github.com/denfry/codebase-index
- cocoindex.io/cocoindex-code · github.com/cocoindex-io/cocoindex-code
