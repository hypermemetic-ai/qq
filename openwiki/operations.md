# Operations

## Install the live surfaces

From the Repository root:

```bash
bash bin/install.sh
```

The installer resolves the checkout from its own location, installs the locked BPMN pipeline dependencies, and live-links:

- each `skills/*` directory containing `SKILL.md` to both `~/.codex/skills/` and `~/.claude/skills/`;
- yazi, Glow, Herdr, and shell cockpit files to `~/.config/`;
- `qq-herdr-home`, `qq-herdr-pull`, `qq-openwiki`, `qq-openwiki-bpmn`, and `qq-openwiki-activate` to `~/.local/bin/`;
- the OpenWiki merge userscript into the qq data directory.

It also installs a managed desktop entry and registers `qq-openwiki://` as a local protocol handler. The installer prunes dead links into this checkout and refuses to replace unmanaged paths or desktop entries (`bin/install.sh:43-65`, `85-151`). It does not manage repository instruction files; linked Repositories point their own root `AGENTS.md` symlink to qq's canonical `AGENTS.md`.

## Cockpit

`cockpit/` is the source of truth for the operator terminal surface:

- yazi provides pane-first file navigation and Markdown opening;
- Glow/mdcat render Markdown in-pane;
- broot provides a tree view;
- shell helpers define `QQ_HOME`, generic navigation wrappers, and qq-focused commands;
- herdr supplies the themed, priority-sorted agent surface and pane bindings.

Typical flow: `prefix+f` launches `qqy` at the Repository root, `prefix+shift+f` launches `qqbr`, `prefix+F<N>` pulls the Nth agent into focus, and `prefix+0` pulls the agent most needing attention. See [`cockpit/README.md`](../cockpit/README.md).

## Herdr homes and pane movement

A Repository's persistent **project home** is the Herdr workspace for its sole primary `main` checkout. Its dedicated Backlog-board tab must contain exactly one board pane; general operator tabs also remain at home. Each linked-worktree workspace grouped beneath it is a **work session**, identified by a unique operator-agreed label matching `[A-Za-z0-9-]{1,15}` and containing all interaction for that Change (`CONCEPTS.md:31-39`; `cockpit/README.md:28-44`).

`qq-herdr-home inspect --repo <path>` resolves the registered `main` checkout, requires exactly one matching non-linked Herdr home, verifies its repository key against Git's common directory, and finds exactly one dedicated single-pane Backlog board. `focus-board` repeats those checks, focuses that tab, and confirms focus without moving or closing any work-session pane (`bin/qq-herdr-home:38-140`). `deliver-change` uses inspection before creating or opening a labeled work session beneath the returned home, and uses board focus at terminal disposition while leaving the session intact for explicit operator retirement.

`qq-herdr-pull <N|next>` identifies the focused pane, selects an agent from `herdr agent list`, moves that pane into the focused tab, and closes the old pane only after a successful move. Numeric selection is 1-based. `next` prioritizes blocked, then working, then idle agents while excluding the current pane.

The command requires `jq`. qq wrappers resolve external tools consistently: an absolute executable set through `QQ_<TOOL>_BIN` (for example `QQ_HERDR_BIN`), then `PATH`, then known Linuxbrew/Homebrew directories; a fallback directory is prepended to child `PATH` so subprocess lookup remains coherent (`bin/lib/qq-bin.sh:6-65`). Operator mode runs detached, so errors are best-effort notifications and exit successfully. Use a dry run before testing layout mutation:

```bash
QQ_HERDR_PULL_DRY=1 HERDR_PANE_ID=<pane-id> qq-herdr-pull next
```

`qq-herdr-pull --workspace <workspace-id>` is the fail-fast agent mode used by `deliver-change`. It resolves the caller's live pane identity, safely no-ops if already present, otherwise accepts only the target workspace's sole idle non-agent shell, moves the accountable agent, confirms Herdr reported a changed move, and only then closes the placeholder (`bin/qq-herdr-pull:69-112`, `175-205`). Stop before Repository mutation if adoption fails.

## Merge-triggered OpenWiki maintenance

Install the Tampermonkey userscript linked from the README and create one long-lived `openwiki/update` worktree per linked Repository. On the final GitHub merge confirmation, the userscript waits briefly, then sends the canonical PR URL to the local protocol handler (`browser/openwiki-merge-activator.user.js:16-50`).

The installed `qq-openwiki-activate` command links to the indexable Python implementation `bin/qq-openwiki-activate.py`. It finds an unambiguous checkout under `QQ_PROJECT_ROOTS`, requires its root `AGENTS.md` to resolve to qq's canonical instructions, and polls GitHub for a completed merge. It dispatches only operator-authored merges into `main`, ignores `openwiki/update` merges, and records each merge SHA before launching or waking the named maintainer session. For a new maintainer, it reuses the opened worktree workspace's sole idle, unassigned root pane, starts Codex there, verifies the agent stayed in that pane and workspace, and then assigns and verifies the stable Repository-specific name; it refuses a busy or ambiguous placeholder rather than creating a second pane. Every `ActivationError` reaching `main` gets the same best-effort Herdr notification. Errors before `dispatch` writes a marker leave a missing marker absent or a pre-existing explicit `failed` marker unchanged, so activation remains retryable without a rewrite. Only an error caught after `marker_written` becomes true rewrites the `dispatching` marker to explicit `failed`; that state is also retryable. Every other existing non-failed, corrupt, or unreadable marker remains deduplicated (`bin/install.sh:145-150`; `bin/qq-openwiki-activate.py:382-388`, `391-463`, `479-533`; `tests/test-qq-openwiki-activate.sh:211-219`, `241-259`).

## Knowledge maintenance

OpenWiki and codebase-memory are installed separately. `bash bin/install.sh` links qq's guarded wrappers into `~/.local/bin`; these live links target whichever checkout ran that installer, not necessarily the primary checkout. Commands invoked elsewhere still execute from that target and may materialize ignored dependencies there. Diagnose surprises by resolving the actual symlink target and writer; in canonical delivery, report a failed or changed primary-checkout gate and stop unless the operator authorizes remediation (`bin/install.sh:5`, `145-150`; `skills/deliver-change/SKILL.md:93-119`; `backlog/docs/solutions/doc-37 - Installed-commands-act-on-the-primary-checkout-and-race-post-merge-syncs.md:17-44`). The README describes the upstream runtime setup.

`qq-openwiki` first validates its command mode, provider, OpenWiki runtime, BPMN publisher, Node executable, and required external tools. After resolving and locking the Repository, it recovers any stale instruction-file snapshot before entering the mode-specific branch, cleanliness, staged-boundary, and `origin/main` gates. A caller from another worktree can therefore restore the recorded originating worktree and then fail its own branch gate. Before shadowing root `AGENTS.md` and `CLAUDE.md`, the wrapper stores them and the originating worktree root under `${XDG_STATE_HOME:-$HOME/.local/state}/qq/openwiki/<repository-key>`. Normal cleanup restores them; recovery refuses malformed, symlinked, unavailable, changed-worktree, or foreign-Repository state rather than restoring ambiguously. `--update` ultimately requires a clean dedicated branch exactly equal to `origin/main`; `--correct` requires a fully staged baseline confined to `openwiki/` (`bin/qq-openwiki:14-61`, `87-126`, `131-235`; `tests/test-qq-openwiki.sh:231-270`, `285-307`).

The generator may add evidence-backed process specs under `openwiki/processes/`. `qq-openwiki-bpmn` publishes only the semantic BPMN and attributed PNG after path/evidence validation, lint/layout, evidence round-trip, and deterministic repeat generation; `--check` verifies retained artifacts without replacing them. Ordinary source agents only consume the wiki, and the `openwiki-maintainer` Skill is the sole maintenance procedure.

For codebase-memory 0.9+:

```bash
codebase-memory-mcp update
codebase-memory-mcp config set auto_index true
codebase-memory-mcp config set auto_watch true
```

Confirm graph readiness with its project/status tools and reindex after material branch or uncommitted changes. `detect_changes` analyzes impact; it does not prove freshness.

## Local documentation ownership

Ordinary source agents neither assess nor generate OpenWiki changes. The
narrowly triggered `openwiki-maintainer` Skill is the sole procedural authority.
