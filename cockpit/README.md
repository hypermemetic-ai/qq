# Cockpit

`cockpit/` is the source of truth for the human-driven terminal surface. The
activation script symlinks each file into `~/.config`, so editing here or through
the live config path edits the same file. It also wires the Claude Code status
line from `bin/qq-phase render`; that reader lives beside the scripts because it
both writes and renders `.qq/state.json`.

## Files
- `yazi/yazi.toml` — pane-first file navigation; markdown opens in-pane through
  mdcat by default, with tuned Glow as the alternate opener.
- `yazi/keymap.toml` — `!` opens a shell here; `g H` jumps to `~/projects/qq`.
- `glow/glow.yml` — fixed-width, no-pager Glow defaults for pane rendering.
- `glow/tuned.json` — the hand-tuned Markdown theme used by Glow.
- `herdr/config.toml` — tokyo-night, onboarding suppressed, priority-sorted
  agent sidebar, and cockpit pane bindings: `prefix+f` runs `qqy`,
  `prefix+shift+f` runs `qqbr`.
- `shell/file-navigation.bash` — `QQ_HOME`, generic `y()`/`br()` wrappers,
  repo-focused `qqroot`/`qqy`/`qqbr`, and `qfiles`/`qtree` aliases.

## Flow
Herdr `prefix+f` spawns a pane running `qqy`; `qqy` opens yazi at the repo root;
Enter on a `.md` file renders in-pane via mdcat or Glow tuned to the pane width.
`prefix+shift+f` opens broot at the same root through `qqbr`. `prefix+F<N>`
pulls the Nth priority-sorted agent into the focused pane; `prefix+0` pulls the
agent that most needs attention.
