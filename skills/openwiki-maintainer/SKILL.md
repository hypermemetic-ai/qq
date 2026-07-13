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
   internal generator owns narrative and diagram semantics; this Actor reviews
   the result and does not fill gaps by rewriting generated content. Mechanical
   rejection below removes an optional diagram as one indivisible bundle; it is
   not permission to edit any part of that bundle.
3. Inventory `openwiki/processes/*.json` in stable filename order. For each
   retained spec, require the matching semantic `<id>.bpmn`, visibly attributed
   `<id>.png`, and a link from the Markdown page that explains the process. Run
   `qq-openwiki-bpmn --check <spec>` and require clean lint, a lossless evidence
   round trip, repeat-generation determinism, and exact published artifacts.
4. Inspect every rendered PNG. Confirm that each diagram materially clarifies
   its process, agrees with the surrounding narrative, and has source-backed
   documentation and evidence on every node and edge. Inspect it at its actual
   Markdown embed width and open its linked full-resolution image. A wide or
   panoramic aspect ratio and pixel width are not defects by themselves; reject
   only a material semantic, evidentiary, or readability failure. Spot-check the
   cited file and line ranges against landed source. Also look for stale diagram
   links or previously modeled processes that changed or disappeared.
5. Before mutating generated output, finish all other local verification.
   Require the resulting Change to remain within `openwiki/` and the marked
   OpenWiki instruction block. Reject any generated GitHub workflow, provider
   credential, or unrelated source edit. Check Markdown links and source claims,
   search for stale descriptions, run `git diff --check`, and run any
   Repository-specific documentation Checks.
6. Invoke `code-review` with fresh-context independence on the complete generated
   set. Verify and classify every finding before changing files. A non-diagram
   finding or uncertainty about safe bundle removal follows step 8; do not
   partially sanitize the evidence first.
7. Diagrams are optional: a missing diagram does not fail an otherwise complete
   narrative. When diagram findings are the only material defects after steps
   2-6, first run `git add -A` to stage the complete scope-checked generated
   result as a reversible index snapshot; never commit or push that snapshot.
   Before removal, require each affected page to remain coherent and contain no
   other reference or link to the diagram; otherwise follow step 8. Then remove
   the `<id>.json`, `<id>.bpmn`, `<id>.png`, and exact standalone Markdown link
   together from the working tree. Do not rewrite the spec, artifacts, or
   surrounding prose. Repeat the artifact inventory and step 5 Checks, then
   review the exact `git diff --` removal delta against the snapshot. If it is
   green, run `git add -A` to replace the snapshot with the removals and continue.
   If any removal Check or review fails, run `git restore --worktree .` before
   `git restore --staged .` to restore and then unstage the complete result, and
   follow step 8.
8. When a complete result has a verified non-diagram defect or a diagram bundle
   cannot be rejected cleanly, stage the complete scope-checked generated set
   with `git add -A` as the current correction baseline. Treat that snapshot as
   non-deliverable until the result is green. Consolidate all verified material
   findings into a concise correction brief for the internal generator, then
   run `qq-openwiki --correct` so it can correct the current generated set it
   authored. Rerun affected Checks and the full-set invariants, then invoke
   `code-review` on the exact correction delta—including untracked files—against
   the staged baseline. When a round closes or materially reduces the findings
   without introducing comparable defects, run `git add -A` to advance the
   baseline. Reserve another correction round for evidence of a remaining
   material defect, a clear remedy, and continued convergence; polish or
   speculative improvement does not justify one. End correction when the
   generator command fails, or when a round fails to materially reduce the
   findings or introduces comparable defects. Leave the current worktree,
   staged baseline, and evidence intact, report the unresolved defects, and stop
   for operator direction. A newer `origin/main` commit is a new target and
   supersedes the old result under Observe landed state.
9. An upstream error or interrupted initial generation has no reviewable result.
   Discard its partial output, return the branch to current `origin/main`, and
   retry once for that target. If the retry also fails, leave the branch clean,
   report both failures, and stop instead of creating an unbounded service-retry
   loop.

## Deliver and continue observing

Commit and push only green generated work, open a documentation-only pull
request, pass final Checks, and leave merge authority to the operator. A
regenerated update pushes over the same branch — force-push with lease; the
single writer owns its history — and refreshes the standing pull request in
place. If `main` advances while the pull request is open, supersede
it: start over from the new state rather than queuing behind your own Change.
After it lands, fast-forward the dedicated branch on the next observed advance
of `main`.
