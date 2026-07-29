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
- `cockpit/` contains the operator's terminal configuration.
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

qq's accountable runtime is the exact patched Pi identity
`0.81.1+qq.execution-profile.2` on Linux x64. `bin/qq-pi-runtime` is the sole
builder, artifact verifier, generation installer, and runtime resolver;
`bin/pi` is the PATH-level command. It never falls back to a stock or global
Pi. A missing, corrupt, writable, foreign-owned, unpatched, or stale generation
therefore refuses launch instead of silently selecting another executable.

Only `fetch` performs network work. It downloads the manifest-pinned Pi source,
Node/npm, and Bun archives, verifies their SHA-256 digests, and hydrates the npm
cache from the exact upstream locks without lifecycle scripts. Because the
release source omits its generated model-data directory, fetch also verifies
and caches that directory from the exact `@earendil-works/pi-ai@0.81.1`
tarball named by the release's install lock and pinned in the durable manifest;
it never refreshes a live model catalog. `build` consumes those inputs offline,
applies the durable patch, and emits a deterministic, self-describing artifact.
Keep artifacts outside the Repository; they are derived machine state and must
not be committed.

```bash
artifact="${XDG_CACHE_HOME:-$HOME/.cache}/qq/pi-runtime/pi-0.81.1-qq.tar.gz"
bin/qq-pi-runtime fetch
bin/qq-pi-runtime build --output "$artifact"
bin/qq-pi-runtime inspect-artifact "$artifact"
bin/qq-pi-runtime install "$artifact"
bin/qq-pi-runtime verify
```

Installation publishes an immutable content-addressed generation, atomically
moves `current`, and retains exactly the preceding known-good generation as
`previous`. The manifest accepts only its current provenance and explicitly
listed exact prior-provenance digests, so a reviewed runtime upgrade and its
rollback generation remain executable without admitting arbitrary historical
artifacts. Reinstalling the identical active artifact is idempotent. Verify an
active runtime at any time, or exchange `current` and `previous` atomically;
running rollback again rolls forward. A source-Change rollback must also revert
that Change's policy/manifests before using its older runtime:

```bash
bin/qq-pi-runtime verify
bin/qq-pi-runtime rollback
```

After this Change is merged, the agent-owned activation procedure runs the
install and verify commands, sources the cockpit shell, confirms that
`command -v pi` is this checkout's `bin/pi`, checks the exact `pi --version`,
and reruns
`herdr integration install pi` so future root and architect tabs inherit the
verified wrapper. Ticket implementation and tests do not mutate the live
installation or Herdr integration.

Every Pi upgrade is an explicit qq Change: update the pinned source and
Linux-x64 toolchain hashes, rebase and review the patch, rerun conformance and
two-build reproducibility Checks, then install only the reviewed artifact.
Moving tags, `@latest`, global Pi, and raw-binary overrides are not runtime
authorities.

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
activation:

```bash
mkdir -p ~/.pi/agent
ln -sT "$HOME/projects/qq/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
ln -sT "$HOME/projects/qq/skills" "$HOME/.pi/agent/skills"
```

Delegation launches through the worktree-resident `bin/qq-delegate` engine. The
engine is blocking and resolves each canonical role manifest into explicit Pi
arguments before launch; there is no separate vendor runtime or activation
configuration. The assigned Git worktree is the delegate's only boundary.

At delegated-ticket creation, the owner creates one operator-owned mode-700 run
directory beneath `QQ_DISPATCH_RUNTIME_ROOT` or the assigned worktree and writes
its complete `BRIEF.md`. The engine validates the worktree, run directory,
canonical role manifest, timeout, and declared role tools, then places child
cache, Pi configuration, and session state beneath that directory. The run
directory holds `BRIEF.md`, the child-authored `ENVELOPE.md`, and the
engine-authored `TERMINAL`. `ENVELOPE.md` is the child's only result; a missing
envelope is not complete, and a child ending on a user message fails. Open
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

Install the exact six-role policy as one private, atomically replaced
operator-owned document, then verify it:

```bash
bin/qq-execution-profiles install
bin/qq-execution-profiles verify
```

`delegation/policies/execution-profiles.json` assigns Orchestrator, Architect,
and Reviewer to `kimi-coding/k3:max`; Implementer, Researcher, and Observer use
`openai-codex/gpt-5.6-sol:xhigh`. All six request the provider
default service class. Repository settings, Pi defaults, manifests, caller
arguments, fallbacks, and inherited environment values cannot override this
map. The resolver rereads it before each logical request and rejects invalid,
unsupported, conflicting, or untrusted state before authentication or network
activity.

Start the dedicated Architect root through its role-binding launcher; ordinary
Pi roots are Orchestrators:

```bash
bin/qq-pi-role architect
```

The accountable agent creates the global `qq` extension link once per machine:

```bash
mkdir -p "$HOME/.pi/agent/extensions"
ln -sfn "$HOME/projects/qq/extensions" "$HOME/.pi/agent/extensions/qq"
```

That one link mounts the Repository extension set, which is live in every Pi
session from then on. `settings.json` no longer carries extension paths. Source-
only changes need no install step. On first bootstrap and after a reviewed
extension dependency-lock change, install the exact root lock from the mounted
checkout with lifecycle scripts disabled:

```bash
npm ci --ignore-scripts
```

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
Bounded implementation, fresh review, and research run through the blocking
`qq-delegate` engine.

For an existing aligned Change, `/handoff <Task-ID>` is the standard transfer
to a fresh accountable Pi tab. It resolves the Task's unique linked checkout,
verifies its durable plan and ownership rails, and starts the receiver with
no-focus semantics in the persistent project home. Caller authority is
independent of global Herdr focus, which is neither inspected nor restored.
This transfers accountable ownership; it is distinct from bounded child
delegation through `qq-delegate`.

Architect findings use a separate typed accountable-intake route. Observer v2
runs are Repository-qualified beneath
`observer/runs/by-repository/<owner>/<repo>/pr-<N>[-blind]`; legacy flat v1
package evidence remains visibly legacy and is never rewritten. `/architect`
directly opens one bounded global digest of new and still-unsettled finding
occurrences across source rounds and Repositories. It carries slim provenance
for at most 50 ranked findings; detailed evidence stays in cited analyses and
an omitted count reveals the remaining working set. There is no round picker or
fixed verdict form. The Architect records only choices settled in conversation:
route with non-empty agreed scope or set aside current evidence. Untouched
occurrences stay open, and a later same-key occurrence reopens automatically.

JSON remains the canonical format for machine interfaces, persistence, schemas,
receipts, JSONL, and hashes. At an explicit qq-owned model-ingress boundary,
a measured substantial structured value may instead be presented to the model
with deterministic TOON encoding. `/architect` is the only current qualifying
boundary: it keeps and validates canonical parsed JSON, then encodes that value
once for its prompt. A representative 42-finding context measured about 5.7%
fewer estimated o200k tokens than compact JSON with TOON 4.1.0; this is shape-
specific evidence, not a promise of universal savings.

`architect_disposition` first returns an exact natural summary and confirmation
question without writing. Only an unchanged proposal plus a later exact clear
affirmative interactive reply confirms. A set-aside-only batch is Task-free; a
routed multi-source batch writes one content-addressed Observer handoff and
starts one fresh qq-home accountable recipient. Until complete verified Task
mappings arrive, that exact batch remains visible as operator-settled pending
intake. An explicit interactive request naming its batch or handoff can retry
the same handoff; it cannot re-propose scope or create another batch. Exact
`MERGED` PR/head/Repository receipts later resolve mapped Tasks. Existing v1
round handoffs remain recoverable through low-level compatibility commands.

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

At each delegate spawn, `qq-delegate` records an `invoke_agent` span and
injects `QQ_TRACE_ID`, `PI_ROOT_SPAN_ID`, and its new span ID as
`PI_PARENT_SPAN_ID`. These arbitrary parent environment variables reach the
plain Pi child, so nested delegate runs correlate automatically when the
accountable session supplies root context. Observation failures are reported
but never change the child exit status.

The project extension `.pi/extensions/qq-trace-context.ts` establishes one
root trace context when an accountable interactive Pi session loads. When the
variables are absent, it mints `QQ_TRACE_ID` and a session-root span ID, sets
both `PI_ROOT_SPAN_ID` and `PI_PARENT_SPAN_ID` to that root, and records a
zero-duration, phase-less `invoke_workflow` structural marker. Explicitly set
values always win; delegate sessions inherit all three variables through
`qq-delegate`, so the extension is a no-op there. With no pre-set span context,
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

Source the shell surface from `.bashrc`; it prepends `bin/` to `PATH`, making
qq's verified `bin/pi` wrapper authoritative ahead of any stock/global Pi, and
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
mkdir -p ~/.config ~/.config/glow ~/.config/herdr
ln -s "$HOME/projects/qq/cockpit/ghostty" ~/.config/ghostty
ln -s "$HOME/projects/qq/cockpit/glow/glow.yml" ~/.config/glow/glow.yml
ln -s "$HOME/projects/qq/cockpit/glow/tuned.json" ~/.config/glow/tuned.json
ln -s "$HOME/projects/qq/cockpit/herdr/config.toml" ~/.config/herdr/config.toml
```

These file links are day-0 bootstrap, not a sync surface: content is live
through each link, and the set changes only when a new cockpit tool is
adopted. Nothing needs re-running when Skills or commands change.

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

Read the latest report, delete nomination lines to veto them, then run
`qq-reap apply <report>`. Every scan and apply writes a dated report, even
when empty; a missing report is the failure signal.

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
