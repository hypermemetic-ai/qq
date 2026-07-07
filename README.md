# qq

My own agent core; bespoke because it only serves me. qq is the command center
I use to run agentic development: sharp skills, operating rules, code knowledge,
parallel sessions, a tuned terminal cockpit, and only the external tools that earn
their keep. **Capability I reach for — not process I maintain.**

Operating rules live in [`AGENTS.md`](./AGENTS.md) (loaded every session;
`CLAUDE.md` symlinks to it). This README is the map and the setup guide.

## The six layers
| layer | what | where |
|---|---|---|
| **Rules** | behavioral floor + task routing | `AGENTS.md` |
| **Actions** | curated, invocable skills | `skills/` |
| **Knowledge** | auto-generated map of the code | `.understand-anything/knowledge-graph.json` |
| **Sessions** | many named parallel agents, each in its own worktree, state-aware | herdr (`herdr`) |
| **Cockpit** | human-driven terminal tools + tuned configs | `cockpit/` |
| **Externals** | live docs · GitHub · fast filesystem | Context7 · `gh` · `fd`/`eza`/`rg` |

## The loop
**Align → Plan → Build → Verify (autonomous) → Sign-off (human, gated) → Review →
Compound.** Trivial work takes the escape hatch — do it directly — but *never*
skips verification. Full detail in `AGENTS.md`. Invoke `orchestrate` to run the
whole loop end-to-end as one command — Claude conducts, Codex implements.

## Skills
15 skills, curated from four MIT collections (mattpocock, superpowers,
compound-engineering, gsd-core) plus four authored for qq — `research`,
`uat-signoff`, `writing-skills`, and `orchestrate`. The index is in `AGENTS.md`;
full provenance in [`SKILLS-ATTRIBUTION.md`](./SKILLS-ATTRIBUTION.md).

## Setup
1. **Preflight** — `bash bin/install.sh` checks the external surface and cockpit
   tools, then prints exact install hints for anything missing.
2. **One-shot activation** — `bash bin/qq-activate.sh` installs the guardrail
   hook, wires the WIP savepoint, and symlinks cockpit configs from this repo into
   `~/.config`.
3. **Skills** — activate as a plugin:
   ```
   /plugin marketplace add /home/qqp/projects/qq
   /plugin install qq@qq
   ```
   Skills become `/qq:grilling`, etc.
4. **Cockpit** — `cockpit/` is the source of truth for yazi, glow, herdr, and
   shell navigation. `herdr prefix+f` opens `qqy`; yazi starts at the repo root;
   pressing Enter on `.md` renders in-pane via mdcat or the tuned Glow theme.
5. **Context7** (live library docs) — `.mcp.json` is set; approve the `context7`
   server on next session start.
6. **Knowledge layer** — `/plugin marketplace add Egonex-AI/Understand-Anything`
   → `/plugin install understand-anything` → `/understand`.
7. **Sessions** — install herdr (`brew install herdr`), then
   `herdr integration install claude codex` so it tracks agent state. Fan out with
   `herdr worktree create --branch <name>` + `herdr agent start <name> --cwd <worktree> -- claude`.

## Provenance
Curated from MIT sources, kept only where they serve my workflow: superpowers
(obra), compound-engineering (EveryInc), gsd-core (open-gsd), agent skills
(mattpocock), context-engineering (muratcankoylan), and Karpathy's guidelines.
The authored pieces fill the gaps I actually use. All sources MIT.
