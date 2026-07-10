# qq

qq is surlej's operator-owned harness for agentic development. This repository
is the source of its shared methodology, skills, project knowledge, and cockpit
preferences.

## Model

qq uses seven descriptive entities:

| entity | owner or surface |
|---|---|
| **Actor** | the operator and replaceable agents |
| **Repository** | Git and GitHub |
| **Task** | Backlog.md |
| **Change** | branch, commits, and pull request |
| **Check** | local verification and GitHub Actions |
| **Skill** | `skills/` |
| **Knowledge item** | `CONCEPTS.md`, `docs/`, OpenWiki, and codebase-memory |

Every retained component supports one of these entities or provides the minimum
wiring needed to expose it.

## Repository surfaces

- [`qq-methodology.md`](./qq-methodology.md) is the shared operating guidance.
- [`AGENTS.md`](./AGENTS.md) contains instructions specific to this repository.
- `skills/` contains stateless capabilities discovered through each agent
  runtime's native skill surface.
- `backlog/` is the Task registry.
- `CONCEPTS.md` is the shared language agents read before every work item.
- `docs/ideas.md` is the live idea capture surface; `docs/ideas/` retains earlier
  idea and design records.
- `docs/research/` holds cited investigations.
- `docs/solutions/` holds reusable lessons captured by `compound`.
- herdr provides named agent sessions and direct agent-to-agent messaging.
- `cockpit/` contains the operator's terminal configuration.
- `bin/` installs the live qq surfaces, supports herdr pane movement, and
  preserves recoverable snapshots of in-flight work.

## Delivery

GitHub Flow is the delivery path: branch, verified implementation, independent
`code-review` for every non-trivial Change, green commits, pull request, final
GitHub Checks, and operator merge.

## Install qq

From the qq Repository root, run:

```bash
bash bin/install.sh
```

The installer live-links the shared methodology and Skills into Codex, links
the cockpit configuration and retained commands, and registers the WIP recovery
hook. It prunes links to qq Skills that no longer exist and refuses to replace
paths it does not manage. Run it again after adding or removing a Skill.

In the next Codex session, run `/hooks`, review the WIP hook, and trust it. Codex
skips new or changed hooks until they are explicitly trusted; WIP recovery is
not active until `/hooks` shows it as trusted.

Verify the methodology target with `readlink -f ~/.codex/AGENTS.md`. New Codex
sessions load it globally and layer each Repository's local `AGENTS.md`
afterward. Other agent runtimes expose the same source through their native
instruction discovery.
