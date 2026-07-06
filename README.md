# hypercore

A lean engineering system for Claude Code. Sharp skills you invoke on demand, a
knowledge layer that maps any codebase, a session layer for running many named
agents in parallel, and a thin external surface. **Capability you reach for — not
process you maintain.**

Operating rules live in [`AGENTS.md`](./AGENTS.md) (loaded every session;
`CLAUDE.md` symlinks to it). This README is the map and the setup guide.

## The five layers
| layer | what | where |
|---|---|---|
| **Rules** | behavioral floor + task routing | `AGENTS.md` |
| **Actions** | curated, invocable skills | `skills/` |
| **Knowledge** | auto-generated map of the code | `.understand-anything/knowledge-graph.json` |
| **Sessions** | many named parallel agents, coordinated by file locks | NTM (`ntm`) |
| **Externals** | live docs · GitHub · fast filesystem | Context7 · `gh` · `fd`/`eza`/`rg` |

## The loop
**Align → Plan → Build → Verify (autonomous) → Sign-off (human, gated) → Review →
Compound.** Trivial work takes the escape hatch — do it directly — but *never*
skips verification. Full detail in `AGENTS.md`. Invoke `orchestrate` to run the
whole loop end-to-end as one command — Claude conducts, Codex implements.

## Skills
15 skills, curated from four MIT collections (mattpocock, superpowers,
compound-engineering, gsd-core) plus four authored for hypercore — `research`,
`uat-signoff`, `writing-skills`, and `orchestrate`. The index is in `AGENTS.md`;
full provenance in [`SKILLS-ATTRIBUTION.md`](./SKILLS-ATTRIBUTION.md).

## Setup
1. **Preflight** — `bash bin/install.sh` checks `gh`/`fd`/`eza`/`tmux`/`ntm` and
   prints the exact install step for anything missing.
2. **Skills** — activate as a plugin:
   ```
   /plugin marketplace add /home/qqp/projects/hypercore
   /plugin install hypercore@hypercore
   ```
   Skills become `/hypercore:grilling`, etc. (Or vendor them into a project's
   `.claude/skills/`.)
3. **Context7** (live library docs) — `.mcp.json` is set; approve the `context7`
   server on next session start.
4. **Knowledge layer** — `/plugin marketplace add Egonex-AI/Understand-Anything`
   → `/plugin install understand-anything` → `/understand`.
5. **Sessions** — install NTM (`brew install dicklesworthstone/tap/ntm`), then
   `ntm spawn <name> --cc=N` to fan out named Claude panes.

## Distribution vs. consumer
This repo is the **distribution**. A working project becomes hypercore-powered by
either installing the plugin or vendoring the skills into its `.claude/skills/`,
alongside its own `AGENTS.md`, `.understand-anything/`, and the `docs/solutions/`
+ `CONCEPTS.md` compounding surface.

## Provenance
Curated from superpowers (obra), compound-engineering (EveryInc), gsd-core
(open-gsd), agent skills (mattpocock), context-engineering (muratcankoylan), and
Karpathy's guidelines — keeping the single best implementation of each capability,
then authoring the three gaps. All sources MIT.
