---
name: openwiki-maintainer
description: Own asynchronous, single-writer OpenWiki initialization and refreshes in response to a Repository's main branch advancing. Invoke only as the dedicated OpenWiki maintainer Actor, when that Actor observes a merge to main, or when explicitly assigned initial OpenWiki setup. Never invoke from or as part of the source Change that caused the merge.
---

# Maintain OpenWiki

Own `openwiki/` independently of source-change agents. Treat a merge as an input
event, not a handoff of responsibility from its author. Process landed state
only and deliver generated documentation as a separate Change.

## Observe landed state

1. Fetch `origin/main` in the dedicated maintainer worktree.
2. Read `openwiki/.last-update.json` when it exists and inspect the landed range
   through current `origin/main`.
3. Ignore advances that change only `openwiki/`. If no described behavior could
   have changed, stop without creating a Change.
4. If another OpenWiki update Change is active, wait. Later merges remain in the
   landed range for the next run; never create a competing writer.

Do not require the source-change agent to update, enqueue, or assess OpenWiki.

## Prepare the single writer

1. Use the one local worktree whose branch is `openwiki/update`.
2. Require a clean worktree.
3. Fast-forward the branch until `HEAD` equals fetched `origin/main`. If it has
   unmerged commits, an update Change is already active; wait rather than
   rewriting it.
4. Keep provider credentials outside the Repository under `~/.openwiki/`.

## Generate and verify

1. Run `qq-openwiki --update`, or `qq-openwiki --init` only for explicit initial
   setup. The wrapper holds the per-Repository lock and removes upstream's
   GitHub recurrence plumbing.
2. Read OpenWiki's complete output, then verify its claims independently.
3. Require the resulting Change to remain within `openwiki/` and the marked
   OpenWiki instruction block. Reject any generated GitHub workflow, provider
   credential, or unrelated source edit.
4. Check Markdown links and source claims, search for stale descriptions, run
   `git diff --check`, and run any Repository-specific documentation Checks.
5. Invoke `code-review` with fresh-context independence. Resolve confirmed
   findings and rerun affected Checks.

## Deliver and continue observing

Commit and push only green generated work, open a documentation-only pull
request, pass final Checks, and leave merge authority to the operator. After it
lands, fast-forward the dedicated branch on the next observed advance of
`main`. If `main` advanced while this Change was active, process that accumulated
range in the next run.
