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
- The operator owns judgment, acceptance, and merge authority for ordinary source Changes; only the OpenWiki maintainer's fully revalidated, documentation-only Change has a guarded non-force self-merge exception.

This boundary is the result of an explicit simplification. Recent history removed the former custom gate, phase, wave, frontier, registry, and orchestration machinery. The retained repository should be evaluated as a policy/knowledge/cockpit layer with a few narrow adapters—not as an incomplete workflow platform. The merge activator is one such adapter: it verifies a GitHub merge and wakes the separate OpenWiki maintainer, but does not own source delivery or merge authority.

## Major surfaces

### Policy and vocabulary

[`AGENTS.md`](../AGENTS.md) defines the shared operating floor: stay within the agreement, expose material uncertainty, keep scope surgical, use evidence, and preserve the operator's authority. It says to start from supplied assignment context and use available knowledge surfaces only to resolve what is missing; triggered Skills own their detailed procedures and actor boundaries. Linked Repositories may expose the same instructions through a root-level `AGENTS.md` symlink. [`CONCEPTS.md`](../CONCEPTS.md) keeps terms stable across conversation, Tasks, source, and documentation.

### Stateless capabilities

Each immediate `skills/<name>/` directory with a `SKILL.md` is a capability selected by trigger. Skills guide agent behavior but do not own persistent workflow state. Shared executable infrastructure instead lives under `tools/`; in particular, `tools/bpmn-pipeline/` owns the bundled planning and OpenWiki diagram runtime while `skills/bpmn-plans/` remains its stateless procedure (`bin/install.sh:124-134`; `bin/qq-openwiki-bpmn:57-62`). See the [skill catalog](skills.md).

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

`cockpit/` stores the human terminal surface for Herdr, yazi, broot, Glow, and shell navigation. `bin/install.sh` live-links cockpit files, Skills, and retained commands into user configuration, installs the BPMN pipeline dependencies, and registers the local OpenWiki activation protocol. Each Repository has one persistent Herdr **project home** bound to its sole primary `main` checkout; linked-worktree **work sessions** grouped beneath it contain Change-specific interaction. Each spawning agent retains a temporary delegate pane only through its final result and required follow-up, then closes the pane and verifies removal (`skills/agent-messaging/SKILL.md:32-35`; `skills/code-review/SKILL.md:94-99`; `skills/research/SKILL.md:22-24`). At terminal Change disposition, the accountable pane, operator-created panes and tabs, work-session workspace, and checkout remain for operator inspection and retirement (`skills/deliver-change/SKILL.md:122-132`). `bin/qq-herdr-home` validates the home boundary and its dedicated single-pane Backlog-board tab, while `bin/qq-herdr-pull` supports operator pane pulling and fail-fast adoption of a Change work session by its accountable agent (`bin/qq-herdr-home:38-140`; `bin/qq-herdr-pull:69-112`). Herdr organizes live interaction; Git worktrees remain the source of checkout identity and state.

## Data and state boundaries

qq has no application database or internal service API. Durable state is intentionally distributed:

- Git objects, refs, branches, commits, and pull requests hold delivery state.
- Backlog owns Task, authored-document, and decision records.
- Herdr workspaces and named sessions hold live terminal placement, not Repository truth.
- Agent runtime configuration and credentials live outside the Repository.
- Temporary OpenWiki instruction-file snapshots are durable external state under `${XDG_STATE_HOME:-$HOME/.local/state}/qq/openwiki/`, keyed by Git common directory so a later invocation can safely restore the recorded originating worktree after interruption (`bin/qq-openwiki:100-126`, `131-212`).
- OpenWiki credentials stay under `~/.openwiki/` and must never be committed.
- codebase-memory’s graph is external and derived; indexing may need refresh after material branch or uncommitted changes.

## Extension points

### Add or change a Skill

Create or edit `skills/<name>/SKILL.md`, keep it stateless and trigger-driven, validate it with Codex’s `skill-creator` validator, then rerun `bash bin/install.sh`. The installer discovers Skill directories automatically and synchronizes qq-owned links for both Codex and Claude Code, pruning dead links in each runtime (`bin/install.sh:43-65`, `132-134`).

### Add a command or cockpit surface

Commands and cockpit files are explicitly linked in `bin/install.sh`; adding a file alone does not install it. Update `cockpit/README.md` when changing the human interaction surface. Preserve the installer’s refusal rule: it must not overwrite paths it does not manage. OpenWiki activation also crosses browser, desktop-protocol, GitHub CLI, Herdr, and dedicated-worktree boundaries, so changes require end-to-end eligibility and deduplication tests.

### Add knowledge

Use the owning surface rather than creating parallel truth. Search Backlog's
shared index first and use `backlog doc create/update` for categorized `plans`,
`research`, and `solutions` documents and the single root-level `Ideas`
document; use Backlog decisions for explicit decision records. Never edit
Backlog-managed Markdown directly. Stable vocabulary belongs in `CONCEPTS.md`;
present-system description belongs in this wiki.

### Support another runtime

Keep content runtime-neutral and expose it through each runtime’s native instruction and skill discovery. The installer currently wires Skills into Codex (`~/.codex/skills`) and Claude Code (`~/.claude/skills`); any additional runtime needs equivalent native wiring rather than a new qq-owned compatibility engine (`bin/install.sh:132-134`).

## Change hazards

- Historical plans can look operational but describe deleted machinery; check current source before following them.
- Installing changes user-level configuration and hooks; test ownership/refusal behavior carefully.
- Knowledge updates can drift from source. Ordinary source agents consume
  OpenWiki but do not maintain it; the narrowly triggered
  `openwiki-maintainer` Skill is the sole procedural authority.
