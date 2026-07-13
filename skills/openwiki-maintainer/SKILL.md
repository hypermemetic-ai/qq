---
name: openwiki-maintainer
description: Dedicated OpenWiki maintainer Actor only. Invoke exclusively when that Actor either observes main advance or is explicitly assigned initial OpenWiki setup, to perform the resulting single-writer refresh or initialization. Do not invoke for source Changes or for work that merely reads, reviews, modifies, tests, or documents OpenWiki, this Skill, or the maintainer workflow.
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
   setup. The wrapper holds the per-Repository lock, removes upstream's GitHub
   recurrence plumbing, and instructs OpenWiki's internal generator to decide
   which processes benefit from BPMN and to author their specs, artifacts, and
   Markdown links during the same run.
2. Read OpenWiki's complete output, then verify its claims independently. The
   internal generator owns both narrative and diagram authorship; this Actor
   reviews the result and does not fill gaps by editing generated content.
3. Inventory `openwiki/processes/*.json` in stable filename order. For each
   retained spec, require the matching semantic `<id>.bpmn`, visibly attributed
   `<id>.png`, and a link from the Markdown page that explains the process. Run
   `qq-openwiki-bpmn --check <spec>` and require clean lint, a lossless evidence
   round trip, repeat-generation determinism, and exact published artifacts.
4. Inspect every rendered PNG. Confirm that each diagram materially clarifies
   its process, stays legible, agrees with the surrounding narrative, and has
   source-backed documentation and evidence on every node and edge. Spot-check
   the cited file and line ranges against landed source. Also look for stale
   diagram links or previously modeled processes that changed or disappeared.
5. If a useful diagram is missing, a retained one is unhelpful or stale, any
   evidence is unsupported, or an artifact fails verification, do not author,
   patch, regenerate, or delete diagram content yourself. Discard the generated
   output, return the dedicated branch to current `origin/main`, and rerun
   `qq-openwiki --update` with concise evidence-backed feedback about the
   observed problem. Repeat verification on the wholly regenerated result.
6. Require the resulting Change to remain within `openwiki/` and the marked
   OpenWiki instruction block. Reject any generated GitHub workflow, provider
   credential, or unrelated source edit.
7. Check Markdown links and source claims, search for stale descriptions, run
   `git diff --check`, and run any Repository-specific documentation Checks.
8. Invoke `code-review` with fresh-context independence. Resolve confirmed
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
