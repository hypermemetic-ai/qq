# Cockpit

`cockpit/` is the source of truth for the human-driven terminal surface.
Day-0 bootstrap (see the README's Install section) symlinks each config file
into `~/.config`, so editing here or through the live config path edits the
same file; the shell surface is sourced straight from this checkout.

## Files

- `ghostty/config` — the portable terminal profile: console-derived palette,
  laptop-sized IBM glyphs and margins by default, exact laptop/4K font presets,
  block cursor, and static Herdr surface normalization.
- `ghostty/shaders/column-rails.glsl` — on the exact 3840-pixel-wide reference
  surface, masks Herdr's session-only right edge while drawing no decorative
  bars; other sizes pass through unchanged and the two rejected rail placements
  remain documented as recoverable presets.
- `glow/glow.yml` — fixed-width, no-pager Glow defaults for pane rendering.
- `glow/tuned.json` — the hand-tuned Markdown theme used by Glow.
- `herdr/config.toml` — tokyo-night, onboarding suppressed, priority-sorted
  agent sidebar, sidebar `$stage` token rows for the delegate status surface
  (doc-43), direct navigation, agent-pull, and project-home snap bindings.
- `shell/file-navigation.bash` — `QQ_HOME`, `qqroot`, focused-worktree lookup
  through `qq_space_dir`, and shell directory changes through `qqcd`.
- `systemd/user/qq-openwiki-daily.{service,timer}` — repository-owned user
  units for the non-persistent 03:00 local OpenWiki assessment.

The Ghostty profile expects the locally installed `MxPlus IBM VGA 8x16` font,
with `BigBlue TerminalPlus` as its fallback. Font binaries remain external
dependencies rather than Repository-owned assets.

The default 12-point size uses MxPlus IBM VGA 8x16's native 16-pixel laptop
grid. `ctrl+shift+f12` selects the exact 24-point/32-pixel 2× 4K fullscreen
couch preset; `ctrl+shift+f11` returns to the laptop preset. The 12-unit
horizontal margin remains usable in ordinary windows at either font size.

## Flow

File browsing lives inside running Pi sessions through
`@tmustier/pi-files-widget`. For shell cwd changes, `qqcd` moves to the focused
Herdr workspace's worktree and falls back to `QQ_HOME` when no focused
worktree is available. `qqcd <pattern>` sends directories beneath `HOME` and
the unchanged query to `fzf`, then changes to the selected directory. Files
opened outside Pi follow the system's `xdg-open` MIME associations; Pi's read
tools handle in-session Markdown.

`prefix+F<N>` pulls the Nth priority-sorted agent into the focused pane;
`prefix+0` pulls the agent that most needs attention. Those operator
bindings use `qq-herdr-pull <N|next>`. `alt+o` snaps to Pi in the Repository
project home, or to focused-workspace Pi when no home runtime exists. Pressing
it again at the target bounces back.

`extensions/qq-backlog-guard.ts` loads as part of the mounted qq extension set
through the one global symlink described in the root README's Install section.
On each built-in `write` or `edit`, it discovers the current Git checkout from
Pi's working directory and blocks normalized targets inside that checkout's
`backlog/`, returning the Backlog-CLI guidance. It deliberately allows reads
and Bash, including Backlog CLI commands; it is a path-only drift-net, not a
security boundary or shell policy.

The sidebar carries the delegate status surface's ambient tier: a `$stage` row
on Space and Agent entries renders stage-boundary one-liners reported through
`herdr workspace report-metadata` and `herdr pane report-metadata`
(design: doc-43). The rows collapse when no stage is reported.

Each Repository has one persistent project home bound to its primary `main`
checkout. Its dedicated single-pane `backlog board` tab and operator-created
general tabs stay at that level. Changes live in plain linked worktrees; no
per-Change Herdr workspaces are created. Accountable agents validate the home
with `qq-herdr-home inspect --repo <root>` and dispatch delegated work into the
Change worktree while their own conversation stays in the project home.

At terminal Change disposition, operator-created work panes stay intact for
inspection, and operator focus is left untouched. `qq-herdr-home focus-board
--repo <root>` remains an operator-invocable validator, not part of the
disposition flow: it validates the persistent home and its unique dedicated
Backlog-board tab, then focuses that tab.


## OpenWiki timer

`bin/qq-openwiki-schedule install` links the two repository files into the
systemd user manager, reloads it, and enables the timer; it never copies unit
content. `inspect` reports timer/service state, and `disable` stops the timer,
unlinks both files, and reloads the manager. The timer has no randomized delay,
boot catch-up, or retry. Attempt output and failure status remain in
`journalctl --user-unit qq-openwiki-daily.service`. Activation is an explicit
post-merge owner action; source Changes and tests do not enable live units.
