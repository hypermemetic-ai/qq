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
4. An update Change that is open but unmerged documents a superseded tree.
   Discard it and regenerate from current `origin/main`; generated pages carry
   no value worth waiting for. Never create a competing writer — replace the
   stale one.

Do not require the source-change agent to update, enqueue, or assess OpenWiki.

## Prepare the single writer

1. Use the one local worktree whose branch is `openwiki/update`.
2. Require a clean worktree.
3. Reset the branch until `HEAD` equals fetched `origin/main`. Unmerged
   commits on it belong to a superseded update Change; drop them — every page
   regenerates from landed state.
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
request, pass final Checks, and leave merge authority to the operator. A
regenerated update pushes over the same branch — force-push with lease; the
single writer owns its history — and refreshes the standing pull request in
place. If `main` advances while the pull request is open, supersede
it: start over from the new state rather than queuing behind your own Change.
After it lands, fast-forward the dedicated branch on the next observed advance
of `main`.
