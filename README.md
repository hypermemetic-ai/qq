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
| **Knowledge item** | `CONCEPTS.md`, Backlog documents and decisions, and OpenWiki |

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
- herdr provides persistent `main` project homes, named agents, and direct
  agent-to-agent messaging.
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

The project-local pi extension `.pi/extensions/qq-subagent-env.ts` sets the two
delegation variables and the structured-output runtime root in-process for any
pi session in this repository (and its worktrees), resolved from the checkout
the session runs against:

- `PI_SUBAGENT_PI_BINARY=<checkout>/bin/qq-dispatch`
- `PI_SUBAGENT_EXTRA_AGENT_DIRS=<checkout>/delegation/manifests/agents`
- `QQ_DISPATCH_RUNTIME_ROOT=<temporary-directory>/pi-subagents-uid-<uid>`

Pi auto-discovers the extension once the project is trusted, so delegates
dispatch confined by construction — no shell exports or launcher wrappers to
remember. Variables already set in the environment are left untouched, and
sessions in other projects never load the extension and keep the vanilla
dispatcher. Relaunch pi (or `/reload`) after install or upgrade.

Set the dispatcher-side pi-subagents config at
`~/.pi/agent/extensions/subagent/config.json` to include:

```json
{
  "intercomBridge": {
    "mode": "off"
  },
  "defaultSessionDir": "/tmp/pi-subagent-sessions"
}
```

qq delegate visibility uses run artifacts and status, so the intercom bridge
stays off instead of adding bridge tools to the staged child configuration.
`defaultSessionDir` keeps child session transcripts under a Landstrip-granted
temp root; without it, pi-subagents nests child sessions inside the parent
session tree, which the confinement policy deliberately does not grant. The
config is required: the adapter refuses dispatch when it is missing or
malformed. The configured path must be a direct `pi-subagent-*` child of the
launcher temp directory (`$TMPDIR` or `/tmp`). The project extension
pre-creates the root (mode 700) at session start and tightens an
operator-owned loose root; at dispatch the adapter enforces the contract and
fails closed on a symlink, foreign ownership, or any mode other than 700
rather than widening the grant.

The extension resolves the adapter and manifests from the checkout the
session runs in — a session in a Change worktree uses that worktree's
copies, which travel with the branch. Explicit environment variables always
win, including empty values (pi-subagents reads those as its vanilla
fallback); when overriding manually, point at the primary `main` checkout.
Pi-subagents inherits the one-time setup for every spawn and supplies the child
role, while its `cwd` selects the assigned worktree. The canonical adapter
serves any worktree from that Repository, refuses unrelated repositories,
renders that worktree's Landstrip grants, and starts the real Pi child under
bounded descendant cleanup. The three role manifests pin delegates to
`openai-codex/gpt-5.6-sol:xhigh` independently of the accountable session's
default model, and the adapter loads `extensions/qq-codex-fast.ts` into every
child so delegate GPT-5.6 requests run on the priority service tier (fast
mode).

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
`qq-dispatch` is only its fail-closed Landstrip adapter.

### Local latency observation

`qq-observe` writes append-only JSONL spans to
`${XDG_STATE_HOME:-$HOME/.local/state}/qq/spans/<repo-name>/spans.jsonl`.
It refuses a store that resolves inside any Git worktree. There is no daemon,
network export, or tracked runtime state. Record an engine span directly, or
import the timestamp range of a Pi session JSONL file:

```bash
qq-observe record --name execute_tool --phase implementation --actor engine \
  --start 2026-07-21T10:00:00Z --end 2026-07-21T10:00:01Z
qq-observe read-session ~/.pi/agent/sessions/--path--/session.jsonl \
  --phase orientation --actor accountable-session
```

At each delegate spawn, `qq-dispatch` records an `invoke_agent` span and injects
`QQ_TRACE_ID`, `PI_ROOT_SPAN_ID`, and its new span ID as
`PI_PARENT_SPAN_ID`. A policy-path experiment confirms these arbitrary parent
environment variables reach the confined Pi child, so nested pi-subagents runs
correlate automatically when the accountable session supplies root context.
Observation failures are reported but never change the child exit status.

`qq-dispatch` maps the child exit code to a raw span status at write time. At
read time, `qq-observe summarize` resolves raw errors for dispatch spans ending
with teardown signal status 143, 130, or 129 from pi-subagents' run outcome at
`<runtime-root>/async-subagent-runs/<run.id>/status.json`. The runtime root is
`$QQ_DISPATCH_RUNTIME_ROOT` when set, otherwise
`${TMPDIR:-/tmp}/pi-subagents-uid-<uid>`. A `complete` run resolves to `ok`;
`failed` and `stopped` remain `error`, and a missing, unreadable, malformed, or
other run state leaves the raw error in place as unresolved. Summarization does
not modify the append-only store, and `summarize --json` exposes every span's
`raw_status`, resolved `status`, and any `outcome` resolution note in
`span_statuses`.

The project extension `.pi/extensions/qq-trace-context.ts` establishes one
root trace context when an accountable interactive Pi session loads. When the
variables are absent, it mints `QQ_TRACE_ID` and a session-root span ID, sets
both `PI_ROOT_SPAN_ID` and `PI_PARENT_SPAN_ID` to that root, and records a
zero-duration, phase-less `invoke_workflow` structural marker. Explicitly set
values always win; delegate sessions inherit all three variables through
`qq-dispatch`, so the extension is a no-op there. With no pre-set span context,
each top-level dispatch is therefore a direct child of the accountable session
root. The extension logs its IDs once as `[qq-trace-context] trace_id=…
root_span_id=…`; observation failure is non-fatal.

Use those logged IDs to import the session JSONL's coarse wall-time span into
the same trace after the session:

```bash
qq-observe read-session <session.jsonl> --trace-id <trace> --parent-span-id <root>
```

The accountable session's own phases remain one coarse span, not per-phase
splits.

On a machine with the retired Skill mount, remove it if it exists (after
checking it points into this checkout): `rm -r ~/.codex/skills`.

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

OpenWiki is an upstream tool, not a vendored qq subsystem. Install and update
it through its own package mechanism.

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
The same `QQ_<TOOL>_BIN` convention applies to Herdr, GitHub CLI, and Git where
qq resolves those tools.

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
