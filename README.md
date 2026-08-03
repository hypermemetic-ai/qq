# qq

qq is qqp-dev's operator-owned harness for agentic development. This repository
is the source of its shared methodology, skills, project knowledge, and cockpit
preferences.

## Model

qq uses seven descriptive entities:

| entity | owner or surface |
| --- | --- |
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

- [`AGENTS.md`](./AGENTS.md) is the shared operating guidance mounted through
  Pi's global context path. Repository-local guidance is optional additive context.
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
- `cockpit/` contains Repository-owned terminal configuration, templates, and
  helpers; ignored operator-local `cockpit/herdr/config.toml` is not
  Repository-owned content.
- `delegation/` contains the delegate role manifests, completion envelope
  template, and execution-profile policy.
- `bin/` holds the qq commands — mounted on `PATH` by the cockpit shell
  surface — for guarded local OpenWiki updates and Herdr project-home focus
  and pane movement.

## Delivery

GitHub Flow is the delivery path. The `deliver-change` Skill owns the agent
procedure for carrying an authorized Change to a green pull request; the
operator merges.

## Install qq

Installation is by construction: every runtime surface mounts this checkout
directly, so day-to-day changes — adding, editing, or removing a Skill, command,
or extension source file — are live everywhere with no install step. A machine
is bootstrapped once.

qq runs stock Pi from the standard global npm installation. Bootstrap the
selected 0.81.1 release without lifecycle scripts:

```bash
npm install --global --ignore-scripts @earendil-works/pi-coding-agent@0.81.1
```

`bin/pi` is the checkout-owned PATH entrypoint. It asks `npm root -g` for the
global package location and executes the package's stock `dist/cli.js` with the
caller's arguments unchanged. It refuses clearly when npm, the package, or the
CLI is absent. After bootstrap, Pi updates use the ordinary `pi update`
command. Ticket implementation and tests do not install or update the live
operator runtime; activation is performed separately after the Change lands.

### Researcher-only native Context7

Canonical researcher children receive only the native `resolve-library-id` and
`query-docs` tools from exact `@upstash/context7-pi@0.1.1`. The researcher
manifest loads its extension through `subagentOnlyExtensions`; accountable
parents, reviewers, implementers, and observers do not receive it. Do not add
an API key, register Context7 with `pi install`, restore MCP automatically, or
copy the vendor prompt or Skill. `qq-delegate` refuses a researcher launch when
it inherits a nonempty `CONTEXT7_API_KEY`; it does not silently clear or use the
credential. Delegates have openly available network egress under decision-8, so
Research-Skill privacy rules—not a network boundary—govern query content.

Install the exact dependency in Pi's operator-owned npm prefix without package
registration or lifecycle scripts. Review the package/lock diff and stop if npm
moves any existing dependency rather than adding the exact root dependency and
its lock entry:

```bash
npm install --prefix "$HOME/.pi/agent/npm" --ignore-scripts --save-exact \
  @upstash/context7-pi@0.1.1
```

Verify the installed artifact, registry integrity recorded in the lock, and
absence from Pi's global package registry:

```bash
prefix="$HOME/.pi/agent/npm"
test "$(jq -r '.dependencies["@upstash/context7-pi"]' "$prefix/package.json")" = 0.1.1
test "$(jq -r '.packages["node_modules/@upstash/context7-pi"].version' "$prefix/package-lock.json")" = 0.1.1
test "$(jq -r '.packages["node_modules/@upstash/context7-pi"].integrity' "$prefix/package-lock.json")" = \
  'sha512-RVwu0alq02SoniWzn3oRbtRzQmM3g/UuVwKEGHGKj77B0twq6RHRyXuq1Gs/WF+hgtA2eI2QaSnSVq7lGjElbA=='
test -f "$prefix/node_modules/@upstash/context7-pi/extensions/context7.ts"
context7_count="$(jq '[.packages[]? | if type == "string" then . else .source? // "" end |
  select(test("context7"; "i"))] | length' "$HOME/.pi/agent/settings.json")" &&
  test "$context7_count" = 0
```

Rollback first removes the researcher manifest's Context7 tool and
`subagentOnlyExtensions` entries through a reviewed qq Change, then removes the
exact npm dependency:

```bash
npm uninstall --prefix "$HOME/.pi/agent/npm" --ignore-scripts \
  @upstash/context7-pi
```

A failed or rolled-back adoption leaves Context7 absent. Restore `.mcp.json`
only after a new explicit operator decision; never silently fall back to the
retired `npx @latest` route.

Mount qq's global context and Skill roots directly into Pi. These root mounts
keep methodology and Skill membership live by construction without per-Repository
activation. The `/bro` and `/check-in` templates mount the same way: the
Repository stays the versioned source, and both global prompt names resolve
everywhere.

```bash
mkdir -p ~/.pi/agent ~/.pi/agent/prompts
ln -sT "$HOME/projects/qq/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
ln -sT "$HOME/projects/qq/skills" "$HOME/.pi/agent/skills"
ln -sT "$HOME/projects/qq/.pi/prompts/bro.md" "$HOME/.pi/agent/prompts/bro.md"
ln -sT "$HOME/projects/qq/.pi/prompts/check-in.md" "$HOME/.pi/agent/prompts/check-in.md"
```

`/check-in [date | commit | PR number | PR URL]` reports every first-parent
`origin/main` advance after the explicit baseline, or after the exact
Repository's last successful local receipt. A first use without either one
refuses to guess. The report reconciles the complete landed inventory with the
Repository Backlog and shows resulting system changes plus active/next work.

Delegation launches through the worktree-resident `bin/qq-delegate` engine. The
canonical `start` and `start-batch` paths validate and accept each ticket, emit
one JSON line with its exact run ID and directory, and return without waiting
for child completion. `status` takes one absolute run directory and returns one
bounded snapshot without a scan or wait; `wait` is the explicit lifecycle wait,
and `collect` validates and returns the exact terminal outcome and completion
envelope. The older `run` and `batch` verbs remain blocking compatibility paths.
The engine resolves each canonical role manifest into explicit Pi arguments
before launch; there is no separate vendor runtime or activation configuration.
The assigned Git worktree is the delegate's only boundary.

At delegated-ticket creation, the owner creates one operator-owned mode-700 run
directory beneath `QQ_DISPATCH_RUNTIME_ROOT` or the assigned worktree and writes
its complete `BRIEF.md`. The engine validates the worktree, run directory,
canonical role manifest, timeout, and declared role tools, then places child
cache, Pi configuration, and session state beneath that directory. The run
directory holds `BRIEF.md`, the private schema-versioned `LAUNCH` identity, the
child-authored `ENVELOPE.md`, and the engine-authored atomic `TERMINAL` v2.
`ENVELOPE.md` is the child's only result; a missing envelope is not complete,
and a child ending on a user message fails. Open
egress remains the decision-8 posture, so role and Skill privacy rules govern
what may leave the worktree.

Start Pi and use `/login` to configure both providers: select Kimi For Coding
for the accountable session's dedicated `pi-qq` credential, then select
`openai-codex` and complete its OAuth login for delegates. Pi writes the
credentials to `~/.pi/agent/auth.json`; never commit or report their values,
and keep the file private:

```bash
chmod 600 ~/.pi/agent/auth.json
```

`delegation/policies/execution-profiles.json` assigns Orchestrator and Reviewer
to `kimi-coding/k3:max`; Architect, Implementer, Researcher, and Observer use
`openai-codex/gpt-5.6-sol:xhigh`. All six currently request the provider-default
service class. `qq-delegate` reads the selected delegated role from this policy
and passes its provider, model, and non-default thinking level through Pi's
native CLI flags.

A delegated route may instead select `auto`, `default`, `flex`, or `priority`
service class when its requested provider is `openai` or `openai-codex`.
`qq-delegate` validates that choice before launch and explicitly loads its
private service-class extension; unsupported fallback payload shapes are left
unchanged. Requested provider/model selection may silently fall back. The
`provider` and `model` fields on persisted assistant messages in Pi session
JSONL are authoritative for who served; footer state and `model_change` entries
only describe selection and are not serving-provider evidence.

The accountable agent creates the global `qq` extension link once per machine:

```bash
mkdir -p "$HOME/.pi/agent/extensions"
ln -sfn "$HOME/projects/qq/extensions" "$HOME/.pi/agent/extensions/qq"
```

That one link mounts the Repository extension set, which is live in every Pi
session from then on. `settings.json` no longer carries extension paths. Source-
only changes need no install step.

The Repository extension gives local feedback when Pi's built-in `write` or
`edit` targets the normalized `backlog/` path of the checkout containing
Pi's current directory. It leaves reads, Bash, ordinary paths, and Backlog CLI
commands alone. This path-only drift-net is not a security boundary and does
not parse shell commands.

The pull-request extension provides the session-scoped `qq_pr_watch` tool. It
polls one exact pull request and sends one follow-up when it reaches `MERGED`
or `CLOSED`, or when inspection fails.

The operator-stage extension provides the `operator_stage` tool. It stages an
operator-only command, without executing it, in a no-focus guarded right-hand
Herdr pane, then sends a Herdr request notification; low- or high-danger
confirmation and pane-read-back outcome validation remain in the pane.

The accountable Pi session stays in the Repository project home and owns
alignment, Task and Change judgment, work orders, verdicts, UAT, and handoff.
Bounded implementation, fresh review, and research use prompt-returning
`qq-delegate start` so the accountable session retains its turn while the
private run continues.

For an existing aligned Change, `/handoff <Task-ID>` is the standard transfer
to a fresh accountable Pi tab. It resolves the Task's unique linked checkout,
verifies its durable plan and ownership rails, and starts the receiver with
no-focus semantics in the persistent project home. Caller authority is
independent of global Herdr focus, which is neither inspected nor restored.
This transfers accountable ownership; it is distinct from bounded child
delegation through `qq-delegate`.

Architect findings use a separate typed accountable-intake route. Observer v2
runs are Repository-qualified beneath
`observer/runs/by-repository/<owner>/<repo>/pr-<N>`. `/architect`
directly opens one bounded global digest of new and still-unsettled finding
occurrences across source rounds and Repositories. It carries slim provenance
for at most 50 ranked findings; detailed evidence stays in cited analyses and
an omitted count reveals the remaining working set. There is no round picker or
fixed verdict form. The Architect records only choices settled in conversation:
route with non-empty agreed scope or set aside current evidence. Untouched
occurrences stay open, and a later same-key occurrence reopens automatically.

`architect_disposition` settles explicitly operator-settled findings in one
call: `action=settle` with one decision per recurrence key — `route` with the
agreed non-empty scope, `set_aside` with empty scope. qq-observe validates
each decision against current occurrences, derives occurrence identities
internally, and appends settled entries to the append-only
Observer-dispositions document. The operator affirmative is conversational;
no machinery stages or confirms proposals. Coverage follows settled entries
and exact key hits in Backlog decision records.

On a machine with the retired Skill mount, remove it if it exists (after
checking it points into this checkout): `rm -r ~/.codex/skills`.

Source the shell surface from `.bashrc`; it prepends `bin/` to `PATH`, making
qq's `bin/pi` stock-package entrypoint authoritative, and provides the cockpit
navigation helpers:

```bash
. "$HOME/projects/qq/cockpit/shell/file-navigation.bash"
```

`qqcd` moves the shell to the focused Herdr worktree, falling back to
`QQ_HOME`; `qqcd <pattern>` selects another directory beneath `HOME` through
`fzf`. File browsing lives inside Pi through `@tmustier/pi-files-widget`.
Outside Pi, the system's `xdg-open` associations own MIME opening.

Link the Repository-owned cockpit configurations whose tools read fixed
`~/.config` paths:

```bash
mkdir -p ~/.config ~/.config/glow
ln -s "$HOME/projects/qq/cockpit/ghostty" ~/.config/ghostty
ln -s "$HOME/projects/qq/cockpit/glow/glow.yml" ~/.config/glow/glow.yml
```

`cockpit/herdr/config.toml` is ignored operator-local state,
not Repository-owned content. If that file exists separately on the machine,
its Herdr link is optional:

```bash
herdr_config="$HOME/projects/qq/cockpit/herdr/config.toml"
if [ -f "$herdr_config" ]; then
  mkdir -p ~/.config/herdr
  ln -s "$herdr_config" ~/.config/herdr/config.toml
fi
```

The tracked cockpit links and optional operator-local Herdr link are day-0
bootstrap, not a sync surface: content is live through each link. Nothing needs
re-running when Skills or commands change.

Ghostty defaults to the portable laptop geometry. Use
`qq-ghostty-profile 4k` for the centered, more-square living-room field and
`qq-ghostty-profile laptop` to return. The selection is external to the
Repository. Reload Ghostty with `ctrl+shift+,` after selecting; padding applies
to newly opened terminal surfaces.

Bootstrap mounts canonical qq guidance globally through
`~/.pi/agent/AGENTS.md`. A Repository may add its own local `AGENTS.md` as
additional project context; that file is not a qq activation marker.

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

Read the latest report, then run `qq-reap apply <id>…` naming only the
nominations to apply; every nomination left out is vetoed. Every scan and
apply writes a dated report, even when empty; a missing report is the failure
signal.

### On-demand or scheduled maintenance

Keep one long-lived `openwiki/update` worktree per linked Repository. For an
assigned refresh, fetch `origin`, reset that worktree to the fresh `origin/main`,
and run `qq-openwiki --update` (`--init` only for first setup). Review the
complete generated diff through `code-review`, and open an ordinary
documentation-only pull request. The operator reviews and merges on-demand
refreshes.

qq also owns an optional systemd user timer for this Repository. It starts a
fresh, ephemeral, explicitly approved headless Pi maintainer assignment every
day at 03:00 machine-local time. `Persistent=false` means a powered-off run is
skipped with no boot catch-up or retry. A six-hour service timeout turns a
wedged attempt into a journal-visible failure before the next daily window. The
unit supplies the Repository and Linuxbrew command paths explicitly. The runner
accepts success only from a private machine-readable receipt written by the
no-change finisher or guarded merger; a normal Pi exit after a reported tool
failure remains a failed service. Separate nonblocking locks prevent overlapping
scheduled assessments and writers.
Install only after the Change has landed:

```bash
bin/qq-openwiki-schedule install
bin/qq-openwiki-schedule inspect
journalctl --user-unit qq-openwiki-daily.service
```

A semantic no-change is success and opens no pull request. A changed run must
produce one generated-`openwiki/**` commit, pass deterministic Checks and
fresh-context review, and wait for the exact `shell-tests` Check. Only the
scheduled marker may invoke `qq-openwiki-merge`; that command revalidates the
fresh base, fixed branch and PR, exact reviewed head, regular generated paths,
Checks, review threads, mergeability, and `qqp-bot` identity before and after
credential loading, then merges with the expected head through GitHub's API.
It never enables native auto-merge or switches the active `gh` account. The
marker and guard are drift-nets against well-meaning automation, not security
boundaries around the local bot credential, and the reviewed-head assertion is
procedural rather than cryptographic evidence. A final-interval `main` advance
is reported after merge and repaired by the next 03:00 assessment.

Disable and unlink the units without deleting journals or credentials:

```bash
bin/qq-openwiki-schedule disable
```

Source Changes still neither trigger nor perform OpenWiki maintenance. They and
ordinary/on-demand refreshes retain operator merge authority.

Temporary debt (2026-07-10): upstream code mode unconditionally writes a
scheduled GitHub Actions workflow and scheduled-workflow agent guidance.
`qq-openwiki` removes that generated workflow and restores the pre-run root
instruction state after every local run. Remove this compatibility behavior
when OpenWiki supports local-only code recurrence without managing agent files.
