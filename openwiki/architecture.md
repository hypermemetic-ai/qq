# Architecture and knowledge model

## Architectural intent

qq is deliberately a thin harness. It composes upstream ownership surfaces instead of maintaining a central state machine:

- Git and GitHub own the Repository and Change lifecycle.
- Backlog.md owns durable Task intent/status plus authored documents and decisions.
- Stock Pi discovers methodology, Skills, prompts, and extensions through root mounts.
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

qq runs stock Pi `0.81.1` from the standard global npm installation. The checkout-owned `bin/pi` resolves that package with `npm root -g` and forwards the caller's arguments unchanged; it refuses if npm, the package, or `dist/cli.js` is unavailable. `delegation/policies/execution-profiles.json` maps the six roles: Orchestrator and Reviewer use `kimi-coding/k3:max`, while Architect, Implementer, Researcher, and Observer use `openai-codex/gpt-5.6-sol:xhigh`; all currently request the provider default service class. `qq-delegate` applies the selected delegated role through native Pi flags, while canonical manifests define tools and timeout. Non-default OpenAI service classes use the delegate-private `qq-service-class` extension (`README.md`; `bin/pi`; `bin/qq-delegate`; `delegation/extensions/qq-service-class.ts`).

Each Repository has one persistent Herdr **project home** bound to its sole primary `main` checkout. The accountable Pi session stays there to own alignment, Task and Change judgment, work orders, verdicts, UAT, and handoff. Change checkouts are plain linked worktrees without Herdr workspaces; bounded implementation, fresh review, research, and observation run as headless child processes through the blocking, worktree-resident `qq-delegate` engine (`CONCEPTS.md`; `skills/delegate-batch/SKILL.md`).

At ticket creation, the owner writes a complete `BRIEF.md` in a private durable run directory. `qq-delegate` confines child cache, configuration, sessions, output, and lifecycle state there. The child-authored `ENVELOPE.md` is the only result; the engine-authored `TERMINAL` v2 records exit, timeout, and artifact paths. Missing envelope or nonzero exit fails dispatch (`bin/qq-delegate`; `delegation/manifests/ENVELOPE.md`).

The other retained commands and extensions are narrow adapters:

- `qq-change` lands and retires Changes through observable merge, ancestry, Observer-package, topology, and cleanliness rails.
- `qq-board` materializes the sole primary-main Backlog Task store into an external scratch generation and never rewrites source records.
- `qq-reap` nominates stale documents and merged local debris, then applies only explicit nomination IDs after re-deriving evidence.
- `/handoff` transfers an existing aligned Change to a fresh accountable Pi tab; it is distinct from child delegation.
- `qq_pr_watch`, `operator_stage`, the Backlog guard, Architect, handoff, session-lineage behavior, operator communication moments, and delegate visibility live in the globally mounted `extensions/` root. Communication moments are inert in delegated and headless print sessions; the delegate watcher exposes active run rows to the footer and routes a newly observed completion back to its spawning pane when possible, otherwise to a Herdr notification.
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

Commands under `bin/` become live through the shell surface's `$QQ_HOME/bin` `PATH` entry. Source changes beneath the mounted `extensions/` root are also live. Fixed-path cockpit configuration is a day-0 link set: update bootstrap instructions and `cockpit/README.md` only when adopting a new tool or path.

The mounted `extensions/qq-backlog-guard.ts` intercepts only Pi built-in `write` and `edit` calls targeting normalized Backlog paths. Reads, Bash, ordinary paths, and Backlog CLI commands remain outside it. This is a path-only local-feedback drift-net, not a security boundary (`README.md`; `CONCEPTS.md`).

### Add knowledge

Use the owning surface rather than creating parallel truth. Search Backlog's shared index and use its CLI for `plans`, `research`, `solutions`, `Ideas`, decisions, and managed Markdown. Stable vocabulary belongs in `CONCEPTS.md`; present-system description belongs in this wiki.

### Change the runtime

Treat a Pi-version change as an explicit qq Change: update the pinned bootstrap and CI versions together, verify `bin/pi` against the intended global package, and run the runtime, extension-mount, and affected extension Checks. Do not bypass `bin/pi`, the execution-profile policy, role manifests, or `qq-delegate`, and do not replace the pinned version with `@latest` (`README.md`; `tests/test-qq-pi-runtime.sh`).

## Change hazards

- Historical plans can look operational while describing deleted machinery; verify current source.
- Runtime/bootstrap changes affect the global npm package, user-level links, delegated policy, and credentials; verify the resolved CLI, version pin, and refusal behavior deliberately.
- Durable run records are evidence, not workflow authority; the accountable Actor verifies envelope claims against the tree.
- Ordinary source Actors consume OpenWiki but do not maintain it; only the explicitly triggered `openwiki-maintainer` Skill owns refresh procedure.