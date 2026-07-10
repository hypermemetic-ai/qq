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
| **Knowledge item** | `CONCEPTS.md`, Backlog documents and decisions, OpenWiki, and codebase-memory |

Every retained component supports one of these entities or provides the minimum
wiring needed to expose it.

## Repository surfaces

- [`qq-methodology.md`](./qq-methodology.md) is the shared operating guidance.
- [`AGENTS.md`](./AGENTS.md) contains instructions specific to this repository.
- `skills/` contains stateless capabilities discovered through each agent
  runtime's native skill surface.
- `backlog/` holds Tasks, authored documents, and decisions managed through the
  Backlog CLI and its shared search index.
- `CONCEPTS.md` is the shared language agents read before every work item.
- The single `Ideas` Backlog document is the idea capture surface.
- Backlog document categories `plans`, `research`, and `solutions` retain
  historical designs, cited investigations, and reusable lessons.
- herdr provides named agent sessions and direct agent-to-agent messaging.
- `cockpit/` contains the operator's terminal configuration.
- `bin/` installs the live qq surfaces, runs guarded local OpenWiki updates,
  supports herdr pane movement, and preserves recoverable snapshots of
  in-flight work.

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

## Knowledge runtime

OpenWiki and codebase-memory are upstream tools, not vendored qq subsystems.
Install and update them through their own package mechanisms.

OpenWiki uses local ChatGPT OAuth and writes the Repository's current-system
documentation under `openwiki/`:

```bash
qq-openwiki --init
qq-openwiki --update
```

In a restricted fresh-agent or service environment, set `OPENWIKI_BIN` to the
OpenWiki executable's absolute path. The wrapper validates and invokes that
path directly; when it is unset, the wrapper falls back to `command -v
openwiki`. It does not use a login shell for executable discovery.

Temporary debt (2026-07-10): ChatGPT OAuth merged in OpenWiki PR #151 after the
0.1.0 npm release. The operator machine is therefore built from upstream commit
`90e8b22f562a5c8cf3c7377e081710084db1689f`. Replace that source build with
`npm install -g openwiki@latest` and remove this note as soon as a published
release contains PR #151; installing 0.1.0 from npm before then removes OAuth
support.

Its credentials stay under `~/.openwiki/` and must never be committed.

OpenWiki is a local single-writer derived surface owned by a separate maintainer
Actor, not by source-change agents. An advance of `main` is the maintainer's
input. The `openwiki-maintainer` Skill owns observation, generation, review, and
delivery from its dedicated worktree; `qq-openwiki` supplies deterministic
branch, freshness, and process-lock guards.

Temporary debt (2026-07-10): upstream code mode unconditionally writes a
scheduled GitHub Actions workflow and scheduled-workflow agent guidance.
`qq-openwiki` removes that generated plumbing after every local run. Remove this
compatibility behavior when OpenWiki supports local-only code recurrence.

codebase-memory 0.9 or later maintains its derived graph outside the Repository.
Enable initial indexing and background Git change detection:

```bash
codebase-memory-mcp update
codebase-memory-mcp config set auto_index true
codebase-memory-mcp config set auto_watch true
```

After restarting the agent runtime, index each long-lived Repository root once.
Use `list_projects` or `index_status` to confirm that a graph is ready, and
re-run `index_repository` after material uncommitted or branch changes.
`detect_changes` analyzes a Change's impact against Git history; it does not
test index freshness.
