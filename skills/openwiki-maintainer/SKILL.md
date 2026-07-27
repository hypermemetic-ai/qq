---
name: openwiki-maintainer
description: Dedicated OpenWiki maintainer. Invoke for an explicit refresh or first setup, never from a merge or source Change.
---

# Maintain OpenWiki

Begin only from the assignment; observing `main` advance is not a trigger.

## Refresh

1. In the long-lived `openwiki/update` worktree, fetch `origin`, refuse unrelated
   state, and reset to fresh `origin/main`. Keep credentials outside the
   Repository.
2. Run `qq-openwiki --update` (`--init` only for first setup). Read output;
   require a docs-only diff. After no-change, scheduled runs
   call `qq-openwiki-daily-finish no-change`.
3. Run applicable documentation Checks and `git diff --check`, then invoke
   `code-review` on the complete diff. Verify findings, correct only supported
   in-scope defects, rerun affected Checks, and review each correction delta.

## Deliver

Commit and push only reviewed generated documentation on `openwiki/update`,
then open or refresh its docs-only PR. The operator merges on-demand refreshes.

Only qq's daily service sets `QQ_OPENWIKI_SCHEDULED=1`. After fresh review and
exact-head `shell-tests` success, pass the reviewed 40-hex head to
`qq-openwiki-merge`. It revalidates Repository, PR, base, head, generated paths,
Checks, threads, mergeability, and `qqp-bot`. Its marker and reviewed-head claim
are procedural drift-nets, not credential or cryptographic boundaries.

Never merge another way, enable native auto-merge, construct a merge locally,
publish directly to `main`, invent an on-demand marker, or retry before the next
assigned run.
