---
name: delegate-batch
description: Delegates aligned batches of bounded tickets through isolated, codex-first work sessions while the accountable session retains judgment and delivery. Use when aligned new work decomposes into a ticket batch or the operator asks the accountable session to work the to-do list.
---

# Delegate a bounded ticket batch

Use this skill only after intent and plan bounds are settled. It has two entry
points:

- **Aligned new work:** the approved work decomposes into a batch of bounded
  tickets.
- **Board-driven dispatch:** the operator asks the accountable session to work
  the to-do list. The accountable session stays in the project home as the
  dispatcher—an explicit exception to deliver-change step 1—while every
  writing ticket gets its own work session.

In both modes, the operator talks to the accountable session. That session
owns the batch, judgment, and delivery lifecycle.

## Compose the work order

Write one complete work-order brief per delegated ticket under the OS temporary
directory. The brief is the delegate's complete orientation and the plan bound;
include:

- the ticket and its acceptance criteria, plus any batch context it needs;
- exact orientation paths and reconciliation facts the owner already verified;
- hard constraints, including local-only work, no push, no pull request, and
  Backlog CLI-only edits to managed Backlog markdown;
- the per-ticket commit protocol;
- the exact Checks to run; and
- the required completion envelope.

Keep durable intent in the ticket and complete orientation in the brief, not in
the transcript. The runtime prompt is only the fixed pointer below.

## Select the work shape

- Same files or one shared invariant: coupled work is one ticket. Merge or
  rescope tickets that would write the same files before dispatching anything,
  then work the resulting ticket sequentially in its own session and worktree.
- Independent read-only work: fan out through native read-only workers.
- Independent writing tickets with disjoint ownership: fan out into separate
  branches, worktrees, and work sessions.
- A dependency chain: run only its currently unblocked frontier.

Keep at most 3–5 writing tickets in flight. Operator review and decision
bandwidth, not model capacity, sets the limit. Serialize integration even when
implementation fans out.

Give each writing ticket one dedicated git worktree. Delegates never share a
checkout with one another or with the accountable session. Namespace ports,
caches, generated artifacts, temporary directories, and other non-Git
resources per worktree.

## Dispatch codex-first

Within plan bounds, default execution to Codex's non-interactive runner in a
workspace-write sandbox confined to the ticket's worktree:

```sh
codex exec \
  -c 'skills.include_instructions=false' \
  -c 'skills.bundled.enabled=false' \
  --sandbox workspace-write \
  --skip-git-repo-check \
  -C <ticket-worktree-root> \
  -o <envelope-path> \
  "Read <work-order-path> fully and perform the assignment it specifies.
You are the delegated implementer; the work order is your complete
orientation. Do not invoke skills or delegate. Your final message is the
completion envelope the work order requires."
```

Substitute only the bracketed paths; keep all other prompt text exact. Never
place ticket content or other free text on the command line, where shell
quoting can execute it before the sandbox exists. Keep both the work order and
completion envelope in the OS temporary directory.

Use a Claude subagent instead only when the assignment needs harness-native
tools or judgment beyond the plan's bounds. This is the operator-settled split:
Fable composes plans, briefs, and verdicts; codex executes within them.

## Verify the envelope and retain the gates

Require every delegate's final message to report per-ticket status, commits,
files changed, Checks run with results, decisions taken that the operator might
contest, open questions, unresolved risks, and the branch and worktree that
contain the work. Verify every claim against the tree; an envelope claim is not
yet evidence.

The owner may steer a live delegate by resuming its Codex session or messaging
its Claude subagent, but never hands over the lifecycle. Delegates do not run
alignment interviews, reviews, or delivery. If a ticket encounters a new
consequential decision, its delegate records the decision in the envelope and
stops that ticket.

The five gates remain unchanged: intent alignment, plan approval, review
verdict, acceptance, and merge. Each ticket's Change still passes code-review
and lands through deliver-change.
