# Architecture and knowledge model

## Architectural intent

qq is deliberately a thin harness. It composes upstream ownership surfaces instead of maintaining a central state machine:

- Git and GitHub own the Repository and Change lifecycle.
- Backlog.md owns durable Task intent/status plus authored documents and
  decisions.
- Agent runtimes discover the methodology and Skills natively.
- OpenWiki describes the current system.
- codebase-memory maintains a derived structural graph outside the Repository.
- herdr supplies named sessions and direct agent messaging.
- The operator owns judgment, acceptance, and merge authority.

This boundary is the result of an explicit simplification. Recent history removed custom gate, phase, wave, frontier, registry, activation, and orchestration commands. The retained repository should be evaluated as a policy/knowledge/cockpit layer, not as an incomplete workflow platform.

## Major surfaces

### Policy and vocabulary

[`qq-methodology.md`](../qq-methodology.md) defines the cross-repository operating floor: orient before acting, clarify ambiguity, prefer simple surgical changes, define observable success, use GitHub Flow, and require fresh-context review for non-trivial Changes. [`CONCEPTS.md`](../CONCEPTS.md) keeps terms stable across conversation, Tasks, source, and documentation.

Repository-local instructions live in [`AGENTS.md`](../AGENTS.md). `CLAUDE.md` is intended to expose the same instructions to Claude-compatible discovery rather than create a second policy source.

### Stateless capabilities

Each immediate `skills/<name>/` directory with a `SKILL.md` is a capability selected by trigger. Skills guide agent behavior but do not own persistent workflow state. See the [skill catalog](skills.md).

### Knowledge stack

Each surface answers a different question:

| Surface | Question |
|---|---|
| `CONCEPTS.md` | What do project terms mean? |
| Backlog Tasks | What does the operator intend, and where does work stand? |
| `openwiki/` | What is the current system? |
| codebase-memory | How does code relate structurally? |
| Backlog `research` documents | What evidence supports a decision? |
| Backlog `solutions` documents | What non-obvious reusable lesson was verified? |
| Backlog `Ideas` document | What idea should be preserved verbatim for later? |
| Backlog decisions | What explicit decision has been recorded? |

OpenWiki and codebase-memory are upstream tools, not vendored qq subsystems. Derived knowledge never outranks source files and freshly observed Checks.

### Operator layer

`cockpit/` stores the human terminal surface for herdr, yazi, broot, Glow, and shell navigation. `bin/install.sh` live-links those files, the methodology, Skills, and retained commands into user configuration. `bin/qq-herdr-pull` moves an agent pane to the operator’s current location. The WIP scripts preserve recoverable uncommitted snapshots in private Git refs.

## Data and state boundaries

qq has no application database or internal service API. Durable state is intentionally distributed:

- Git objects, refs, branches, commits, and pull requests hold delivery state.
- Backlog owns Task, authored-document, and decision records.
- `refs/wip/<branch>` stores private recovery snapshots.
- Agent runtime configuration and credentials live outside the Repository.
- OpenWiki credentials stay under `~/.openwiki/` and must never be committed.
- codebase-memory’s graph is external and derived; indexing may need refresh after material branch or uncommitted changes.

## Extension points

### Add or change a Skill

Create or edit `skills/<name>/SKILL.md`, keep it stateless and trigger-driven, validate it with Codex’s `skill-creator` validator, then rerun `bash bin/install.sh`. The installer discovers Skill directories automatically and prunes dead qq-owned Skill links.

### Add a command or cockpit surface

Commands and cockpit files are explicitly linked in `bin/install.sh`; adding a file alone does not install it. Update `cockpit/README.md` when changing the human interaction surface. Preserve the installer’s refusal rule: it must not overwrite paths it does not manage.

### Add knowledge

Use the owning surface rather than creating parallel truth. Search Backlog's
shared index first and use `backlog doc create/update` for categorized `plans`,
`research`, and `solutions` documents and the single root-level `Ideas`
document; use Backlog decisions for explicit decision records. Never edit
Backlog-managed Markdown directly. Stable vocabulary belongs in `CONCEPTS.md`;
present-system description belongs in this wiki.

### Support another runtime

Keep content runtime-neutral and expose it through that runtime’s native instruction and skill discovery. The current installer is Codex-specific (`~/.codex`), so another runtime needs its own wiring rather than a new qq-owned compatibility engine.

## Change hazards

- Historical plans can look operational but describe deleted machinery; check current source before following them.
- Installing changes user-level configuration and hooks; test ownership/refusal behavior carefully.
- Knowledge updates can drift from source. Ordinary source agents consume
  OpenWiki but do not maintain it; the narrowly triggered
  `openwiki-maintainer` Skill is the sole procedural authority.
