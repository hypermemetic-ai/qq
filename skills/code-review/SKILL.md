---
name: code-review
description: Delegates review of a branch, PR, or work in progress to a fresh read-only reviewer and returns verified findings. Run automatically once for every non-trivial Change after implementation and local verification, before commit, push, pull request creation, and final GitHub-side Checks; review the exact post-review delta after in-scope fixes. Also use when the operator asks to review changes, a PR, a branch, or work since a fixed point.
---

# Review with fresh context

1. Define the exact change surface. Honor a supplied base; otherwise infer the
   target branch and merge-base. For work in progress, include committed,
   staged, unstaged, and untracked changes.
2. Reconcile the owning Task or specification with later approved operator
   decisions. If they conflict, intent remains unclear, or the surface contains
   unrelated work, stop and align before delegation.
3. Prepare a factual review brief:
   - repository path, base, head, and working-tree state;
   - a changed-path map grouped by behavior, with mechanical moves, generated
     files, and historical material identified;
   - current intent, acceptance criteria, explicit inclusions and exclusions,
     and applicable repository rules;
   - commands and results from relevant local Checks.

   Give the reviewer repository coordinates, not a pasted full diff. Do not
   include the author's conclusions, suspected findings, or development
   transcript.
4. Delegate to one fresh read-only leaf reviewer. State that the review is an
   approved continuation: do not repeat grilling, delegate another review,
   modify state, rerun the full Check suite, or audit unrelated local or external
   systems. Have the reviewer inspect relevant diffs, surrounding callers, and
   tests directly. Use targeted reads; test only suspected failure paths.
   Review mechanical moves and deletions through their invariants rather than
   reading unchanged or historical bodies line by line.
5. Request only material findings introduced by the Change across correctness,
   security, reliability, intent, and non-tool-enforced standards. Each finding
   needs a file and line, a concrete failure path, and supporting evidence.
6. Use Fowler's code smells as maintenance heuristics, never violations. Report
   one only when the diff or history shows a concrete future cost; weigh
   counterevidence such as deliberate bounded-context duplication, generated or
   boundary code, adapters/facades, and compatibility constraints. Prescribe no
   refactoring from a label alone.
7. Verify every returned finding against the Repository and reproduce it when
   practical. Deduplicate, rank by impact, and report only confirmed findings.
   State when none remain. Stop at review unless the operator asks for fixes.
8. Treat a confirmed finding as evidence, not authorization to expand the
   Change. It is a fix candidate only when the Change introduced it, it is
   reproducible in an explicitly supported state, it falls within the agreed
   intent and inclusions, and the remedy is the smallest causal correction.
   Otherwise report it separately and stop.
9. If a remedy would materially widen the Change surface, stop and align with
   the operator. After an in-scope fix, rerun affected Checks and review the
   exact delta from the last reviewed tree. Restart the full review only when
   intent or scope materially changes.
10. A reviewer error or missing final report is not a review. Retry the unchanged
   brief with a fresh reviewer. Do not narrow scope or alter intent merely to
   obtain a pass; repeated reviewer unavailability is a blocker.
