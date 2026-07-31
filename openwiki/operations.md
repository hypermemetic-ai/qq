# Operations

## Bootstrap the live surfaces

qq is installed by construction around the exact patched Pi identity `0.81.1+qq.execution-profile.2`. `bin/qq-pi-runtime` fetches, builds, inspects, installs, verifies, and atomically rolls between immutable generations; `bin/pi` never falls back to stock or global Pi. Pi mounts this checkout's global context, Skill, prompt, and extension roots, while sourcing `cockpit/shell/file-navigation.bash` prepends `$QQ_HOME/bin` to `PATH`. Install and verify the six-role policy with `bin/qq-execution-profiles`; ordinary source changes beneath mounted roots need no reinstall.

Follow [`README.md`](../README.md#install-qq) for exact artifact construction, provider login, role-policy installation, extension dependencies, root links, and fixed Ghostty/Glow/Herdr links. Canonical guidance is mounted at `~/.pi/agent/AGENTS.md`; Repository-local guidance is optional additive context. Credentials and runtime artifacts remain outside the Repository and must never be reported.

## Cockpit

`cockpit/` is the source of truth for the operator terminal surface:

- Ghostty supplies the terminal profile;
- Glow renders Markdown;
- file browsing lives inside Pi through `@tmustier/pi-files-widget`, while external opening follows `xdg-open`;
- shell helpers define `QQ_HOME`, put qq commands on `PATH`, and provide `qqcd` for focused-worktree or fuzzy directory changes;
- Herdr supplies persistent project homes, the agent surface, and pane bindings;
- systemd user units provide the optional scheduled OpenWiki service.

`prefix+F<N>` pulls the Nth agent into focus, `prefix+0` pulls the agent most needing attention, and `alt+o` snaps to project-home Pi or bounces back. `alt+up/down` moves between workspaces and `alt+left/right` moves between tabs. See [`cockpit/README.md`](../cockpit/README.md).

## Herdr project homes and pane movement

A Repository's persistent **project home** is bound to its sole primary `main` checkout. Its dedicated Backlog-board tab, accountable Pi session, Architect tab, and general operator tabs remain there. Change checkouts are plain linked worktrees with no Herdr workspace; the accountable session dispatches from project home, and delegates run as headless child processes in assigned worktrees (`CONCEPTS.md`; `skills/deliver-change/SKILL.md`).

`qq-herdr-home inspect --repo <path>` requires exactly one matching non-linked project home and verifies its Repository key against Git's common directory. `focus-board` additionally requires and focuses the unique dedicated single-pane board; `focus-architect` focuses the Architect tab. Change delivery validates the home but never creates a per-Change workspace (`bin/qq-herdr-home`).

The board pane runs `qq-board watch --interval 3`. `qq-board` reads the sole primary-main Backlog Task store, materializes it into an external scratch generation, and renders only that single-home view. It never derives source Task state from Change branches or rewrites source records. Reconciliation prunes obsolete board scratch safely (`bin/qq-board`; `tests/test-qq-board.sh`).

`qq-herdr-pull <N|next>` selects an agent from the live Herdr list, moves that pane into the focused tab, and closes the old pane only after a successful move. Numeric selection is one-based; `next` prioritizes blocked, then working, then idle while excluding the current pane. Use dry run before testing live layout mutation:

```bash
QQ_HERDR_PULL_DRY=1 HERDR_PANE_ID=<pane-id> qq-herdr-pull next
```

`qq-herdr-snap`, behind `alt+o`, prefers Pi in the Repository project home and otherwise Pi in the focused workspace; a second invocation on the target returns to the recorded origin. `QQ_HERDR_SNAP_DRY=1` prints resolution without focusing (`bin/qq-herdr-pull`; `bin/qq-herdr-snap`).

qq wrappers resolve external tools consistently: absolute `QQ_<TOOL>_BIN`, then `PATH`, then known package-manager paths. A selected fallback directory is prepended to child `PATH` so subprocess lookup remains coherent (`bin/lib/qq-bin.sh`).

## Assigned OpenWiki maintenance

OpenWiki refresh is explicit rather than merge-triggered. An assigned maintainer resets the long-lived `openwiki/update` worktree to fresh `origin/main`, runs `qq-openwiki --update`, checks the docs-only diff, obtains fresh-context review, and opens or refreshes the pull request. The operator merges on-demand refreshes.

The optional systemd user timer runs daily at 03:00 local with `Persistent=false`, no retry, and a six-hour timeout. A no-change run writes a private completion receipt and opens no PR. A changed scheduled run must contain one generated `openwiki/**` commit, pass deterministic Checks and fresh review, and reach exact-head `shell-tests`. Only then may the service marker invoke `qq-openwiki-merge`, which revalidates the fixed Repository/branch/PR, generated paths, Checks, review threads, mergeability, and `qqp-bot` identity. Install, inspect, or disable it with:

```bash
bin/qq-openwiki-schedule install
bin/qq-openwiki-schedule inspect
bin/qq-openwiki-schedule disable
```

No mode publishes directly to `main` or enables native auto-merge (`README.md`; `skills/openwiki-maintainer/SKILL.md`; `bin/qq-openwiki-merge`).

## Knowledge maintenance

OpenWiki is installed separately. qq commands resolve from the checkout whose shell surface set `QQ_HOME`; inspect that environment and the resolved executable when behavior appears to come from the wrong checkout.

`qq-openwiki` validates mode, provider, runtime, and tools, then acquires a per-Git-common-directory lock. It guards landed `AGENTS.md` and `.github/workflows/openwiki-update.yml` state, shadows an `AGENTS.md` symlink with a local regular file during generation, and restores every path outside `openwiki/**` to invocation `HEAD`. `--update` requires a clean dedicated `openwiki/update` branch exactly equal to `origin/main`; `--correct` requires a fully staged baseline confined to `openwiki/` (`bin/qq-openwiki`; `tests/test-qq-openwiki.sh`).

## Weekly reaping

`qq-reap scan` nominates stale Backlog documents plus merged local branches and clean merged worktrees, then writes a dated report even when empty. Review it and run `qq-reap apply <id>…` with only explicitly authorized nomination IDs; omitted IDs are vetoed. Apply re-derives evidence before mutation, so stale nominations refuse (`README.md`; `bin/qq-reap`).

## Local documentation ownership

Ordinary source Actors neither assess nor generate OpenWiki changes. The narrowly triggered `openwiki-maintainer` Skill is the sole procedural authority.