# `@hypermemetic-ai/qq-tasks`

One repository, one plugin, one version. Loading this plugin is how a DSH
host gets a backlog. qq expects it and still runs if it is absent. The start
script already binds `qq-*` siblings; this package is not named in `bin/qq`
or `host.patch.yml`. It declares `dsh.bundle` so `dsh plugin add` activates
the layer when the tree is present.

The pile is markdown files, not a kanban and not Backlog.md. Other plugins
call this service. They do not shell out to `backlog`. Architect gets a
`rundown` talking tool only when this plugin is loaded.

## Store

Plugin-owned directory beside `DSH_HOME` (`config.storeDir` overrides), mode
`0700` on the dir, `0600` on files, atomic write. Restart-safe. Lives outside
any project's git.

Config names the default project (`config.project`, default `qq`) and the
store path. A project is a separable concern, not a git repository.

Layout: one book at the store root (issued / live / warm). Live files at
`{store}/{project}/{id}.md`. Archive under that project, named by completion
time. The book is how a number stays unique across projects.

## Spoken ids

Plugin-owned and global. One book for every project this host's tasks plugin
serves. `edit` cannot change the id or the project. Hang token, when a later
land hangs, is `tasks:<id>` (example `tasks:340`).

Frozen 99-name set, issued farthest-first among free names (not live, not
still warm); ties break at random. After archive the number is warm, then
recyclable. Overflow unlocks 1000–9999 only after the frozen set is
live-or-warm, then the next magnitude.

Optional YAML frontmatter `labels` (string list). First land does not
interpret them.

## Service

`ctx.get("qq-tasks")`:

- `create({ title, body, project?, labels? })` — bank. Mint a global number.
- `read(id)` — finds the ticket in any project.
- `list({ project? })` — live pile. Omit `project` to see every project.
- `edit(id, { title?, body?, labels? })` — cannot change id or project.
- `append(id, text)` — add to the end.
- `archive(id)` — leave the live pile. Number becomes warm.
- `rundown()` — one-shot model job on this plugin's `rundown` role.

Missing plugin: callers refuse. Empty pile on first land; T-1 through T-75
stay on the old CLI store.

## Rundown

Architect-owned talking tool, registered by `qq-workflows` when this plugin
is loaded and the chair is architect. Role `rundown` lives on this plugin's
required absolute `settingsFile` (`provider`, `model`, `effort`). Missing
path, missing file, or empty role: `rundown` refuses. Does not reuse
architect `scribe`. Does not write `execution-profiles.json`.
