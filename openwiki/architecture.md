# Architecture and knowledge model

## Architectural intent

qq is deliberately a thin harness. It composes upstream ownership surfaces instead of maintaining a central state machine:

- Git and GitHub own the Repository and Change lifecycle.
- Backlog.md owns durable Task intent/status plus authored documents and
  decisions.
- Agent runtimes discover the methodology and Skills natively.
- OpenWiki describes the current system.
- herdr supplies named sessions and direct agent messaging.
- The operator owns judgment, acceptance, and merge authority, including for OpenWiki documentation Changes.

This boundary is the result of an explicit simplification. Recent history removed the former custom gate, phase, wave, frontier, registry, activation, and orchestration machinery. The retained repository should be evaluated as a policy/knowledge/cockpit layer with a few narrow adapters—not as an incomplete workflow platform. OpenWiki maintenance begins only from an explicit on-demand or scheduled assignment and produces an ordinary operator-merged documentation pull request (`skills/openwiki-maintainer/SKILL.md:8-32`).

## Major surfaces

### Policy and vocabulary

[`AGENTS.md`](../AGENTS.md) defines the shared operating floor: stay within the agreement, expose material uncertainty, keep scope surgical, use evidence, and preserve the operator's authority. It says to start from supplied assignment context and use available knowledge surfaces only to resolve what is missing; triggered Skills own their detailed procedures and Actor boundaries. Linked Repositories may expose the same instructions through a root-level `AGENTS.md` symlink. [`CONCEPTS.md`](../CONCEPTS.md) is the canonical vocabulary across qq and linked Repositories; Repository-specific terms may be appended in a root `CONCEPTS.local.md` but must not redefine shared terms.

### Stateless capabilities

Each immediate `skills/<name>/` directory with a `SKILL.md` is a capability selected by trigger. Skills guide agent behavior but do not own persistent workflow state. See the [skill catalog](skills.md).

### Knowledge stack

Each surface answers a different question:

| Surface | Question |
|---|---|
| `CONCEPTS.md` | What do project terms mean? |
| Backlog Tasks | What does the operator intend, and where does work stand? |
| `openwiki/` | What is the current system? |
| Backlog `research` documents | What evidence supports a decision? |
| Backlog `solutions` documents | What non-obvious reusable lesson was verified? |
| Backlog `Ideas` document | What idea should be preserved verbatim for later? |
| Backlog decisions | What explicit decision has been recorded? |

OpenWiki is an upstream tool, not a vendored qq subsystem. Derived knowledge never outranks source files and freshly observed Checks.

### Operator layer

`cockpit/` stores the human terminal surface for Herdr, yazi, broot, Glow, Pi, and shell navigation. Installation is by construction: runtimes mount the `skills/` root, Codex profiles resolve through fixed symlinks, and sourcing `cockpit/shell/file-navigation.bash` puts this checkout's `bin/` on `PATH`; fixed-path cockpit files are linked once at machine bootstrap (`README.md:49-167`). Each Repository has one persistent Herdr **project home** bound to its sole primary `main` checkout. Its accountable Pi session stays there to own alignment, Task and Change judgment, work orders, verdicts, UAT, and handoff; bounded implementation, fresh review, and research run Codex-first through `qq-dispatch` in linked-worktree **work sessions**. Claude remains a rollback runtime (`README.md:56-135`; `CONCEPTS.md:54-66`).

The retained commands are narrow stateless adapters rather than a workflow service. `qq-change` lands and retires Changes through observable Git, GitHub, and Herdr rails; `qq-dispatch` applies role profiles, timeout and artifact contracts; `qq-status` publishes best-effort delegate glass; `qq-pr-watch` emits one terminal disposition wake; and `qq-board` reconciles untracked Task records from branch/worktree/PR evidence before rendering the board (`bin/qq-change`; `bin/qq-dispatch`; `bin/qq-status`; `bin/qq-pr-watch`; `bin/qq-board`). `qq-herdr-home inspect` validates only Repository/main/home identity, while `focus-board` additionally requires and focuses the unique single-pane board tab. `qq-herdr-pull` remains an operator pane-movement tool; the accountable session is never adopted into a work session. `qq-herdr-snap` provides best-effort orchestrator/bounce navigation. Herdr organizes live interaction; Git worktrees remain the source of checkout identity and state.

## Data and state boundaries

qq has no application database or internal service API. Durable state is intentionally distributed:

- Git objects, refs, branches, commits, and pull requests hold delivery state.
- Backlog owns Task, authored-document, and decision records.
- Herdr workspaces and named sessions hold live terminal placement, not Repository truth.
- Agent runtime configuration and credentials live outside the Repository.
- `qq-openwiki` uses the invocation's Git `HEAD` as its setup baseline. A per-common-directory runtime lock prevents concurrent writers; setup paths must match `HEAD`, including ignored files, and cleanup restores everything outside `openwiki/**` from that baseline (`bin/qq-openwiki:37-107`).
- OpenWiki credentials stay under `~/.openwiki/` and must never be committed.

## Extension points

### Add or change a Skill

Create or edit `skills/<name>/SKILL.md`, keep it stateless and trigger-driven, and validate it with Codex's `skill-creator` validator. Because Pi, Claude, and Codex mount the `skills/` root, additions, edits, and removals are live without a synchronization step (`README.md:51-80`; `CONCEPTS.md:107-114`).

### Add a command or cockpit surface

Commands under `bin/` become live through the shell surface's `$QQ_HOME/bin` `PATH` entry. Fixed-path cockpit configuration is a day-0 link set: update the bootstrap instructions and `cockpit/README.md` only when adopting a new tool or path, not for ordinary content changes (`README.md:142-163`).

Claude's `.claude/settings.json` uses native deny patterns for `gh pr merge` and invokes `bin/qq-claude-backlog-hook` only for structured write tools targeting this checkout's `backlog/`; it deliberately does not parse Bash. Pi's `cockpit/pi/qq-backlog-guard.ts` likewise intercepts only built-in `write` and `edit` targets after path normalization. Both are local-feedback drift-nets with declared limits, not security boundaries (`.claude/settings.json`; `bin/qq-claude-backlog-hook`; `cockpit/pi/qq-backlog-guard.ts`; `CONCEPTS.md:94-98`).

### Add knowledge

Use the owning surface rather than creating parallel truth. Search Backlog's
shared index first and use `backlog doc create/update` for categorized `plans`,
`research`, and `solutions` documents and the single root-level `Ideas`
document; use Backlog decisions for explicit decision records. Never edit
Backlog-managed Markdown directly. Stable vocabulary belongs in `CONCEPTS.md`;
present-system description belongs in this wiki.

### Support another runtime

Keep content runtime-neutral and expose it through each runtime's native instruction and Skill discovery. Pi, Claude, and Codex each mount the same `skills/` root; a new runtime needs equivalent native root mounting rather than per-Skill mirroring or a qq-owned compatibility engine. Role-specific execution controls belong in mounted runtime profiles and narrow dispatch adapters, not duplicated Skill trees.

## Change hazards

- Historical plans can look operational but describe deleted machinery; check current source before following them.
- Machine bootstrap changes user-level links and runtime configuration; test path identity, mounted-profile refusal, and runtime-specific drift-net behavior carefully.
- Knowledge updates can drift from source. Ordinary source agents consume
  OpenWiki but do not maintain it; the narrowly triggered
  `openwiki-maintainer` Skill is the sole procedural authority.
