# qq

qq is qqp's operator-owned harness for agentic development. This repository
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

- [`AGENTS.md`](./AGENTS.md) is the shared operating guidance. Linked
  Repositories can inherit the same file through a root-level symlink.
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
- `bin/` installs the live qq surfaces, runs guarded local OpenWiki updates, and
  supports herdr pane movement.

## Delivery

GitHub Flow is the delivery path: branch, verified implementation, independent
`code-review` for every non-trivial Change, green commits, pull request, final
GitHub Checks, and operator merge.

## Install qq

From the qq Repository root, run:

```bash
bash bin/install.sh
```

The installer live-links Skills into Codex and links the cockpit configuration
and retained commands. It prunes links to qq Skills and commands that no longer
exist and refuses to replace paths it does not manage. Run it again after adding
or removing a Skill.

The installer does not manage repository instructions. A linked Repository can
point its root `AGENTS.md` symlink directly to qq's `AGENTS.md`, keeping one
source of truth without adding global guidance to unrelated Repositories.

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

Its credentials stay under `~/.openwiki/`, uncommitted.

OpenWiki is a local single-writer derived surface owned by a separate maintainer
Actor, not by source-change agents. An advance of `main` is the maintainer's
input. The `openwiki-maintainer` Skill owns observation, generation, review, and
delivery from its dedicated worktree; `qq-openwiki` supplies deterministic
branch, freshness, process-lock, and root-instruction restoration guards.

Temporary debt (2026-07-10): upstream code mode unconditionally writes a
scheduled GitHub Actions workflow and scheduled-workflow agent guidance.
`qq-openwiki` removes that generated workflow and restores the pre-run root
instruction state after every local run. Remove this compatibility behavior
when OpenWiki supports local-only code recurrence without managing agent files.

codebase-memory 0.9 or later maintains its derived graph outside the Repository.
Enable initial indexing and background Git change detection:

```bash
codebase-memory-mcp update
codebase-memory-mcp config set auto_index true
codebase-memory-mcp config set auto_watch true
```

After restarting the agent runtime, index each long-lived Repository root once.
Freshness and usage rules ride with the agents in `AGENTS.md`;
`openwiki/operations.md` describes the running stack.
