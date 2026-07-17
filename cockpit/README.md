# Cockpit

`cockpit/` is the source of truth for the human-driven terminal surface.
`bin/install.sh` symlinks each file into `~/.config`, so editing here or through
the live config path edits the same file.

## Files
- `yazi/yazi.toml` — pane-first file navigation; markdown opens in-pane through
  mdcat by default, with tuned Glow as the alternate opener.
- `yazi/keymap.toml` — `Enter` enters folders or opens files, `!` opens a shell
  here, and `g H` jumps to `~/projects/qq`.
- `glow/glow.yml` — fixed-width, no-pager Glow defaults for pane rendering.
- `glow/tuned.json` — the hand-tuned Markdown theme used by Glow.
- `herdr/config.toml` — tokyo-night, onboarding suppressed, priority-sorted
  agent sidebar, sidebar `$stage` token rows for the delegate status surface
  (doc-43), and cockpit popup bindings: `prefix+f` runs `qqy`,
  `prefix+shift+f` runs `qqbr`.
- `shell/file-navigation.bash` — `QQ_HOME`, generic `y()`/`br()` wrappers,
  `qqroot` targeting `QQ_HOME`, space-aware `qqy`/`qqbr`, and `qfiles`/`qtree`
  aliases.

## Flow
Herdr `prefix+f` opens a session-modal popup running `qqy`; `qqy` opens yazi at
the focused space's project folder — the focused Herdr workspace's worktree
checkout. Enter descends into a folder or renders a `.md` file through mdcat or
Glow. `prefix+shift+f` opens broot there through `qqbr`. Both fall back to
`QQ_HOME` when the focused space has no worktree or Herdr is unavailable.
Quitting the browser closes the popup and restores the untouched tiled
layout; yazi's `!` opens a shell in place when one is wanted. The popups use
a fixed 74x29 cell size (operator-tuned) with a matching `stty` preamble
because herdr 0.7.4 draws the popup frame at the configured size but never
sets the popup PTY winsize, and frames wider than the tiled panel clamp.
`prefix+F<N>` pulls the Nth priority-sorted agent into the focused pane;
`prefix+0` pulls the agent that most needs attention. Those operator
bindings use `qq-herdr-pull <N|next>`.

The sidebar carries the delegate status surface's ambient tier: a `$stage` row
on Space and Agent entries renders stage-boundary one-liners reported through
`herdr workspace report-metadata` and `herdr pane report-metadata`
(design: doc-43). The rows collapse when no stage is reported.

Each Repository has one persistent project home bound to its primary `main`
checkout. A dedicated single-pane `backlog board` tab and any operator-created
general tabs stay at that level. Herdr groups each linked-worktree workspace
beneath that home as one work session. Each has a unique, operator-agreed
change label matching `[A-Za-z0-9-]{1,15}`; the label is a recognizable UI
handle, not a branch name or a claim that Tasks and Changes are one-to-one.
Accountable agents validate the home with `qq-herdr-home inspect --repo
<root>`, create or open the worktree from that home workspace with that label,
then use `qq-herdr-pull --workspace <workspace-id>` to move the current
conversation into the work session before Repository mutation. That mode fails
loudly unless the target contains exactly one idle shell placeholder.

At terminal Change disposition, the accountable and operator-created work panes
stay intact for inspection and explicit operator retirement, and operator focus
is left untouched. `qq-herdr-home focus-board --repo <root>` is an
operator-invocable validator, not part of the disposition flow: it validates
the persistent home and its unique dedicated Backlog-board tab, then focuses
that tab without moving or closing the work session.
