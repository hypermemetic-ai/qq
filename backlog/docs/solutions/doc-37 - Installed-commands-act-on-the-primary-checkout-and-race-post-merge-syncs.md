---
id: doc-37
title: Installed commands act on the primary checkout and race post-merge syncs
type: guide
created_date: '2026-07-14 04:45'
updated_date: '2026-07-14 04:45'
tags:
  - solution
  - concurrency
  - openwiki
  - install
---
# Installed commands act on the primary checkout and race post-merge syncs

## Symptom

During a gated post-merge synchronization of the primary main checkout, a
fresh ignored artifact tree appeared at a path that was prechecked absent
seconds earlier, while no cooperating Actor was building anything. The new
tree had mode 700 directories.

## Root cause

qq's installed commands are `~/.local/bin` symlinks into the primary checkout,
and the scripts self-resolve with `readlink -f`. Any Actor invoking an
installed qq command from anywhere — notably the OpenWiki maintainer, which
merge activation starts automatically and which works in its own worktree —
therefore executes against the primary checkout and can materialize ignored
artifacts inside it. Because merges both trigger the maintainer and demand a
post-merge sync, this concurrency reliably coincides with synchronization.
Mode-700 directories are the fingerprint of qq-openwiki's `umask 077`
environment.

## Resolution

Treat the primary checkout as shared even under an exclusive-use hold:
holds bind cooperating delivery Actors, not merge-activated maintainers.

- Precheck mutation targets immediately before acting and stop on surprise
  rather than cleaning.
- Identify an unexpected writer before disposing: `herdr agent list` for live
  maintainers, plus mode/umask and mtime fingerprints on the artifact.
- Ignored-artifact materialization by the maintainer is benign; leave it in
  place and route displaced artifacts per the stranded-artifact solution.

## Verification

PR #69 sync on 2026-07-14: a precheck saw the new pipeline dependency path
absent; a 6063-file mode-700 tree existed there moments later on the same
device (so not a rename), while maintainer openwiki-hypermemetic-ai-qq-4a5b1553
was live. Leaving the maintainer's tree untouched and quarantining the
displaced old tree passed all final gates.
