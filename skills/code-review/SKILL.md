---
name: code-review
description: Delegates review of a branch, PR, or work in progress to a fresh read-only reviewer and returns verified findings. Run automatically once for every non-trivial Change after implementation and local verification, before commit, push, pull request creation, and final GitHub-side Checks; review the exact post-review delta after in-scope fixes. Also use when the operator asks to review changes, a PR, a branch, or work since a fixed point.
---

# Review with fresh context

1. Define the exact change surface. Honor a supplied base; otherwise infer the
   target branch and merge-base. For work in progress, include committed,
   staged, unstaged, and untracked changes.
2. Complete general Repository orientation before delegation. The spawning
   agent owns reconciling the Task or specification, later approved operator
   decisions, relevant Knowledge and rules, and Check evidence. Compare them
   with the actual surface, intended outcome, ownership boundary, and explicit
   non-goals. If they conflict, intent remains unclear, or the Change crosses
   that boundary, stop and align before delegation.
3. Prepare a factual review capsule:
   - repository path, base, head, working-tree state, review objective, and work
     layer: Task, branch, pull request, or working tree;
   - a changed-path map grouped by behavior, with mechanical moves, generated
     files, and historical material identified;
   - current intent, acceptance criteria, explicit inclusions, ownership
     boundary, and explicit non-goals;
   - relevant source locators and a concise orientation receipt naming sources
     already consulted and the facts they contribute;
   - required acceptance evidence and relevant local Check commands and results;
   - the reviewer's tool and permission boundary, required finding and citation
     shape, and the explicit condition for reporting insufficient context.

   The capsule is the reviewer's complete orientation, not a reading list. Give
   repository coordinates rather than a pasted full diff and distilled facts
   rather than source dumps. Do not include the author's conclusions, suspected
   findings, or development transcript.
4. Delegate to one fresh read-only leaf reviewer without parent conversation
   history, using the runtime's no-history option such as `fork_turns: "none"`.
   State that the capsule completes orientation: do not rerun the Repository's
   start-work sequence, broadly search intent or Knowledge surfaces, invoke
   unrelated Skills, delegate, modify state, rerun the full Check suite, or audit
   unrelated systems. Have the reviewer test the Change's responsibilities
   against the capsule, then inspect the exact diff, relevant surrounding callers
   and tests, and suspected failure paths. A correctly implemented but unapproved
   responsibility is a material intent finding. Review moves and deletions
   through their invariants, not unchanged or historical bodies line by line.
5. If the capsule lacks material context, have the reviewer return a context-gap
   report naming the exact missing or contradictory fact, why it matters, and
   evidence already inspected. Do not fill it through broad discovery. Supply
   only the missing factual context to the same reviewer; otherwise the review
   cannot proceed. A context gap is neither a finding nor a pass.
6. Request only material findings introduced by the Change across correctness,
   security, reliability, intent, and non-tool-enforced standards. Each finding
   needs a file and line, a concrete failure path, and supporting evidence.
7. Use Fowler's code smells as maintenance heuristics, never violations. Report
   one only when the diff or history shows a concrete future cost; weigh
   counterevidence such as deliberate bounded-context duplication, generated or
   boundary code, adapters/facades, and compatibility constraints. Prescribe no
   refactoring from a label alone.
8. Verify every returned finding against the Repository and reproduce it when
   practical. Deduplicate, rank by impact, and report only confirmed findings.
   State when none remain. Group confirmed findings by cause. When a cluster
   centers on one responsibility or protocol, revisit the model with the
   operator rather than feed an expanding patch queue. Stop at review unless the
   operator asks for fixes.
9. Treat a confirmed finding as evidence, not authorization to expand the
   Change. It is a fix candidate only when the Change introduced it, it is
   reproducible in an explicitly supported state, it falls within the agreed
   intent and inclusions, and the remedy is the smallest causal correction.
   Otherwise report it separately and stop.
10. If a remedy would materially widen the Change surface, stop and align with
   the operator. After an in-scope fix, rerun affected Checks and review the
   exact delta from the last reviewed tree. Restart the full review only when
   intent or scope materially changes.
11. A reviewer error or missing final report is not a review. Handle an explicit
   context gap through step 5; otherwise retry the unchanged capsule with a fresh
   reviewer. Do not narrow scope or alter intent merely to obtain a pass;
   repeated reviewer unavailability is a blocker.
