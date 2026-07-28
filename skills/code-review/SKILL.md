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
3. Create one private durable run directory beneath the delegate runtime root.
   Write its complete review brief as `BRIEF.md` with Repository/base/head/tree;
   objective/layer; changed-path map; intent/acceptance; boundary/non-goals;
   threat model with trust boundaries, defended modes, and declined classes;
   unenforced rules; sources/facts; Check results; permissions; required finding
   evidence; and context-gap condition. Keep reviewer scratch, temporary files,
   redirected logs, generated helpers, and caches beneath the run directory.
   Give coordinates and facts, never dumps, suspected findings, author
   conclusions, or transcript. `REVIEW.md` supplies owned rules.
4. Dispatch env and dispatcher config: per README Install. The globally mounted
   extension selects the active qq checkout for qq worktrees and canonical qq
   primary `main` elsewhere; `cwd` selects the assigned Git worktree. The
   work-order reference is the transport: the adapter derives the run directory
   from the task's `Read-and-perform:<absolute-run-dir>/BRIEF.md` path (no
   environment variable is passed):

   ```ts
   subagent({agent:"reviewer",task:"Read-and-perform:<absolute-run-dir>/BRIEF.md",acceptance:{level:"none",reason:"per the manifests"},cwd:"<absolute-change-worktree>",context:"fresh",async:true})
   ```

   The reviewer writes `<absolute-run-dir>/ENVELOPE.md` per
   `delegation/manifests/ENVELOPE.md`; the adapter writes `TERMINAL` at child
   exit. Missing `ENVELOPE.md` is not a verdict, and ending on a user message
   is failed. Sweep active run directories' terminal records on every inbound
   event. The brief completes orientation—no further broad intent search or
   full-suite rerun.
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
   smallest resulting system; diff size only breaks ties. Rerun affected Checks
   and review the fix delta.
3. A finding class fixed in two prior rounds is convergence and trips the
   breaker: halt at the last green state, put the owning-layer question to the
   operator, and never invoke further loop machinery.
4. On review-infrastructure failure, resume once with the
   source run's recorded `timeoutMs` and no other contract override; a second
   failure is `inconclusive-under-substrate`, never an operator restatement.
   Dispatch formed findings and context gaps fresh.
