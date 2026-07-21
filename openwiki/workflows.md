# Workflows

## Orient, align, act

Start from the assignment and context already provided, and read `CONCEPTS.md` before working. Resolve only material gaps through the surfaces that own them: Backlog Tasks, documents, and decisions for durable intent and history; relevant OpenWiki pages for the landed system; and source plus fresh Checks for verification. Use Backlog's CLI for its records. If a derived surface is stale or conflicts with source and Checks, trust the latter and report the conflict.

For a genuinely new work item, `grilling` belongs only to the operator-facing accountable owner and defaults to an alignment brief: intended work, every embedded consequential decision with its citation or a recommendation, and one approval question. Escalate to the full interview only when a decision is genuinely open. Before Repository mutation, the owning Task's decision ledger must cite what settled every consequential decision or explicitly say `none`; dispositions do not transfer between Actors, surfaces, or Changes. Spawned, delegated, review, research, maintainer, and event-triggered Actors treat bounded assignments as aligned and return new consequential decisions or scope gaps to the assigning or owning Actor rather than asking the operator or expanding scope (`CONCEPTS.md:35-49`; `skills/grilling/SKILL.md`).

## Task-to-Change delivery

Backlog Tasks preserve intent, acceptance criteria, dependencies, and status. A Change is the branch, commits, and pull request used to deliver that intent.

The accountable agent follows `deliver-change`:

1. Validate the Repository's persistent Herdr project home, select an Actor-chosen, operator-renameable short label, and attach an existing Change checkout by default or create an explicitly based worktree only when needed. The accountable Pi session remains in project home and dispatches into the work session; anchor every Change tool call in the returned checkout. Stop before mutation if validation or work-session creation fails.
2. Implement and verify coherent units, then run independent `code-review` for every non-trivial Change.
3. Resolve confirmed in-scope findings, commit and push only green units, open one pull request, and pass final GitHub Checks.
4. Verify the acceptance criteria, record the final summary, and mark the Task Done in the same pull request. Done means the agreed work is complete; it does not claim operator acceptance or landing.
5. Open the verified PR in the operator's browser, show an operator notification when supported, report the URL, and arm a harness-native background watch that polls every five seconds until `MERGED` or `CLOSED` and emits one completion notification. Never merge the PR; stop after arming the watch.
6. On a disposition-watch wake or later resume, reverify disposition. If merged, prove the merge commit is reachable from fresh `origin/main`, require one uncontested registered `main` checkout whose only allowed dirt is untracked `backlog/tasks/*`, fast-forward it, and verify merge ancestry. Then retire the merged Change at source only if all rails prove the linked checkout is clean and attached to a branch merged into `origin/main`, the work session is not operator-focused, and it contains no live agent or operator-created pane/tab beyond the root placeholder. Remove the worktree without force and delete the branch with `git branch -d`; leave operator focus untouched. If any rail is unresolved—or the PR closed rather than merged—report and preserve the session, checkout, and branch (`skills/deliver-change/SKILL.md:115-180`).

Fresh-context review remains after implementation and local verification but before the first commit or publication. qq commands resolve from the checkout selected by the cockpit shell's `QQ_HOME`/`PATH`; inspect the environment and resolved executable rather than assuming they use the primary checkout. `qq-change land` and `qq-change retire` expose the synchronization and retirement rails as a stateless JSON engine with `inspect`/`--dry-run` modes, including resumable absent-workspace retirement. These adapters do not expand delivery authority: if a primary-checkout gate fails or state changes unexpectedly, report the observed state and stop without stashing, cleaning, resetting, switching, or otherwise repairing it (`bin/qq-change`; `skills/deliver-change/SKILL.md`).

## Verification and review

A Check must observe the intended subject, not merely exit successfully. Read complete output and guard against **silent failure**—plausible output that answered a different question.

`code-review` prepares Repository coordinates, Task intent, scope, threat model, applicable unenforced standards, and Check evidence without passing the author's conclusions. `qq-dispatch reviewer` starts a fresh non-interactive Codex process through the mounted read-only reviewer profile, writes its report to a temporary file, contains execution with a timeout, and retires it on process exit. The complete brief replaces generic startup orientation; context gaps cause a corrected fresh invocation rather than reviewer improvisation. The owner verifies each claimed failure with a constructed failing scenario, limits fixes to introduced in-scope regressions, and reviews correction deltas. A third confirmed occurrence of a finding class already fixed in two prior rounds trips the convergence circuit-breaker and escalates which layer should own the invariant (`skills/code-review/SKILL.md:24-52`, `54-95`, `104-133`; [`REVIEW.md`](../REVIEW.md)).

See [Verification](verification.md) for repository-specific checks and gaps.

## Specialized flows

### Bounded ticket batches

Use `delegate-batch` only after intent and plan bounds are settled. The accountable session owns judgment and delivery while composing complete temporary work-order briefs. Coupled work that shares files or an invariant becomes one sequential ticket; independent read-only work may fan out natively, and disjoint writing tickets use separate branches, worktrees, and work sessions. Run only the unblocked dependency frontier, keep at most three to five writing tickets in flight, and serialize integration. Codex is the default workspace-write executor through `qq-dispatch implementer`; it applies the mounted implementer profile, ticket-sized timeout, fresh artifact contract, MCP-off default unless `--mcp` is explicit, and the linked worktree's common/per-worktree Git-directory grants after stripping inherited `GIT_*`. A pre-output startup wedge therefore terminates and wakes the owner. The owner verifies every completion-envelope claim against the tree, and a delegate stops when it encounters a new consequential decision (`skills/delegate-batch/SKILL.md:8-98`).

Delegate visibility is best-effort glass, never workflow state or a dispatch gate. `qq-status` publishes dispatcher-owned transitions atomically, rejects redirected or symlinked status rails, reports short-lived `$stage` metadata to Herdr on a best-effort basis, and clears claimed presence/tokens at terminal disposition; `prefix+d` shows the detail-file snapshot. A missing thread after ten minutes is surfaced as blocked, timeout exit 124 as a startup/turn wedge, and completion without an envelope as failure. Clear tokens and claimed placeholder agents at terminal disposition; reconstruct after dispatcher loss from Tasks, envelopes, and worktrees rather than this surface. Alignment, plan approval, review, acceptance, and merge gates remain with the owner (`skills/delegate-batch/SKILL.md:100-252`; `cockpit/herdr/config.toml:52-60`, `129-148`).

### Difficult bugs

Use `diagnosing-bugs` when causality is unclear. Establish a discriminating reproducer, separate observations from inference, rank falsifiable hypotheses, and stop at diagnosis unless a fix is authorized. An authorized repair must fail before the fix and pass after it; add a regression Check where practical.

### Research

Use `research` for multi-source, decision-grade questions. Launch `qq-dispatch researcher` with the mounted read-only profile; keep the brief and findings file in the temporary directory, and let process exit retire the researcher. The owning agent retains judgment and verifies load-bearing citations. Prefer primary sources and preserve one durable Backlog `research` document; attach its document ID to an owning Task through the Backlog CLI rather than duplicating system truth (`skills/research/SKILL.md:8-69`).

### Human acceptance

Use `uat-signoff` after autonomous verification when behavior is visible or subjective. Present one observable check at a time and require explicit owner confirmation. Destructive, monetary, irreversible, or outbound actions still require separate just-in-time authorization.

### Knowledge capture

Use `compound` only after a verified, non-obvious solve with reusable reasoning. Update an existing lesson or create a concise solution record with Symptom, Root cause, Resolution, and Verification. Update `CONCEPTS.md` only for genuinely stable vocabulary.

Use `idea` only for messages beginning with `idea:` or explicit `$idea`; append the supplied text verbatim with a timestamp to the single Backlog `Ideas` document, without interpretation or side effects.

## Documentation update point

OpenWiki maintenance is not a step in the source agent's Task-to-Change flow, and observing a merge or `main` advance is not a trigger. An explicitly assigned on-demand or scheduled maintainer resets the long-lived `openwiki/update` worktree to fresh `origin/main`, runs generation, checks the documentation diff, obtains fresh-context review, and opens or refreshes an ordinary docs-only pull request. The operator reviews and merges it through normal GitHub Flow. The maintainer never self-merges, constructs a merge commit, publishes directly to `main`, or uses activation markers or retry protocols (`skills/openwiki-maintainer/SKILL.md:8-32`).
