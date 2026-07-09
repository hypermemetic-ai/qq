# qq

My own agent core; bespoke because it only serves me. qq is the command center
I use to run agentic development: sharp skills, operating rules, code knowledge,
parallel sessions, a tuned terminal cockpit, and only the external tools that earn
their keep. **Capability I reach for — not process I maintain.**

Operating rules live in [`AGENTS.md`](./AGENTS.md) (loaded every session;
`CLAUDE.md` symlinks to it). The shared methodology is
[`qq-methodology.md`](./qq-methodology.md), linked live into other repos.

## The six layers
| layer | what | where |
|---|---|---|
| **Rules** | repo header + linked methodology | `AGENTS.md`, `qq-methodology.md` |
| **Actions** | curated, invocable skills linked live | `skills/` → `~/.claude/skills/` |
| **Knowledge** | the document stack: code graph · intent + work status · durable docs · episodic docs | codebase-memory MCP (out-of-repo) · `backlog/` · `openwiki/` · `docs/solutions/` + `CONCEPTS.md` |
| **Sessions** | many named parallel agents, each in its own worktree, state-aware | herdr (`herdr`) |
| **Cockpit** | human-driven terminal tools + status line + tuned configs | `cockpit/`, `bin/qq-phase` |
| **Externals** | live docs · GitHub · fast filesystem · gate | Context7 · `gh` · `fd`/`eza`/`rg` · `no-mistakes` |

## The loop
**Align → Plan → Build → Verify (autonomous) → Sign-off (human, gated) → Review →
Compound.** Ceremony scales with the task — trivial work skips Align/Plan and is
just done — but *nothing* skips verification, and everything lands through the
gate; the landing agent drives `no-mistakes axi run --intent "<task + AC>"`
with `--skip ci` only after confirming no CI exists, and relays only judgment
calls. Full detail in `AGENTS.md`. Invoke `orchestrate` to
run the whole loop end-to-end as one command — Claude conducts, Codex implements.
Long-running work stamps producer slots in `.qq/state.json` with `qq-phase`, and
`qq-phase render` feeds the Claude Code status line with every active phase plus
any live gate step.

When the backlog is deep, pick from the claimable frontier instead of the raw
To Do column: `bin/qq-frontier` lists unassigned ready tasks with no local or
remote `task-<id>` branch claim; `--afk` narrows to unattended-safe work and
`--json` is for tooling.

## Skills
16 skills, curated from four MIT collections (mattpocock, superpowers,
compound-engineering, gsd-core) plus authored pieces for qq. Link them live from
`skills/` into `~/.claude/skills/` with `bash bin/qq-link.sh skills`; invoke them
as `/grilling`, `/executing-plans`, and so on. The index is in `AGENTS.md`; full
provenance is in [`SKILLS-ATTRIBUTION.md`](./SKILLS-ATTRIBUTION.md).

## Setup
1. **Preflight** — `bash bin/install.sh` checks the external surface, document
   stack, and cockpit tools, then prints exact install hints for anything
   missing.
2. **One-shot activation** — `bash bin/qq-activate.sh` installs the guardrail
   hook, wires the WIP savepoint and `qq-phase` status line, symlinks cockpit
   configs from this repo into `~/.config`, and links skills into
   `~/.claude/skills`.
3. **Skills** — link them live:
   ```
   bash bin/qq-link.sh skills
   ```
   Skills become `/grilling`, `/code-review`, etc.
4. **Linked repos** — wire a repo to the shared methodology:
   ```
   bash bin/qq-link.sh repo <path>
   ```
   This adds the live methodology symlink, ensures the repo imports it, records
   the all-gated landing path in newly scaffolded `AGENTS.md` files, merges
   Context7 into `.mcp.json`, seeds `CONCEPTS.md` only when missing, and ignores
   the transient `.qq/` status directory. For GitHub repos, also set
   delete-branch-on-merge (`gh repo edit --delete-branch-on-merge`) until task-9
   folds that into the linker. Retired gate values (`trunk` / `blast-radius` /
   `human`) are rejected.
5. **Cockpit** — `cockpit/` is the source of truth for yazi, glow, herdr, and
   shell navigation. `herdr prefix+f` opens `qqy`; yazi starts at the repo root;
   pressing Enter on `.md` renders in-pane via mdcat or the tuned Glow theme.
6. **Context7** (live library docs) — `.mcp.json` is set; approve the `context7`
   server on next session start.
7. **Knowledge layer** — install
   [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
   (`install.sh --skip-config`, then `claude mcp add --scope user codebase-memory`
   + the `[mcp_servers.codebase-memory]` block in `~/.codex/config.toml`); the
   index is fully derived, lives in `~/.cache`, and auto-refreshes
   (`auto_index`/`auto_watch`); agents reach it as on-demand MCP tools. TASK-18
   tracks the remaining qq-specific operationalization gap: verify the main-tree
   index, stop or accept throwaway gate-worktree indexes, and diagnose the
   disconnect observed on 2026-07-08. The intent registry is `backlog/`
   ([Backlog.md](https://github.com/MrLesk/Backlog.md),
   `npm i -g backlog.md`); durable docs target `openwiki/`-style in-repo
   markdown. Today `bin/qq-openwiki-refresh` only runs when `openwiki/`, the
   OpenWiki CLI, and a provider key exist; task-7 is researching the sub-only /
   no-key engine path before initial generation.
8. **Sessions** — install herdr (`brew install herdr`), then
   `herdr integration install claude codex` so it tracks agent state. Fan out with
   task branches (`task-<id>-<slug>`, or `task-<id>.<n>-<slug>` for slices):
   `herdr worktree create --branch task-<id>-<slug>` +
   `herdr agent start <name> --cwd <worktree> -- claude`.

## Provenance
Curated from MIT sources, kept only where they serve my workflow: superpowers
(obra), compound-engineering (EveryInc), gsd-core (open-gsd), agent skills
(mattpocock), context-engineering (muratcankoylan), and Karpathy's guidelines.
The authored pieces fill the gaps I actually use. All sources MIT.
