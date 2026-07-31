# Workflows

## Orient, align, act

Start from the assignment and context already provided, and read `CONCEPTS.md` before working. Resolve only material gaps through the surfaces that own them: Backlog records for durable intent and history, this wiki for the landed system, and source plus fresh Checks for verification. Use Backlog's CLI for managed records. If derived material conflicts with source and Checks, trust the latter and report the conflict.

For genuinely new work, the operator-facing accountable owner uses the default alignment brief: current-state questions first, every embedded consequential decision cited or recommended, one answered question card, and one closing approval question. Before Repository mutation, the owning Task's decision ledger must cite what settled every consequential decision or explicitly say `none`; dispositions do not transfer. Spawned, delegated, review, research, maintainer, and event-triggered Actors treat bounded assignments as aligned and return new consequential decisions or scope gaps to the assigning or owning Actor (`CONCEPTS.md`; `skills/deliver-change/SKILL.md`).

## Task-to-Change delivery

Backlog Tasks preserve intent, acceptance criteria, dependencies, and status. A Change is the branch, commits, and pull request used to deliver that intent. The accountable Actor follows `deliver-change`:

1. **Align and create.** Validate the persistent project home and create the Change as a plain linked worktree from the agreed base, with no per-Change Herdr workspace. Task lifecycle edits stay in Backlog's operator-owned store and are committed/pushed there, off the Change branch. Capture the approved plan through Backlog's CLI and cite it in the decision ledger.
2. **Implement.** Every non-trivial Change receives a complete durable work order through `delegate-batch`. Verify its run-directory `ENVELOPE.md` against the tree, run Checks that observe changed behavior, and commit only green units.
3. **Review.** Run fresh-context `code-review` for every non-trivial Change after local verification. Verify findings, fix only confirmed in-scope failures, rerun affected Checks, and review each correction delta.
4. **Finalize and hand off.** Verify every acceptance criterion, mark the Task Done through Backlog's CLI, store-commit and push that status edit, then open the one pull request. Pass final GitHub Checks, inspect merge state, open/report the PR URL, and arm session-scoped `qq_pr_watch`. Yield rather than polling. Source Changes are never agent-merged.
5. **Land.** After operator merge, call idempotent `qq-change land`; it re-verifies merge and ancestry, requires the sole primary `main` checkout to be completely clean, and fast-forwards it.
6. **Observe and retire.** While the Change worktree exists, assemble and finalize its guided Observer package through the delegate contract. Then call `qq-change retire`. Package, lifecycle, checkout, branch, topology, cleanliness, focus, and bound-run-directory rails must pass. On refusal or error, preserve evidence and state rather than stashing, cleaning, resetting, switching, or forcing deletion (`skills/deliver-change/SKILL.md`; `bin/qq-change`).

`/handoff <Task-ID>` transfers an existing aligned Change to a fresh accountable Pi tab in project home. It resolves the unique linked checkout and durable plan and is distinct from bounded child delegation (`README.md`; `bin/qq-handoff`).

## Verification and review

A Check must observe the intended subject, not merely exit successfully. Read complete output and guard against **silent failure**—plausible output that answered a different question.

`code-review` prepares Repository coordinates, Task intent, scope, threat model, applicable unenforced standards, and Check evidence without passing the author's conclusions. The assigned worktree's `qq-delegate` runs the canonical reviewer role and records `BRIEF.md`, child-authored `ENVELOPE.md`, engine-authored `TERMINAL` v2, output, cache, configuration, and sessions in a private durable run directory. Context gaps cause a corrected fresh invocation rather than reviewer improvisation. The owner verifies each claimed failure with a constructed failing scenario and limits fixes to introduced in-scope regressions (`skills/code-review/SKILL.md`; [`REVIEW.md`](../REVIEW.md)).

See [Verification](verification.md) for Repository-specific Checks and gaps.

## Specialized flows

### Bounded ticket batches

Use `delegate-batch` only after intent and plan bounds settle. At ticket creation, the owner creates one private mode-700 durable run directory and writes its complete `BRIEF.md`. Before dispatch, run every literal Check in the work order exactly as written and record the baseline. Coupled work sharing files or invariants is sequential; independent reads may fan out; disjoint writers receive separate branches, worktrees, and non-Git resources. Run only the dependency-derived ready frontier, cap writers at three to five, and serialize integration.

Invoke the assigned worktree's resident `qq-delegate run` or `batch`. It resolves that checkout's patched Pi wrapper, role manifest, timeout, tools, and execution-profile policy; calls block through child lifecycle. A nonzero exit or missing `ENVELOPE.md` fails dispatch. On infrastructure failure, resume once with the same brief in a fresh run directory; a second failure is `inconclusive-under-substrate`. The owner verifies every envelope claim against the tree. Durable run artifacts—not a status file or Herdr pane—are the delegate evidence surface (`skills/delegate-batch/SKILL.md`; `bin/qq-delegate`).

### Difficult bugs

Use `diagnosing-bugs` when causality is unclear. Establish a discriminating reproducer, separate observations from inference, rank falsifiable hypotheses, and stop at diagnosis unless a fix is authorized. An authorized repair must fail before the fix and pass after it; add a regression Check where practical.

### Research

Use `research` for multi-source, decision-grade questions. Launch the canonical researcher role through the assigned worktree's `qq-delegate`; keep its brief and result in the durable private run directory. Researcher children alone receive the pinned native Context7 extension and tools, and inherited `CONTEXT7_API_KEY` causes launch refusal. The owning Actor retains judgment and verifies load-bearing citations. Prefer primary sources and preserve one durable Backlog `research` document attached to an owning Task (`skills/research/SKILL.md`; `bin/qq-delegate`).

### Human acceptance

Use `uat-signoff` after autonomous verification when behavior is visible or subjective. Present one observable check at a time and require explicit owner confirmation. Destructive, monetary, irreversible, or outbound actions still require separate just-in-time authorization.

### Observer and Architect

Observer runs are Repository-qualified and preserve guided/blind analyses plus recurrence-key evidence. Guided observation is normally required before Change retirement. `/architect` opens a bounded global digest of new and unsettled findings. The Architect records only operator-settled `route` decisions with agreed scope or `set_aside` decisions; it never applies source, creates Tasks, approves scope, or forces decisions. Coverage follows append-only settled dispositions and exact recurrence-key hits in Backlog decision records (`README.md`; `skills/architect/SKILL.md`; `bin/qq-observe`).

Use `idea` only for messages beginning with `idea:` or explicit `$idea`; append supplied text verbatim with a timestamp to the single Backlog `Ideas` document, without interpretation or side effects.

## Documentation update point

OpenWiki maintenance is not part of the source Actor's Task-to-Change flow, and observing a merge or `main` advance is not a trigger. An explicitly assigned maintainer resets the long-lived `openwiki/update` worktree to fresh `origin/main`, runs generation, checks the docs-only diff, obtains fresh-context review, and opens or refreshes the pull request. The operator merges on-demand refreshes. Only qq's daily service marker may invoke `qq-openwiki-merge` after exact-head `shell-tests`; the guard revalidates Repository, branch, PR, generated paths, Checks, review threads, mergeability, and bot identity. No path publishes directly to `main` or enables native auto-merge (`skills/openwiki-maintainer/SKILL.md`; `bin/qq-openwiki-merge`).