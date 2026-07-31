# Architecture and knowledge model

## Architectural intent

qq is deliberately a thin harness. It composes upstream ownership surfaces instead of maintaining a central state machine:

- Git and GitHub own the Repository and Change lifecycle.
- Backlog.md owns durable Task intent/status plus authored documents and decisions.
- The exact patched Pi runtime discovers methodology, Skills, prompts, and extensions through root mounts.
- OpenWiki describes the current system.
- Herdr supplies persistent project homes and direct agent messaging.
- The operator owns judgment, acceptance, and source-Change merge authority. On-demand OpenWiki Changes are also operator-merged; the optional scheduled service may merge only through qq's guarded exact-head path.

The Repository is a policy, knowledge, runtime, cockpit, and adapter layer—not an incomplete workflow platform. Recent history removed custom phase, wave, registry, confinement, status, and orchestration machinery. OpenWiki maintenance requires an explicit assignment (`skills/openwiki-maintainer/SKILL.md`).

## Major surfaces

### Policy and vocabulary

[`AGENTS.md`](../AGENTS.md) defines the shared operating floor and is mounted through Pi's global context path. Repository-local `AGENTS.md` guidance is optional additive context, not an activation marker. Triggered Skills own their detailed procedures and Actor boundaries. [`CONCEPTS.md`](../CONCEPTS.md) is canonical across qq and linked Repositories; a root `CONCEPTS.local.md` may append terms but never redefine shared vocabulary.

### Stateless capabilities

Each immediate `skills/<name>/` directory with a `SKILL.md` is a trigger-selected capability. Skills guide agent behavior but own no persistent workflow state. See the [skill catalog](skills.md).

### Knowledge stack

| Surface | Question |
|---|---|
| `CONCEPTS.md` | What do project terms mean? |
| Backlog Tasks | What does the operator intend, and where does work stand? |
| `openwiki/` | What is the landed system? |
| Backlog `research` documents | What evidence supports a decision? |
| Backlog `solutions` documents | What non-obvious reusable lesson was verified? |
| Backlog `Ideas` document | What idea should be preserved verbatim? |
| Backlog decisions | What explicit decision has been recorded? |

OpenWiki is an upstream tool, not a vendored qq subsystem. Derived knowledge never outranks source files and fresh Checks.

### Runtime and operator layer

qq's accountable runtime is exactly `0.81.1+qq.execution-profile.2`. `bin/qq-pi-runtime` builds, verifies, installs, and resolves immutable generations; `bin/pi` never falls back to stock or global Pi. `delegation/policies/execution-profiles.json` fixes provider, model, effort, and service class for all six roles, while canonical manifests define role tools and timeout. Repository settings, Pi defaults, caller arguments, and inherited environment cannot override this map (`README.md`; `bin/qq-pi-runtime`; `bin/qq-execution-profiles`).

Each Repository has one persistent Herdr **project home** bound to its sole primary `main` checkout. The accountable Pi session stays there to own alignment, Task and Change judgment, work orders, verdicts, UAT, and handoff. Change checkouts are plain linked worktrees without Herdr workspaces; bounded implementation, fresh review, research, and observation run as headless child processes through the blocking, worktree-resident `qq-delegate` engine (`CONCEPTS.md`; `skills/delegate-batch/SKILL.md`).

At ticket creation, the owner writes a complete `BRIEF.md` in a private durable run directory. `qq-delegate` confines child cache, configuration, sessions, output, and lifecycle state there. The child-authored `ENVELOPE.md` is the only result; the engine-authored `TERMINAL` v2 records exit, timeout, and artifact paths. Missing envelope or nonzero exit fails dispatch (`bin/qq-delegate`; `delegation/manifests/ENVELOPE.md`).

The other retained commands and extensions are narrow adapters:

- `qq-change` lands and retires Changes through observable merge, ancestry, Observer-package, topology, and cleanliness rails.
- `qq-board` materializes the sole primary-main Backlog Task store into an external scratch generation and never rewrites source records.
- `qq-reap` nominates stale documents and merged local debris, then applies only explicit nomination IDs after re-deriving evidence.
- `/handoff` transfers an existing aligned Change to a fresh accountable Pi tab; it is distinct from child delegation.
- `qq_pr_watch`, `operator_stage`, the Backlog guard, execution-profile binding, Architect, handoff, and session-lineage behavior live in the globally mounted `extensions/` root.
- `qq-herdr-home`, `qq-herdr-pull`, and `qq-herdr-snap` organize project-home interaction; they do not own Repository truth.

## Data and state boundaries

qq has no application database or internal service API. Durable state is distributed:

- Git objects, refs, branches, commits, and pull requests hold delivery state.
- Backlog's operator-owned store holds Task, authored-document, and decision records; the Repository's `backlog` path is a link to it.
- Delegate run directories hold work orders, child results, scratch, and terminal lifecycle evidence.
- Observer runs and the append-only Observer-dispositions document hold observation and settlement evidence.
- Herdr workspaces and named sessions hold live terminal placement, not Repository truth.
- Runtime configuration, artifacts, and credentials live outside the Repository.
- `qq-openwiki` uses invocation `HEAD` as its setup baseline, locks per Git common directory, and restores every non-`openwiki/**` path after generation (`bin/qq-openwiki`).

## Extension points

### Add or change a Skill

Keep `skills/<name>/SKILL.md` stateless and trigger-driven. Pi mounts the root, so edits are live without synchronization. Scenario-check guidance, run relevant Checks and `git diff --check`, and obtain fresh-context review for non-trivial Changes.

### Add a command, extension, or cockpit surface

Commands under `bin/` become live through the shell surface's `$QQ_HOME/bin` `PATH` entry. Source changes beneath the mounted `extensions/` root are also live; a dependency-lock change additionally requires `npm ci --ignore-scripts`. Fixed-path cockpit configuration is a day-0 link set: update bootstrap instructions and `cockpit/README.md` only when adopting a new tool or path.

The mounted `extensions/qq-backlog-guard.ts` intercepts only Pi built-in `write` and `edit` calls targeting normalized Backlog paths. Reads, Bash, ordinary paths, and Backlog CLI commands remain outside it. This is a path-only local-feedback drift-net, not a security boundary (`README.md`; `CONCEPTS.md`).

### Add knowledge

Use the owning surface rather than creating parallel truth. Search Backlog's shared index and use its CLI for `plans`, `research`, `solutions`, `Ideas`, decisions, and managed Markdown. Stable vocabulary belongs in `CONCEPTS.md`; present-system description belongs in this wiki.

### Change the runtime

Treat every Pi upgrade as an explicit qq Change: update pinned sources and hashes, rebase and review the patch, run conformance and two-build reproducibility Checks, and install only the reviewed artifact. Do not bypass `bin/pi`, the execution-profile policy, role manifests, or `qq-delegate`; moving tags, `@latest`, global Pi, and raw overrides are not authorities (`README.md`).

## Change hazards

- Historical plans can look operational while describing deleted machinery; verify current source.
- Runtime/bootstrap changes mutate user-level links, immutable generations, policy, and credentials; verify identity and refusal behavior deliberately.
- Durable run records are evidence, not workflow authority; the accountable Actor verifies envelope claims against the tree.
- Ordinary source Actors consume OpenWiki but do not maintain it; only the explicitly triggered `openwiki-maintainer` Skill owns refresh procedure.