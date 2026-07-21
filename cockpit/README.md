# Cockpit

`cockpit/` is the source of truth for the human-driven terminal surface.
Day-0 bootstrap (see the README's Install section) symlinks each config file
into `~/.config`, so editing here or through the live config path edits the
same file; the shell surface is sourced straight from this checkout.

## Files

- `pi/qq-backlog-guard.ts` — Pi's path-only managed-Backlog drift-net for
  built-in `write` and `edit` calls.
- `glow/glow.yml` — fixed-width, no-pager Glow defaults for pane rendering.
- `glow/tuned.json` — the hand-tuned Markdown theme used by Glow.
- `herdr/config.toml` — tokyo-night, onboarding suppressed, priority-sorted
  agent sidebar, sidebar `$stage` token rows for the delegate status surface
  (doc-43), direct navigation, agent-pull, and project-home snap bindings.
- `shell/file-navigation.bash` — `QQ_HOME`, `qqroot`, focused-worktree lookup
  through `qq_space_dir`, and shell directory changes through `qqcd`.

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

Load `pi/qq-backlog-guard.ts` from Pi's global settings with its absolute
checkout path. On each built-in `write` or `edit`, it discovers the current
Git checkout from Pi's working directory and blocks normalized targets inside
that checkout's `backlog/`, returning the Backlog-CLI guidance. It deliberately
allows reads and Bash, including Backlog CLI commands; it is a path-only
drift-net, not a security boundary or shell policy.

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
`qq-herdr-pull --workspace <workspace-id>` remains an operator-invocable mover
for any workspaces that still exist; its binary is unchanged, and it is not
part of the delivery flow.

At terminal Change disposition, operator-created work panes stay intact for
inspection, and operator focus is left untouched. `qq-herdr-home focus-board
--repo <root>` remains an operator-invocable validator, not part of the
disposition flow: it validates the persistent home and its unique dedicated
Backlog-board tab, then focuses that tab.
