# Operations

## Bootstrap the live surfaces

qq is installed by construction: Pi, Claude, and Codex each mount this checkout's `skills/` root, Codex's three role-profile links resolve into `codex-profiles/`, and `. "$HOME/projects/qq/cockpit/shell/file-navigation.bash"` prepends `$QQ_HOME/bin` to `PATH`. Adding, changing, or removing a Skill or command is therefore live without an install step (`README.md:49-93`, `137-147`).

On a new machine, follow [`README.md`](../README.md#install-qq) for the exact root mounts, Pi 0.80.10+ with native `kimi-coding/k3` max-thinking defaults, the absolute Pi Backlog-guard extension path, and the fixed yazi/Glow/Herdr configuration links. Those cockpit file links are day-0 bootstrap, not a synchronization surface. Bootstrap does not manage Repository instruction files; a linked Repository may point its own root `AGENTS.md` symlink to qq's canonical file.

## Cockpit

`cockpit/` is the source of truth for the operator terminal surface:

- yazi provides pane-first file navigation and Markdown opening;
- Glow/mdcat render Markdown in-pane;
- broot provides a tree view;
- shell helpers define `QQ_HOME`, generic navigation wrappers, and qq-focused commands;
- herdr supplies the themed, priority-sorted agent surface and pane bindings.

Typical flow: `prefix+f` and `prefix+shift+f` open fixed 74×29 session-modal `qqy`/`qqbr` popups rooted at the focused Herdr workspace's checkout, falling back to `QQ_HOME`; quitting closes the popup without reflowing the tiled layout. `prefix+F<N>` pulls the Nth agent into focus, `prefix+0` pulls the agent most needing attention, and `prefix+d` shows the current Repository's delegate-detail snapshot. `alt+up/down` moves between workspaces, `alt+left/right` moves between tabs, and `alt+o` snaps to the preferred orchestrator or bounces back. See [`cockpit/README.md`](../cockpit/README.md).

## Herdr homes and pane movement

A Repository's persistent **project home** is the Herdr workspace for its sole primary `main` checkout. Its dedicated Backlog-board tab and accountable Pi session remain there with general operator tabs. Each linked-worktree workspace grouped beneath it is a **work session**, identified by an Actor-chosen, operator-renameable recognizable UI handle matching `[A-Za-z0-9-]{1,15}` and unique among siblings. It owns one Change checkout, its root placeholder, and delegated agents; the accountable session dispatches from project home and never moves into it (`CONCEPTS.md:54-66`; `skills/deliver-change/SKILL.md:24-53`).

`qq-herdr-home inspect --repo <path>` resolves the registered `main` checkout, requires exactly one matching non-linked Herdr home, and verifies its Repository key against Git's common directory. `focus-board` adds board discovery: it requires the unique dedicated single-pane board tab, focuses it, and confirms focus without moving or closing work-session panes (`bin/qq-herdr-home`). `deliver-change` uses inspection before creating or opening a labeled work session beneath the returned home. Ending a Change never invokes `focus-board`: guarded retirement of a verified merged Change leaves operator focus untouched, while a tripped rail or non-merged disposition preserves the session for the operator (`skills/deliver-change/SKILL.md:141-180`).

The dedicated board pane runs `qq-board watch --interval 3`. Before each `backlog board` render, it derives Task status from matching `*/t-N-*` branches, worktrees, origin refs, and available pull-request state. Reconciliation writes only untracked in-flight Task records; tracked records are reported but never rewritten, preserving the primary checkout's fast-forward rail. Watch mode suppresses reconciliation failures and keeps rendering the board, so discovery failure leaves a stale-but-live view. Use `qq-board inspect reconcile --repo <path>` or `--dry-run` as the fail-closed diagnostic path; trackedness and source-discovery errors surface there (`bin/qq-board`; `tests/test-qq-board.sh`).

`qq-herdr-pull <N|next>` identifies the focused pane, selects an agent from `herdr agent list`, moves that pane into the focused tab, and closes the old pane only after a successful move. Numeric selection is 1-based. `next` prioritizes blocked, then working, then idle agents while excluding the current pane.

The command requires `jq`. qq wrappers resolve external tools consistently: an absolute executable set through `QQ_<TOOL>_BIN` (for example `QQ_HERDR_BIN`), then `PATH`, then known Linuxbrew/Homebrew directories; a fallback directory is prepended to child `PATH` so subprocess lookup remains coherent (`bin/lib/qq-bin.sh:6-65`). Operator mode runs detached, so errors are best-effort notifications and exit successfully. Use a dry run before testing layout mutation:

```bash
QQ_HERDR_PULL_DRY=1 HERDR_PANE_ID=<pane-id> qq-herdr-pull next
```

`qq-herdr-pull --workspace <workspace-id>` remains available for explicit operator-directed pane movement. It resolves the caller's live pane identity, safely no-ops if already present, otherwise accepts only the target workspace's sole idle non-agent shell, confirms Herdr reported a changed move, and only then closes the placeholder (`bin/qq-herdr-pull`). It is not part of `deliver-change`; the accountable Pi session remains in project home.

`qq-herdr-snap` is the best-effort operator helper behind `alt+o`. It prefers project-home Pi, then project-home Claude; within the focused linked-worktree session it falls back to Pi, then Claude, then the first agent in sidebar order. A second invocation on the target returns to the recorded origin pane, including across workspaces. State is keyed by target workspace under `XDG_RUNTIME_DIR` (or the temporary directory); `QQ_HERDR_SNAP_DRY=1` prints resolution without focusing. Unlike `qq-herdr-home`, snap does not require a running Backlog board (`bin/qq-herdr-snap:1-140`; `tests/test-qq-herdr-snap.sh`).

## Assigned OpenWiki maintenance

OpenWiki refresh is explicit rather than merge-triggered. An on-demand or scheduled assignment starts the dedicated maintainer in the long-lived `openwiki/update` worktree. The maintainer fetches and resets to fresh `origin/main`, runs `qq-openwiki --update`, checks the documentation diff, obtains fresh-context review, then opens or refreshes an ordinary docs-only pull request. The operator reviews and merges it; the maintainer never self-merges, publishes directly to `main`, or uses activation markers or retry protocols (`skills/openwiki-maintainer/SKILL.md:8-32`; `README.md:106-123`).

## Knowledge maintenance

OpenWiki is installed separately. qq commands resolve from the checkout whose cockpit shell surface set `QQ_HOME` and prepended `$QQ_HOME/bin`; inspect that environment and the resolved executable when behavior appears to come from the wrong checkout. The README describes upstream runtime setup.

`qq-openwiki` validates command mode, provider, runtime, and required tools, then acquires a per-Git-common-directory runtime lock. It refuses to run when `AGENTS.md`, `CLAUDE.md`, or the generated workflow deviates from `HEAD`, including untracked or ignored setup. It shadows instruction symlinks with local regular files during generation; cleanup removes generated setup and restores every path outside `openwiki/**` from the invocation's Git baseline. `--update` requires a clean dedicated `openwiki/update` branch exactly equal to `origin/main`; `--correct` requires a fully staged baseline confined to `openwiki/` (`bin/qq-openwiki`; `tests/test-qq-openwiki.sh`).

Ordinary source agents only consume the wiki, and the `openwiki-maintainer` Skill is the sole maintenance procedure.

## Local documentation ownership

Ordinary source agents neither assess nor generate OpenWiki changes. The
narrowly triggered `openwiki-maintainer` Skill is the sole procedural authority.
