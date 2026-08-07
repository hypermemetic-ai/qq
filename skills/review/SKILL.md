---
name: review
description: Delegates a bounded artifact to a fresh read-only Reviewer and verifies material findings with artifact-appropriate evidence. Use for non-trivial software, documentation, client-facing work, or another bounded artifact after local verification, on each in-scope fix delta, or on operator request.
---

# Review an artifact with fresh context

The owner resolves orientation once. A fresh Reviewer derives a verdict from the bounded artifact and intent without inheriting the author's conclusions.

## Orient and delegate

1. Define the exact artifact and comparison surface. For a Repository Change, honor a supplied base or infer branch and merge-base, and include committed, staged, unstaged, and untracked work. For another artifact, identify its canonical source and rendered or delivered form.
2. Reconcile intent, inclusions, ownership boundary, non-goals, and acceptance. Conflicting intent or a crossed boundary returns to alignment.
3. Create one private mode-700 durable run directory and write a complete `BRIEF.md`: artifact identity and coordinates; objective; changed-surface map; intent/acceptance; boundary/non-goals; threat model and declined classes; unenforced rules; source facts; available Check evidence; permissions; required finding evidence; and the context-gap condition. Give coordinates and facts, never suspected findings, author conclusions, transcript, or a dump. Keep all reviewer scratch beneath the run directory. A Repository's root `REVIEW.md` supplies owned review rules.
4. Dispatch through the worktree's resident engine:

   ```sh
   <assigned-worktree>/bin/qq-delegate start --role reviewer \
     --cwd <absolute-worktree> --brief <absolute-run-dir>/BRIEF.md
   ```

   Use `delegate`'s exact-path lifecycle, envelope, and retry-once contract. Select `writing-for-clients` only when the authorized artifact needs that register. The brief completes orientation; do not turn review into broad intent search or an indiscriminate full-suite rerun.
5. Match evidence to the artifact. Execute and inspect behavior for software; check semantic accuracy, links, generated boundaries, and the rendered surface for documentation; inspect the actual reader-visible form and named register for client-facing material; define an equally direct observation for another artifact. Internal consistency alone does not prove an outcome.
6. Report only material owned failures in correctness, security, reliability, intent, or enforced standards. A finding names location, concrete failure path, consequence, and evidence. Imaginability and smells alone are insufficient. Review moves/deletions by invariant. A requested fence cites the brief's declared trust boundary; without one, shrink the illegal state.
7. A missing or contradictory load-bearing fact is a context gap: name the fact, why the verdict depends on it, and inspected evidence. Amend only that fact and dispatch fresh; a gap is neither a finding nor a pass.

## Verify and close

Verify each finding against the artifact, scope, callers or readers, evidence, and failure path. Reproduce software failures where practical; directly demonstrate documentary or reader-visible mismatches. Deduplicate and rank confirmed findings only. Stop at review unless fixes were assigned.

Fix only introduced, reproduced, supported, in-scope failures with the smallest resulting system. Rerun affected Checks and review the fix delta. If the same finding class survives two prior fix rounds, stop at the last green state and return the owning-layer question to the operator rather than adding loop machinery. Infrastructure failures follow `delegate`'s bounded retry rule; formed findings and context gaps always dispatch fresh.
