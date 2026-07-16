# qq

qq is qqp-dev's operator-owned harness for agentic development. This repository
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
- herdr provides persistent `main` project homes, short-labeled grouped
  worktree sessions, named agents, and direct agent-to-agent messaging.
- `cockpit/` contains the operator's terminal configuration.
- `bin/` installs the live qq surfaces, runs guarded local OpenWiki updates, and
  validates Herdr project-home focus and pane movement.

## Delivery

GitHub Flow is the delivery path. The `deliver-change` Skill owns the agent
procedure for carrying an authorized Change to a green pull request; the
operator merges.

## Install qq

From the qq Repository root, run:

```bash
bash bin/install.sh
```

The installer live-links Skills into Codex and Claude Code, links the cockpit
configuration and retained commands, and prunes links to qq Skills and commands
that no longer exist. It refuses to replace paths it does not manage. Run it
again after adding or removing a Skill.

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

In a restricted fresh-agent or service environment, set `QQ_OPENWIKI_BIN` to the
OpenWiki executable's absolute path. The wrapper validates and invokes that
path directly; when it is unset, the shared resolver checks `PATH` and known
Homebrew locations. It does not use a login shell for executable discovery.
The same `QQ_<TOOL>_BIN` convention applies to Herdr, GitHub CLI, Git, and Codex
where qq resolves those tools.

Temporary debt (2026-07-10): ChatGPT OAuth merged in OpenWiki PR #151 after the
0.1.0 npm release. The operator machine is therefore built from upstream commit
`90e8b22f562a5c8cf3c7377e081710084db1689f`. Replace that source build with
`npm install -g openwiki@latest` and remove this note as soon as a published
release contains PR #151; installing 0.1.0 from npm before then removes OAuth
support.

Its credentials stay under `~/.openwiki/`, uncommitted.

OpenWiki is a local single-writer derived surface owned by a separate maintainer
Actor, not by source-change agents. Refresh is explicitly assigned on demand or
by an optional schedule; source Changes do not trigger or perform it. The
`openwiki-maintainer` Skill owns generation, independent verification, and
delivery from its dedicated worktree; OpenWiki's internal generator owns
wiki authorship. `qq-openwiki` supplies deterministic branch, freshness,
process-lock, and root-instruction restoration guards.

### On-demand or scheduled maintenance

Keep one long-lived `openwiki/update` worktree per linked Repository. For an
assigned refresh, fetch `origin`, reset that worktree to the fresh `origin/main`,
and run `qq-openwiki --update` (`--init` only for first setup). Review the
complete generated diff through `code-review`, and open an ordinary
documentation-only pull request. The operator reviews and merges it. Running
`bash bin/install.sh` also prunes legacy merge-activation artifacts that qq
owns.

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
codebase-memory's stock agent adapter owns usage guidance, while its configured
indexer and watcher own freshness. `openwiki/operations.md` describes the
running stack.
