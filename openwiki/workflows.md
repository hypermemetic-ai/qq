# Workflows

## Orient, align, act

Start from the assignment and context already provided, and read `CONCEPTS.md` before working. Resolve only material gaps through the surfaces that own them: Backlog Tasks, documents, and decisions for durable intent and history; relevant OpenWiki pages for the landed system; codebase-memory for architecture, dependencies, call paths, and impact; and source plus fresh Checks for verification. Use Backlog's CLI for its records. If a derived surface is stale or conflicts with source and Checks, trust the latter and report the conflict.

For a genuinely new work item, `grilling` owns the default alignment interview only when the Actor is the operator-facing accountable owner. Spawned, delegated, review, research, maintainer, and event-triggered Actors treat bounded assignments as aligned and execute within their boundary; if a new consequential decision or scope gap appears, they stop and return it to the assigning or owning Actor rather than asking the operator or expanding scope. The owner resumes alignment when such a decision emerges or the work crosses the agreed boundary. Grilling does not rerun merely because already aligned work continues. Other procedures apply only when the relevant Skill's trigger and actor boundary match; there is no blanket requirement to invoke every Skill or search every knowledge surface.

## Task-to-Change delivery

Backlog Tasks preserve intent, acceptance criteria, dependencies, and status. A Change is the branch, commits, and pull request used to deliver that intent.

The accountable agent follows `deliver-change`:

1. Validate the Repository's persistent Herdr project home and dedicated Backlog-board tab. Agree a unique short change label, create or open the explicitly based linked worktree beneath that home, adopt its work session, and anchor every tool call in the returned checkout. Stop before mutation if validation or adoption fails.
2. Implement and verify coherent units, then run independent `code-review` for every non-trivial Change.
3. Resolve confirmed in-scope findings, commit and push only green units, open one pull request, and pass final GitHub Checks.
4. Verify the acceptance criteria, record the final summary, and mark the Task Done in the same pull request. Done means the agreed work is complete; it does not claim operator acceptance or landing.
5. Open the verified PR in the operator's browser and monitor its disposition for the full three-minute window without ever merging it.
6. If merged, verify the merge commit is on fresh `origin/main` and fast-forward the single clean registered `main` checkout to a frozen target OID. At terminal disposition, keep the accountable and operator-created panes and tabs, work-session workspace, and checkout intact for inspection, then focus the validated home board without moving the accountable pane; only the operator retires the session later. Temporary delegate panes are removed by the agents that spawned them after their final contribution. If closed, report and apply the unmet-criterion or changed-intent rule. If still open after the window, report its URL and Checks.

Fresh-context review remains after implementation and local verification but before the first commit or publication. Installed qq commands are live links into whichever checkout ran `bin/install.sh`; identify the actual symlink target and unexpected writer rather than assuming they use the primary checkout. After a tracked directory move, only a checkout that had ignored artifacts at the old path can strand them when it advances. The solution documents record diagnostic evidence and aligned preservation guidance, but they do not expand delivery authority: if a primary-checkout gate fails or its state changes unexpectedly, report the observed state and stop canonical delivery without mutating the primary checkout. Moving, quarantining, removing, cleaning, resetting, changing branches, or any other remediation or mutation requires separate operator authorization. Later read-only status, branch, cleanliness, ancestry, and symlink-target checks may be rerun to observe that an external resolution occurred; after the blocking state is resolved, canonical delivery can resume (`bin/install.sh:5`, `145-150`; `backlog/docs/solutions/doc-36 - A-tracked-directory-move-strands-ignored-build-artifacts-in-every-checkout.md:17-45`; `backlog/docs/solutions/doc-37 - Installed-commands-act-on-the-primary-checkout-and-race-post-merge-syncs.md:17-44`; `skills/deliver-change/SKILL.md:93-121`). The detailed refusal rules for browser visibility, primary-main synchronization, and terminal work-session disposition—including which panes are retained for inspection and reserving session retirement for the operator—are canonical in `skills/deliver-change/SKILL.md:11-132`.

For non-trivial work, `bpmn-plans` preserves every task-specific action, decision, failure path, and acceptance Check, then collapses the inherited review/commit/push/PR/Checks mechanics into one `Complete qq Change delivery` call activity immediately before `Green PR ready`. Merge, synchronization, work-session disposition, conformance recording, and Task finalization remain outside that modeled boundary. Candidate generation is private: only the final stored, linked, verified plan is opened for the operator, exactly once when its approval question is ready; an unchanged version is not reopened (`skills/bpmn-plans/SKILL.md:21-42`, `56-90`).

## Verification and review

A Check must observe the intended subject, not merely exit successfully. Read complete output and guard against **silent failure**—plausible output that answered a different question.

`code-review` prepares repository coordinates, Task intent, scope, and Check evidence for a fresh read-only reviewer without passing the author’s conclusions. In Herdr, the reviewer starts as a right split in the owning work-session tab without taking focus; the owning agent confirms that placement and a new agent session before sending work. That complete brief finishes the reviewer's orientation: the reviewer does not run a generic start-of-work sequence, broadly search knowledge surfaces, invoke unrelated Skills, delegate further, or change state. The owning agent verifies reported findings, retains the pane through any delta review, then closes it and verifies removal; a missing report, repeated unavailability, or cleanup failure blocks completion. Fixes are limited to regressions introduced by the Change and within agreed scope; discovering a broader issue is evidence, not automatic authorization to expand work (`skills/code-review/SKILL.md:46-59`, `81-99`).

See [Verification](verification.md) for repository-specific checks and gaps.

## Specialized flows

### Difficult bugs

Use `diagnosing-bugs` when causality is unclear. Establish a discriminating reproducer, separate observations from inference, rank falsifiable hypotheses, and stop at diagnosis unless a fix is authorized. An authorized repair must fail before the fix and pass after it; add a regression Check where practical.

### Research

Use `research` for multi-source, decision-grade questions. In Herdr, launch the fresh read-only researcher as a right split in the owning work-session tab without taking focus and confirm the placement before sending work; outside Herdr, use the cleanest fresh-context mechanism and report that pane placement was unavailable. The owning agent retains judgment, verifies load-bearing citations, and after the final contribution and follow-up closes the temporary pane and verifies removal. Prefer primary sources and preserve one durable Backlog `research` document; attach its document ID to an owning Task rather than duplicating system truth (`skills/research/SKILL.md:8-24`).

### Human acceptance

Use `uat-signoff` after autonomous verification when behavior is visible or subjective. Present one observable check at a time and require explicit owner confirmation. Destructive, monetary, irreversible, or outbound actions still require separate just-in-time authorization.

### Knowledge capture

Use `compound` only after a verified, non-obvious solve with reusable reasoning. Update an existing lesson or create a concise solution record with Symptom, Root cause, Resolution, and Verification. Update `CONCEPTS.md` only for genuinely stable vocabulary.

Use `idea` only for messages beginning with `idea:` or explicit `$idea`; append the supplied text verbatim with a timestamp to the single Backlog `Ideas` document, without interpretation or side effects.

## Documentation update point

OpenWiki maintenance is not a step in the source agent's Task-to-Change flow. After an eligible operator merge, the browser/local activation adapter launches or wakes a separate maintainer Actor. That Actor regenerates from landed `origin/main`, independently reviews narrative and any diagrams, and delivers a documentation-only pull request. If `main` advances first, the old generated Change is superseded rather than queued (`skills/openwiki-maintainer/SKILL.md:12-33`, `109-130`).

That green documentation Change is the sole exception to ordinary operator-controlled merging. The maintainer revalidates PR state, checks, reviewed head, and exact scope; requires both fetched `origin/main` and the PR's live base SHA to equal the run's immutable target; builds and verifies a two-parent merge commit without moving local refs; and makes one ordinary non-force push to `main`. A concurrent advance is rejected atomically and causes regeneration, while another unresolved refusal preserves evidence and stops. It never uses GitHub merge commands, queues, force, admin, or protection bypasses (`skills/openwiki-maintainer/SKILL.md:115-161`).

[![Guarded OpenWiki merge process](processes/openwiki_guarded_merge.png)](processes/openwiki_guarded_merge.png)

Review correction is intentionally bounded. A diagram-only defect may remove its JSON/BPMN/PNG/link as one reversible bundle when the page remains coherent. Other defects return the fully staged generated result to `qq-openwiki --correct`; another round is allowed only when findings materially decrease without comparable regressions. Initial generation gets one clean retry, not an unbounded loop (`skills/openwiki-maintainer/SKILL.md:66-106`).
