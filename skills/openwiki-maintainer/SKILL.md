---
name: openwiki-maintainer
description: Dedicated OpenWiki maintainer Actor only. Invoke only when that Actor is explicitly assigned an on-demand or scheduled wiki refresh, or explicit first setup. Never invoke by observing merges or for source Changes; source Changes never invoke it.
---

# Maintain OpenWiki

This Skill is only for the dedicated OpenWiki maintainer Actor. Source Changes
never invoke it. Begin only from an explicit on-demand or scheduled refresh
assignment; a merge or observed `main` advance is not a trigger.

## Refresh

1. Work in the Repository's long-lived `openwiki/update` worktree. Fetch
   `origin`, require no unrelated local state, and reset the branch and worktree
   to freshly fetched `origin/main`. Keep provider credentials outside the
   Repository.
2. Run `qq-openwiki --update`. Use `qq-openwiki --init` only for explicit first
   setup. Read the complete generator output and require a documentation-only
   diff.
3. Run applicable documentation Checks and `git diff --check`, then invoke
   `code-review` on the complete generated diff. Verify each finding and resolve
   only in-scope defects; rerun affected Checks and review any correction delta.

## Deliver

Commit and push only the reviewed generated documentation on
`openwiki/update`, then open or refresh an ordinary docs-only pull request to
`main`. The operator reviews and merges it through the normal GitHub Flow.

Never self-merge, construct a merge commit, publish directly to `main`, use
activation markers, or run an activation retry protocol.
