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
3. Write a complete temporary review brief with Repository path, base, head,
   tree state, objective and layer; a categorized changed-path map; intent and
   acceptance criteria; boundary and non-goals; the threat model beside its
   declared trust boundaries, defended modes, and declined classes; unenforced
   rules; consulted sources and facts; Check results; reviewer permissions; the
   required file, line, failure-path, and evidence shape; and the context-gap
   condition. Give coordinates and facts, never dumps, suspected findings,
   author conclusions, or transcript. `REVIEW.md` supplies owned rules.
4. Call:

   ```sh
   qq-dispatch reviewer \
     --root <repository-root> --brief <brief> --output <report>
   ```

   Substitute only paths. The engine owns fresh read-only isolation, role
   configuration, containment, artifacts, and retirement. State that the brief
   completes orientation: no broad intent search or full-suite rerun.
5. The reviewer tests responsibilities against the brief, exact diff, callers,
   tests, and suspected failure paths. Review moves and deletions by invariant.
   A hole reports the missing or contradictory fact, why it controls the
   verdict, and evidence inspected. Amend only that fact and dispatch fresh; a
   context gap is neither finding nor pass.
6. Request only material introduced failures. Smells require evidenced future
   cost and counterevidence, never label-driven refactoring. A finding whose
   remedy wants a fence names the declared trust boundary; empty means shrink.

## Verify and close

7. Verify each finding. Confirm a failure with a constructed input, state, or
   sequence observed to fail; confirm intent against scope and diff. Deduplicate
   and rank confirmed findings only. Clusters may require a model decision, not
   a patch queue. Stop at review unless fixes were requested.
8. Fix only introduced, reproduced, supported, in-scope failures, choosing the
   smallest resulting system; diff size only breaks ties. Display parallel net
   production-LOC and decision-point deltas per fix commit. Growth in either
   spends one mechanical same-fix-smaller regeneration: Checks pass and strictly
   smaller takes it; otherwise the original stands without justification prose.
   Rerun affected Checks and review the fix delta.
9. A finding class fixed in two prior rounds trips the convergence breaker:
   halt at the last green state and ask which layer owns the invariant.
10. Dispatch error, nonzero exit, missing report, or context gap is not review.
    Dispatch the unchanged or minimally completed brief fresh. Never narrow
    scope or soften intent for a pass; repeated failure blocks.
