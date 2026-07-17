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
timeout -k 10 3600 codex exec \
  -c 'skills.include_instructions=false' \
  -c 'skills.bundled.enabled=false' \
  -c 'mcp_servers={}' \
  --sandbox workspace-write \
  --skip-git-repo-check \
  -C <ticket-worktree-root> \
  --json \
  -o <envelope-path> \
  "Read <work-order-path> fully and perform the assignment it specifies.
You are the delegated implementer; the work order is your complete
orientation. Do not invoke skills or delegate. Your final message is the
completion envelope the work order requires." \
  > <events-path> 2> <stderr-path>
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

## Report the batch on the status surface

Follow doc-43 as amended 2026-07-16 round 4. Treat every visibility action as
best-effort glass; it never gates dispatch, the envelope contract, or the
single completion wake.

Keep one status file per Repository per orchestrator work session, using the
project-home dispatcher workspace in board-driven mode. From any path in a
primary or linked checkout, derive it exactly as follows:

```sh
repo_root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
status_dir="${TMPDIR:-/tmp}/qq-delegates${repo_root}"
status_file="${status_dir}/<dispatcher-workspace-id>.status"
```

This preserves the absolute main-checkout path below `qq-delegates`: linked
worktrees resolve to the same Repository directory, and two different
Repositories never map to the same directory. Create `status_dir` before the
first rewrite. At every dispatcher-owned boundary, write the complete next
detail document to a uniquely named temporary file in that directory, then
atomically rename it over `status_file`. Continue with the other surface calls
if the write fails.

Write one block per delegate carrying only detail the sidebar tags cannot:
the ticket id and short label; the current stage as context with the boundary
timestamp in `since <timestamp>` form; runtime and steering handle; events and
stderr artifact paths; the full untruncated reason when blocked or failed; a
one-line envelope-verification summary with Checks and pass/fail once verified;
and the PR number, URL, and final Checks state once open. Mark a handle or
runtime-inapplicable artifact as unavailable instead of inventing it. Do not
reproduce the ambient surface as a glyph table or stage summary. Remove a
delegate's block at terminal disposition.

Keep `$stage` values terse and use the settled boundary vocabulary: `queued`,
`dispatched`, `working [round/step]`, `envelope received`, `envelope verified`,
`review round N`, `PR #N open`, `BLOCKED: <short>`, and `FAILED: <short>`.
Shorten only the tag's blocked or failed reason; preserve the full reason in
the detail block.

The existing `prefix+d` popup renders the Repository's detail files as a static
snapshot. It is the only owned renderer and exists to carry what the Space and
Agent `$stage` tags cannot; create no persistent rendering surface.

After each rewrite attempt, invoke the applicable herdr calls synchronously as
fire-and-forget reporting. Track the last sequence used by each source and
choose `max(epoch seconds at call time, last-used + 1)` afresh for every call.
The result must be strictly increasing even when several calls occur in one
second; never reuse a sequence or substitute a restarting counter. Report the
stage token on the ticket work session in both modes:

```sh
herdr workspace report-metadata <ticket-work-session-id> \
  --source qq-dispatch --token stage="<one-liner>" \
  --seq <next-seq> --ttl-ms 7200000
```

In board-driven mode, report each delegate on that work session's placeholder
root pane from dispatch until terminal disposition:

```sh
herdr pane report-agent <placeholder-pane-id> \
  --source qq-dispatch --agent <label> --state working|blocked|idle \
  --message "<one-liner>" --seq <next-seq>
```

Use `working` only while the delegate process is alive, `blocked` for a
consequential-decision stop or failure awaiting disposition, and `idle` after
a normal exit while envelope, review, and PR work continues. In migrated
single-Change mode, report the same stage rollup on the accountable pane as
well as its own work session:

```sh
herdr pane report-metadata <own-pane-id> \
  --source qq-dispatch --token stage="<batch-rollup-one-liner>" \
  --seq <next-seq> --ttl-ms 7200000
```

When one work session hosts several delegates, make its single `stage` token a
batch rollup: blocked or failed outranks every routine stage, and a routine
update never overwrites a standing attention state. At the batch's terminal
disposition, clear the workspace token and, in migrated mode, the accountable
pane token; release each board-driven presence:

```sh
herdr workspace report-metadata <ticket-work-session-id> \
  --source qq-dispatch --clear-token stage --seq <next-seq>
herdr pane report-metadata <own-pane-id> \
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
publish `working` with the steering handle as soon as it appears. Never read
an events file at dispatch time and never wait or poll between boundaries.
Until the event appears, leave the stage context at `dispatched` and mark
steering unavailable; when a delegate's events file still carries no
`thread.started` ten minutes after dispatch, set `BLOCKED: no thread after
10m` and raise the attention notification — a startup wedge is
indistinguishable from this on the glass. Retain the stderr file to diagnose
a delegate that dies before its envelope. At the completion wake, reconcile a
missing envelope to `FAILED: died before envelope` and a 124 exit status to
`FAILED: startup/turn wedge (timeout)`.

Run `codex exec resume <thread-id>` only from a shell whose current working
directory is inside that delegate's Change checkout: resume derives its
sandbox writable root from the calling shell's cwd, not the session's recorded
cwd. Otherwise dispatch a fresh `codex exec -C <checkout>` for the rework.

On blocked or failed, run `herdr notification show "<ticket> needs attention"
--body "<short actionable reason>" --sound request`. Verify that the result
says it was shown; if the command fails or reports notifications disabled or
not shown, plainly report the transcript/status-surface fallback and continue.

Degrade without changing the automation contract: if herdr is down, keep
dispatching and writing the detail file; if the file write fails, keep the
sidebar current and carry the stage and details in the transcript. If a
placeholder is missing, skip that presence report while retaining the
workspace token and detail file. An absent, empty, or unflushed events file
leaves the stage context at `dispatched` until another boundary; record the gap
during envelope verification. A silent delegate death is corrected by the
completion wake. After a dead dispatcher, reconcile from durable Tasks,
envelopes, and worktrees, never from this glass.

Feed Claude-subagent delegates into the same surface. Render the runtime as
`claude`, move to `working` on the harness task-start acknowledgement, and use
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
