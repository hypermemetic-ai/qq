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
3. The owner creates one private mode-700 durable run directory beneath the
   delegate runtime root.
   Write its complete review brief as `BRIEF.md` with Repository/base/head/tree;
   objective/layer; changed-path map; intent/acceptance; boundary/non-goals;
   threat model with trust boundaries, defended modes, and declined classes;
   unenforced rules; sources/facts; Check results; permissions; required finding
   evidence; and context-gap condition. Keep reviewer scratch, temporary files,
   redirected logs, generated helpers, and caches beneath the run directory.
   Give coordinates and facts, never dumps, suspected findings, author
   conclusions, or transcript. `REVIEW.md` supplies owned rules.
4. Invoke the assigned worktree's resident engine. It resolves that checkout's
   Pi wrapper, manifests, and execution-profile policy and rejects a `--cwd`
   outside its Git common directory:

   ```sh
   <assigned-worktree>/bin/qq-delegate start --role reviewer \
     --cwd <absolute-worktree> --brief <absolute-run-dir>/BRIEF.md
   ```

   Acceptance returns the prompt and exact run identity. Use `delegate-batch`'s
   exact-path `status`, `wait`, and `collect` contract. A nonzero terminal or
   refused/missing envelope fails dispatch; `run` is blocking compatibility.
   The brief completes orientation—no broad intent search or full-suite rerun.
5. Test responsibilities against the brief, exact diff, callers, tests, and
   failure paths. Apply `REVIEW.md`'s responsibility-and-consequence standard
   to additions and omissions; imaginability alone cannot support a finding.
   Review moves and deletions by invariant. A hole names the missing or
   contradictory fact, why it controls the verdict, and evidence inspected.
   Amend only that fact and dispatch fresh; a context gap is neither finding
   nor pass.
6. Request only material introduced failures. Smells require evidenced future
   cost and counterevidence, never label-driven refactoring. A finding seeking
   a fence names the declared trust boundary; absent means shrink.

## Verify and close

1. Verify each finding. Reproduce failure with a constructed input, state, or
   sequence; confirm intent against scope and diff. Deduplicate and rank only
   confirmed findings. Clusters may need a model decision, not a patch queue.
   Stop at review unless fixes were requested.
2. Fix only introduced, reproduced, supported, in-scope failures, choosing the
   smallest resulting system; diff size only breaks ties. Rerun affected Checks
   and review the fix delta.
3. A finding class fixed in two prior rounds is convergence and trips the
   breaker: halt at the last green state, put the owning-layer question to the
   operator, and never invoke further loop machinery.
4. For dispatch-infrastructure failure—engine refusal, timeout, or substrate
   failure—follow the `delegate-batch` contract's resume rule. Dispatch formed
   findings and context gaps fresh.
