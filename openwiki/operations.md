# Operations

## Install the live surfaces

From the Repository root:

```bash
bash bin/install.sh
```

The installer resolves the checkout from its own location and live-links:

- `qq-methodology.md` to `~/.codex/AGENTS.md`;
- each `skills/*` directory containing `SKILL.md` to `~/.codex/skills/`;
- yazi, Glow, herdr, and shell cockpit files to `~/.config/`;
- `qq-herdr-pull`, `qq-openwiki`, and `qq-wip` to `~/.local/bin/`;
- `qq-wip-snapshot.sh` to `~/.codex/hooks/`.

It also merges a Stop hook into `~/.codex/hooks.json` atomically, preserving file mode. It refuses malformed/symlinked hook configuration, duplicate or ambiguous qq snapshot hooks, unmanaged symlinks, and existing unmanaged paths. It prunes dead links that point into this checkout’s removed Skills or commands.

In a new Codex session, run `/hooks` and explicitly trust the WIP hook. Installation alone does not activate it. Verify the global methodology target with:

```bash
readlink -f ~/.codex/AGENTS.md
```

## Cockpit

`cockpit/` is the source of truth for the operator terminal surface:

- yazi provides pane-first file navigation and Markdown opening;
- Glow/mdcat render Markdown in-pane;
- broot provides a tree view;
- shell helpers define `QQ_HOME`, generic navigation wrappers, and qq-focused commands;
- herdr supplies the themed, priority-sorted agent surface and pane bindings.

Typical flow: `prefix+f` launches `qqy` at the Repository root, `prefix+shift+f` launches `qqbr`, `prefix+F<N>` pulls the Nth agent into focus, and `prefix+0` pulls the agent most needing attention. See [`cockpit/README.md`](../cockpit/README.md).

## Herdr pane pulling

`qq-herdr-pull <N|next>` identifies the focused pane, selects an agent from `herdr agent list`, moves that pane into the focused tab, and closes the old pane only after a successful move. Numeric selection is 1-based. `next` prioritizes blocked, then working, then idle agents while excluding the current pane.

The command requires `jq` and resolves herdr from `HERDR_BIN_PATH`, `PATH`, or a known Homebrew path. Because it runs detached, errors are best-effort herdr notifications and exit successfully. Use a dry run before testing layout mutation:

```bash
QQ_HERDR_PULL_DRY=1 HERDR_PANE_ID=<pane-id> qq-herdr-pull next
```

## WIP snapshots and recovery

The trusted Stop hook runs `qq-wip-snapshot.sh`. On a dirty Git worktree it builds a tree in a temporary index from tracked and untracked non-ignored files, then records a commit at `refs/wip/<branch>`. It never changes HEAD, the real index, or working files. Duplicate trees are skipped; compare-and-swap plus one retry protects ref updates from races. Collection failures fail open so a Stop event is not blocked.

Recovery commands:

```bash
qq-wip list
qq-wip diff
qq-wip branch <recovery-branch>
```

Recovery is non-destructive: `branch` materializes the latest snapshot as a new branch for inspection or selective copying.

Watch-outs:

- same-named branches across worktrees share a WIP ref;
- detached worktrees share `refs/wip/detached`;
- every unignored file enters the snapshot tree, so sensitive local files must be ignored;
- fail-open behavior means snapshot failures may be quiet.

## Knowledge maintenance

OpenWiki and codebase-memory are installed separately. `bash bin/install.sh`
links the Repository's `bin/qq-openwiki` wrapper into `~/.local/bin`. The README
describes operator runtime setup; ordinary source agents only consume the wiki,
and the `openwiki-maintainer` Skill is the sole maintenance procedure.

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
