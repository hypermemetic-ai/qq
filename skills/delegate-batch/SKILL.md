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
  dispatcher—the same project-home posture deliver-change step 1 binds for a
  single Change—while every writing ticket gets its own work session.

In both modes, the operator talks to the accountable session. That session
owns the batch, judgment, and delivery lifecycle.

## Compose the work order

Write one complete work-order brief per delegated ticket under the OS temporary
directory. The brief is the delegate's complete orientation and the plan bound;
include:

- the ticket and its acceptance criteria, plus any batch context it needs;
- exact orientation paths and reconciliation facts the owner already verified;
- hard constraints, including local-only work, no push, no pull request, and
  no edits under `backlog/` at all — under the hybrid Task-truth convention
  (doc-48) the record lives in the primary checkout until the owner's
  finalization move, and managed Backlog markdown is CLI-edited only;
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
qq-dispatch implementer \
  --root <ticket-worktree-root> \
  --brief <work-order-path> \
  --output <envelope-path> \
  --events <events-path> \
  --stderr <stderr-path>
```

Substitute only the bracketed paths; keep all other prompt text exact. Never
place ticket content or other free text on the command line, where shell
quoting can execute it before the sandbox exists.

The `timeout -k 10 3600` wrapper contains the startup wedge (doc-45): a
`codex exec` that parks before its first byte would otherwise never exit,
and process exit is the only completion wake. Plain `timeout` signals its
own process group and reaps the full codex process tree (probe-verified,
2026-07-16); never wrap it in `setsid`, which detaches the group and leaks
the tree. Tune the bound to the ticket, not below real work time.
`mcp_servers={}` spawns delegates MCP-less, removing the per-spawn network
fetch that dominates wedge probability; a ticket that genuinely needs an MCP
server omits that override deliberately and says so in its work order.

Keep both the work order and completion envelope in the OS temporary
directory. Put each delegate's events and stderr files there beside them.

Use a Claude subagent instead only when the assignment needs harness-native
tools or judgment beyond the plan's bounds. This is the operator-settled split:
Fable composes plans, briefs, and verdicts; codex executes within them.

## Report the batch on the Herdr glass

The detail-file half of doc-43's status surface is deleted (decision-3,
T-116); what remains is the Herdr glass half, which is decided-dead with its
removal parked under T-95 — run it as written until then. Follow doc-43's Herdr
reporting contract. Treat every visibility action as best-effort glass; it
never gates dispatch, the envelope contract, or the single completion wake.

Keep `$stage` values terse and use the settled boundary vocabulary: `queued`,
`dispatched`, `working [round/step]`, `envelope received`, `envelope verified`,
`review round N`, `PR #N open`, `BLOCKED: <short>`, and `FAILED: <short>`.

At every dispatcher-owned boundary, invoke the applicable herdr calls
synchronously as fire-and-forget reporting. Track the last sequence used by
each source and choose `max(epoch seconds at call time, last-used + 1)` afresh
for every call. The result must be strictly increasing even when several calls
occur in one second; never reuse a sequence or substitute a restarting counter.
Report the stage token on the ticket work session in both modes:

```sh
herdr workspace report-metadata <ticket-work-session-id> \
  --source qq-dispatch --token stage="<one-liner>" \
  --seq <next-seq> --ttl-ms 7200000
```

In both modes, report each delegate on its work session's placeholder
root pane from dispatch until terminal disposition:

```sh
herdr pane report-agent <placeholder-pane-id> \
  --source qq-dispatch --agent <label> --state working|blocked|idle \
  --message "<one-liner>" --seq <next-seq>
```

Use `working` only while the delegate process is alive, `blocked` for a
consequential-decision stop or failure awaiting disposition, and `idle` after
a normal exit while envelope, review, and PR work continues.

When one work session hosts several delegates, make its single `stage` token a
batch rollup: blocked or failed outranks every routine stage, and a routine
update never overwrites a standing attention state. At the batch's terminal
disposition, clear the workspace token and release each delegate's presence:

```sh
herdr workspace report-metadata <ticket-work-session-id> \
  --source qq-dispatch --clear-token stage --seq <next-seq>
herdr pane release-agent <placeholder-pane-id> \
  --source qq-dispatch --agent <label> --seq <next-seq>
```

Calculate a distinct `next-seq` for each command above. TTL is only the
dead-owner backstop; keep it near twice the dispatch bound (7200000 for the
default 3600-second bound) so an orphaned claim outlives a wedged delegate's
containment, not the workday. If any report or release fails, log that
channel once and continue.

At every dispatcher-owned boundary after dispatch, sweep each non-terminal
delegate's events file — one head-read apiece — for `thread.started`, and
publish `working` as soon as it appears; the thread id it reveals is the
delegate's steering handle. Never read
an events file at dispatch time and never wait or poll between boundaries.
Until the event appears, leave the stage context at `dispatched`; when a
delegate's events file still carries no
`thread.started` ten minutes after dispatch, set `BLOCKED: no thread after
10m` and raise the attention notification — a startup wedge is
indistinguishable from this on the glass. Retain the stderr file to diagnose
a delegate that dies before its envelope. At the completion wake, reconcile a
missing envelope to `FAILED: died before envelope` and a 124 exit status to
`FAILED: startup/turn wedge (timeout)`.

Run resume dispatches under the same containment as fresh ones —
`timeout -k 10 3600 codex exec resume <thread-id>`, with the MCP-less
override and events, envelope, and stderr files of the original dispatch —
and only from a shell whose current working directory is inside that
delegate's Change checkout: resume derives its sandbox writable root from
the calling shell's cwd, not the session's recorded cwd. Otherwise
dispatch a fresh `codex exec -C <checkout>` for the rework.

On blocked or failed, run `herdr notification show "<ticket> needs attention"
--body "<short actionable reason>" --sound request`. Verify that the result
says it was shown; if the command fails or reports notifications disabled or
not shown, plainly report the transcript fallback and continue.

Degrade without changing the automation contract: if herdr is down, keep
dispatching and carry the stage in the transcript. If a placeholder is missing,
skip that presence report while retaining the workspace token. An absent,
empty, or unflushed events file leaves the stage context at `dispatched` until
another boundary; record the gap during envelope verification. A silent
delegate death is corrected by the completion wake. After a dead dispatcher,
reconcile from durable Tasks, envelopes, and worktrees, never from this glass.

Feed Claude-subagent delegates into the same surface. Move to
`working` on the harness task-start acknowledgement, and use
the subagent id through `SendMessage` as the steering handle.

## Verify the envelope and retain the gates

Require every delegate's final message to report per-ticket status, commits,
files changed, Checks run with results, decisions taken that the operator might
contest, open questions, unresolved risks, and the branch and worktree that
contain the work. Verify every claim against the tree; an envelope claim is not
yet evidence.

The owner may steer a live delegate by resuming its Codex session under the
Change-checkout cwd rule above or messaging its Claude subagent, but never
hands over the lifecycle. Delegates do not run alignment interviews, reviews,
or delivery. If a ticket encounters a new consequential decision, its delegate
records the decision in the envelope and stops that ticket.

The five gates remain unchanged: intent alignment, plan approval, review
verdict, acceptance, and merge. Each ticket's Change still passes code-review
and lands through deliver-change.
