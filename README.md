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
- `delegation/` contains the production pi-subagents role manifests,
  Completion Envelope schema, and Landstrip role policy map.
- `bin/` holds the qq commands — mounted on `PATH` by the cockpit shell
  surface — for guarded local OpenWiki updates and Herdr project-home focus
  and pane movement.

## Delivery

GitHub Flow is the delivery path. The `deliver-change` Skill owns the agent
procedure for carrying an authorized Change to a green pull request; the
operator merges.

## Install qq

Installation is by construction: every runtime surface mounts this checkout
directly, so day-to-day changes — adding, editing, or removing a Skill or a
command — are live everywhere with no install step. A machine is bootstrapped
once.

Pi 0.80.10 or newer is the accountable runtime in each Repository's project
home. Install current Pi and Herdr's native Pi integration, then verify the Pi
version is at least 0.80.10:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@latest
pi --version
herdr integration install pi
```

Install the delegation orchestrator into Pi, and the Landstrip binary
package directly into Pi's operator-owned npm tree. Do NOT `pi install
npm:pi-landstrip`: registering the extension makes it wrap the accountable
session's own Bash in a sandbox, and unversioned installs drift from the
adapter's pinned Landstrip version (delegation/policies/roles.json).

```bash
pi install npm:pi-subagents
npm install --prefix ~/.pi/agent/npm --legacy-peer-deps @landstrip/landstrip-linux-x64@0.17.31
```

(On macOS/Windows install the matching `@landstrip/landstrip-<platform>-<arch>`
package at the same version.) The Landstrip binary then lives beneath
`~/.pi/agent/npm`. `qq-dispatch` resolves that operator Pi copy by default, or
the absolute `QQ_LANDSTRIP_BIN` override when one is set. It does not resolve a
Repository-local `.pi/npm` copy.

Mount the qq Skill root directly into Pi. This is one root mount, so Skill
membership stays live by construction:

```bash
mkdir -p ~/.pi/agent
ln -sT "$HOME/projects/qq/skills" "$HOME/.pi/agent/skills"
```

Mount the Skill set for Claude Code and Codex:

```bash
mkdir -p ~/.claude ~/.codex
ln -sT "$HOME/projects/qq/skills" "$HOME/.claude/skills"
ln -sT "$HOME/projects/qq/skills" "$HOME/.codex/skills"
```

Set qq's production adapter and role manifests once in the environment that
launches the accountable Pi session (cockpit/Herdr session configuration or
shell rc). These are one-time environment settings. Both paths must be absolute
and point into the Repository's primary `main` checkout:

```bash
export PI_SUBAGENT_PI_BINARY="$HOME/projects/qq/bin/qq-dispatch"
export PI_SUBAGENT_EXTRA_AGENT_DIRS="$HOME/projects/qq/delegation/manifests/agents"
```

Set the dispatcher-side pi-subagents config at
`~/.pi/agent/extensions/subagent/config.json` to include:

```json
{
  "intercomBridge": {
    "mode": "off"
  }
}
```

qq delegate visibility uses run artifacts and status, so the intercom bridge
stays off instead of adding bridge tools to the staged child configuration.

The adapter and manifests are authoritative qq configuration from primary
`main`; do not retarget these variables to a Change worktree's copies.
Pi-subagents inherits the one-time setup for every spawn and supplies the child
role, while its `cwd` selects the assigned worktree. The canonical adapter
serves any worktree from that Repository, refuses unrelated repositories,
renders that worktree's Landstrip grants, and starts the real Pi child under
bounded descendant cleanup. The three role manifests pin delegates to
`openai-codex/gpt-5.6-sol` independently of the accountable session's default
model.

Start Pi and use `/login` to configure both providers: select Kimi For Coding
for the accountable session's dedicated `pi-qq` credential, then select
`openai-codex` and complete its OAuth login for delegates. Pi writes the
credentials to `~/.pi/agent/auth.json`; never commit or report their values,
and keep the file private:

```bash
chmod 600 ~/.pi/agent/auth.json
```

Merge these defaults into `~/.pi/agent/settings.json`. Replace the example
extension path with the output of this command; the JSON value must be an
absolute path, not a `$HOME` expression.

```bash
readlink -f "$HOME/projects/qq/cockpit/pi/qq-backlog-guard.ts"
readlink -f "$HOME/projects/qq/extensions/qq-pr-watch.ts"
```

```json
{
  "defaultProvider": "kimi-coding",
  "defaultModel": "k3",
  "defaultThinkingLevel": "max",
  "extensions": [
    "/home/USER/projects/qq/cockpit/pi/qq-backlog-guard.ts",
    "/home/USER/projects/qq/extensions/qq-pr-watch.ts"
  ]
}
```

These defaults select the native `kimi-coding/k3` route with max thinking.

The Repository extension gives local feedback when Pi's built-in `write` or
`edit` targets the normalized `backlog/` path of the checkout containing
Pi's current directory. It leaves reads, Bash, ordinary paths, and Backlog CLI
commands alone. This path-only drift-net is not a security boundary and does
not parse shell commands.

The pull-request extension provides the session-scoped `qq_pr_watch` tool. It
polls one exact pull request and sends one follow-up when it reaches `MERGED`
or `CLOSED`, or when inspection fails.

The accountable Pi session stays in the Repository project home and owns
alignment, Task and Change judgment, work orders, verdicts, UAT, and handoff.
Bounded implementation, fresh review, and research run through pi-subagents;
`qq-dispatch` is only its fail-closed Landstrip adapter. Keep Claude Code
installed and configured, including its Skill mount and Herdr integration, as
the supported fallback runtime.

On a machine migrating off the retired installer, remove the old per-skill
link directories first (after checking they hold nothing but links into this
checkout): `rm -r ~/.claude/skills ~/.codex/skills`. `ln -sT` fails loudly
rather than nesting a link inside a directory that still exists.

Source the shell surface from `.bashrc`; it prepends `bin/` to `PATH` and
provides the cockpit navigation helpers:

```bash
. "$HOME/projects/qq/cockpit/shell/file-navigation.bash"
```

`qqcd` moves the shell to the focused Herdr worktree, falling back to
`QQ_HOME`; `qqcd <pattern>` selects another directory beneath `HOME` through
`fzf`. File browsing lives inside Pi through `@tmustier/pi-files-widget`.
Outside Pi, the system's `xdg-open` associations own MIME opening.

Link the cockpit configurations whose tools read fixed `~/.config` paths:

```bash
mkdir -p ~/.config/glow ~/.config/herdr
ln -s "$HOME/projects/qq/cockpit/glow/glow.yml" ~/.config/glow/glow.yml
ln -s "$HOME/projects/qq/cockpit/glow/tuned.json" ~/.config/glow/tuned.json
ln -s "$HOME/projects/qq/cockpit/herdr/config.toml" ~/.config/herdr/config.toml
```

These file links are day-0 bootstrap, not a sync surface: content is live
through each link, and the set changes only when a new cockpit tool is
adopted. Nothing needs re-running when Skills or commands change.

Bootstrap does not manage repository instructions. A linked Repository can
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

### Weekly reaping

Make `qq-reap` a weekly operator habit; for example:

```cron
0 9 * * 1 cd <repo> && bin/qq-reap scan
```

Read the latest report, delete nomination lines to veto them, then run
`qq-reap apply <report>`. Every scan and apply writes a dated report, even
when empty; a missing report is the failure signal.

### On-demand or scheduled maintenance

Keep one long-lived `openwiki/update` worktree per linked Repository. For an
assigned refresh, fetch `origin`, reset that worktree to the fresh `origin/main`,
and run `qq-openwiki --update` (`--init` only for first setup). Review the
complete generated diff through `code-review`, and open an ordinary
documentation-only pull request. The operator reviews and merges it.

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
