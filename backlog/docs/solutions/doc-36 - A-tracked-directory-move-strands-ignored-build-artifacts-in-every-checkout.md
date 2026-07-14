---
id: doc-36
title: A tracked directory move strands ignored build artifacts in every checkout
type: guide
created_date: '2026-07-14 04:45'
updated_date: '2026-07-14 04:45'
tags:
  - solution
  - git
  - worktrees
  - artifacts
---
# A tracked directory move strands ignored build artifacts in every checkout

## Symptom

After merging a Change that moved a tracked directory with git mv, post-merge
cleanliness Checks fail in existing checkouts with the old path reported as
untracked (for example `?? skills/bpmn-plans/pipeline/`), even though the move
itself was clean. The leftovers can be large (tens of MB of node_modules and
generated output) and appear suddenly unignored.

## Root cause

Git moves only tracked content. Build artifacts that were ignored at the old
path physically remain there in every checkout that had them, while the
`.gitignore` shielding them moves with the tracked tree. The moment a checkout
advances past the move commit, those leftovers become visible untracked files.
Each existing checkout — the primary main checkout and every long-lived
worktree — hits this independently when it next advances.

## Resolution

Preservation-only relocation; never clean blindly (refuse, don't sanitise):

- Precheck each move target immediately before acting, and stop on any
  surprise instead of forcing.
- Move an artifact whose new home is free to the corresponding new ignored
  path.
- Quarantine an artifact whose target is occupied to a durable location
  outside the Repository (for example
  `~/.local/state/qq/quarantine/<old-path-slug>.<merge-sha>`); regenerable
  trees like node_modules are preserved there rather than deleted or merged.
- Remove the emptied old tree with non-forcing `rmdir` only, so an unexpected
  leftover fails loudly and gets reported.

## Verification

PR #69 (TASK-27, pipeline relocation) on 2026-07-14: the primary checkout's
post-merge sync gate failed on 79M of stranded node_modules plus 1.9M of
generated output at the old path. After the preservation moves and non-forcing
rmdir, all final gates passed and main synchronized to the merge commit.
