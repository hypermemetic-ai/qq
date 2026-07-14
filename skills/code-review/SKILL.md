---
name: code-review
description: Delegates review of a branch, PR, or work in progress to a fresh read-only reviewer and returns verified findings. Run automatically once for every non-trivial Change after implementation and local verification, before commit, push, pull request creation, and final GitHub-side Checks; review the exact post-review delta after in-scope fixes. Also use when the operator asks to review changes, a PR, a branch, or work since a fixed point.
---

# Review with fresh context

A review is independent judgment, not repeated discovery. The owning agent
resolves the orientation once and hands the reviewer a complete brief; the
reviewer grounds its verdict in the diff and the code around it. Neither
inherits the other's conclusions.

## Own the orientation

1. Define the exact change surface. Honor a supplied base; otherwise infer
   the target branch and merge-base. For work in progress, include committed,
   staged, unstaged, and untracked changes.
2. Test whether the actual Change is still the agreed Change. Reconcile the
   owning Task or specification with later approved operator decisions, then
   compare the surface against the intended outcome, the ownership boundary,
   and the explicit non-goals. If the intent sources conflict, intent stays
   unclear, or the Change crosses the boundary, stop and align first —
   delegation cannot repair a misaligned Change.
3. Compose the review brief. It is the reviewer's complete orientation, not a
   reading list:
   - repository path, base, head, and working-tree state;
   - the review objective and its layer: Task, branch, pull request, or
     working tree;
   - a changed-path map grouped by behavior, with mechanical moves, generated
     files, and historical material marked;
   - current intent, acceptance criteria, explicit inclusions, the ownership
     boundary, and the explicit non-goals;
   - the repository rules and standards that apply and no tool enforces;
   - the sources already consulted and the facts each one contributed;
   - relevant local Check commands with their results;
   - the reviewer's tool and permission boundary, the required finding shape
     — file, line, concrete failure path, supporting evidence — and the exact
     condition for reporting a context gap.

   Give coordinates, not dumps: repository locations rather than a pasted
   diff, distilled facts rather than source excerpts. Never include the
   author's conclusions, suspected findings, or development transcript.

## Delegate the judgment

4. Follow `agent-messaging`'s canonical temporary-delegate procedure to start
   one fresh read-only reviewer with no inherited conversation history. Start
   Codex with `--sandbox read-only --ask-for-approval never` and give it the
   complete brief from step 3. Outside Herdr, use the cleanest fresh-context
   mechanism available and report that pane placement was unavailable. State
   that the brief completes orientation: no start-of-work sequence, no broad
   searches of intent or knowledge surfaces, no unrelated skills, no further
   delegation, no state changes, no full Check-suite reruns.
5. The reviewer tests the Change's responsibilities against the brief, then
   inspects the exact diff, the surrounding callers and tests, and the
   failure paths it suspects. A correctly implemented but unapproved
   responsibility is a material intent finding. Moves and deletions are
   reviewed through their invariants, not line by line through unchanged or
   historical bodies.
6. A brief with a hole gets a context-gap report, not improvisation: the
   exact missing or contradictory fact, why the verdict depends on it, and
   the evidence already inspected. Supply exactly that fact to the same
   reviewer; without it the review cannot proceed. A context gap is neither a
   finding nor a pass.
7. Request only material findings the Change introduced, across correctness,
   security, reliability, intent, and standards no tool enforces. Treat code
   smells as maintenance heuristics, never violations: report one only when
   the diff or history shows a concrete future cost, weigh counterevidence
   such as deliberate bounded-context duplication, generated and boundary
   code, and compatibility constraints, and prescribe no refactoring from a
   label alone.

## Verify and close

8. Verify every returned finding against the Repository and reproduce it when
   practical; a reviewer's conclusion is not yet evidence. Deduplicate, rank
   by impact, and report only confirmed findings — and say so plainly when
   none remain. When confirmed findings cluster around one responsibility or
   protocol, revisit the model with the operator instead of feeding a patch
   queue. Stop at review unless the operator asks for fixes.
9. A confirmed finding is evidence, not authorization to grow the Change. Fix
   it only when the Change introduced it, it reproduces in a supported state,
   it sits inside the agreed intent and inclusions, and the remedy is the
   smallest causal correction; otherwise report it separately and stop. After
   an in-scope fix, rerun the affected Checks and review the exact delta from
   the last reviewed tree. If a remedy would materially widen the Change,
   stop and align with the operator.
10. Handle an explicit context gap through step 6. A reviewer error or missing
    final report is not a review: retire that delegate under
    `agent-messaging`'s close-and-verify procedure, then retry the unchanged
    brief with a fresh reviewer. After the final report and any step 9 delta
    review, retire every reviewer the same way. Never narrow scope or soften
    intent to obtain a pass; repeated reviewer unavailability or cleanup failure
    is a blocker.
