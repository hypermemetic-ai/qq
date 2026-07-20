---
id: decision-7
title: Full yazi cockpit retirement with named replacements (T-111)
date: '2026-07-20 19:05'
status: accepted
---
## Context

Operator preference (T-107, 2026-07-19): files-widget over yazi as the
browsing surface. Operator standing direction (2026-07-19): "legacy stuff
needs to go; this isn't a museum" — target FULL retirement, solve the
parent-shell-cwd and focused-worktree problems properly or accept their
loss with a named replacement; demotion/keep-yazi is not the default.
Tension recorded on the ticket: yazi/qqy/qqbr encode parent-shell cwd
changes, Broot eval, focused-herdr-worktree targeting, MIME openers, and
the prefix+f popups carry a doc-60 KEEP verdict.

## Decision

Retire the yazi cockpit surface fully. Delete `cockpit/yazi/`; remove `y`,
`br`, `qqy`, `qqbr`, `qfiles`, `qtree` from
`cockpit/shell/file-navigation.bash`; drop the `prefix+f` and
`prefix+shift+f` popup bindings from `cockpit/herdr/config.toml`; update
`cockpit/README.md`. Approved by the operator via the T-111 alignment brief
(asked-and-answered alignment exchange, 2026-07-20 project-home session).

Named replacements and accepted losses:

1. **Parent-shell cwd** — browse-then-cd interactive flow accepted as a
   loss (files-widget cannot change a parent shell's cwd). Keep the
   browser-free helpers `qqroot` and `qq_space_dir`; add `qqcd` (cd to the
   focused Herdr worktree; fzf picker for arbitrary destinations — fff/fzf
   already installed). `file-navigation.bash` shrinks ~102 → ~30 lines.
2. **prefix+f / prefix+shift+f popups** — deleted; browsing moves inside
   running pi sessions via files-widget. doc-60's KEEP verdict on these
   popups is explicitly superseded (considered-and-rejected, recorded
   here).
3. **MIME openers / in-pane Glow markdown** — accepted loss; xdg-open
   system defaults and pi's read tools are the named replacements.

## Consequences

- Enactment rides its own reviewed Change under T-111 (AC#1 met by this
  record).
- doc-60's prefix+f KEEP verdict stands superseded only for the popup
  surface; its other verdicts are untouched.
- The files-widget remains the sole qq-blessed browsing surface.
