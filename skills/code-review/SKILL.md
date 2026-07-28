---
name: code-review
description: Delegates a branch, pull request, or working tree to a fresh read-only reviewer, then verifies material findings. Run for every non-trivial Change after implementation and local verification, before its first commit or publication, and over each in-scope fix delta; also use on operator request.
---

# Review with fresh context

The owner resolves orientation once; a fresh reviewer derives its verdict from
the Change and code without inheriting the author's conclusions.

## Orient and delegate

1. Define the exact surface. Honor a supplied base; otherwise infer branch and
   merge-base. Include committed, staged, unstaged, and untracked work.
2. Compare the Change with reconciled intent, inclusions, ownership boundary,
   and non-goals. Conflicting intent or a crossed boundary returns to alignment.
3. Write a complete temporary review brief with Repository/base/head/tree;
   objective/layer; changed-path map; intent/acceptance; boundary/non-goals;
   threat model with trust boundaries, defended modes, and declined classes;
   unenforced rules; sources/facts; Check results; permissions; required finding
   evidence; and context-gap condition. Require reviewer-created temporary
   files, redirected logs, generated helpers, caches (including npm), and
   reviewer-runnable test scratch beneath confinement-provided `$TMPDIR`;
   never literal `/tmp` or worktree-local scratch. Give coordinates and facts,
   never dumps, suspected findings, author
   conclusions, or transcript. `REVIEW.md` supplies owned rules.
4. Dispatch env and dispatcher config: per README Install.

   Use primary-`main`; never Change copies. `cwd` selects same-Repository
   worktrees:
   `<repo-primary>/delegation/manifests/agents/reviewer.md`.

   ```ts
   const completionEnvelopeSchema=JSON.parse(readFileSync("<absolute-change-worktree>/delegation/manifests/completion-envelope.schema.json","utf8"))
   subagent({agent:"reviewer",task:"Read-and-perform:<absolute-brief-path>",outputSchema:completionEnvelopeSchema,acceptance:{level:"none",reason:"per the manifests"},cwd:"<absolute-change-worktree>",context:"fresh",async:true})
   ```

   Paths absolute; brief temporary. Pi-subagents owns lifecycle/artifacts;
   adapter containment. Inspect id/`details.asyncDir` once: run/fleet status,
   `status.json`, `events.jsonl`,
   `output-<index>.log`, and `subagent-log-<run-id>.md`. `summary`: validated
   verdict/findings. Brief completes orientation—no further broad intent
   search/full-suite-rerun.
5. The reviewer tests responsibilities against the brief, exact diff, callers,
   tests, and suspected failure paths. Review moves and deletions by invariant.
   A hole reports the missing or contradictory fact, why it controls the
   verdict, and evidence inspected. Amend only that fact and dispatch fresh; a
   context gap is neither finding nor pass.
6. Request only material introduced failures. Smells require evidenced future
   cost and counterevidence, never label-driven refactoring. A finding whose
   remedy wants a fence names the declared trust boundary; empty means shrink.

## Verify and close

1. Verify each finding. Confirm a failure with a constructed input, state, or
   sequence observed to fail; confirm intent against scope and diff. Deduplicate
   and rank confirmed findings only. Clusters may require a model decision, not
   a patch queue. Stop at review unless fixes were requested.
2. Fix only introduced, reproduced, supported, in-scope failures, choosing the
   smallest resulting system; diff size only breaks ties. Display parallel net
   production-LOC and decision-point deltas per fix commit. Growth in either
   spends one mechanical same-fix-smaller regeneration: Checks pass and strictly
   smaller takes it; otherwise the original stands without justification prose.
   Rerun affected Checks and review the fix delta.
3. A finding class fixed in two prior rounds is convergence and trips the
   breaker: halt at the last green state, put the owning-layer question to the
   operator, and never invoke further loop machinery.
4. On infrastructure failure, resume
   with the source run's recorded `timeoutMs` and no other contract override.
   Dispatch formed findings, invalid output, and context gaps fresh; repeated
   failure blocks.
