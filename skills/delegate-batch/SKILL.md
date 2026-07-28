---
name: delegate-batch
description: Composes complete work orders and dispatches aligned bounded tickets through isolated worktrees and stateless qq engines while the accountable session retains judgment, gates, and delivery. Use for an approved batch or an operator to-do request.
---

# Delegate a bounded ticket batch

Start after intent and plan bounds settle. The accountable session remains in
project home, owning judgment and delivery; each writing ticket gets a
worktree.

## Work orders

For adapter tickets, require production-seam acceptance tests; protocol-only
adapter evidence is never sufficient. A work order that builds on a
rebuildable derived store names the one materialization function that
rebuilds it.

At ticket creation, create one private durable run directory beneath the
delegate runtime root and write its complete work order there as `BRIEF.md`.
Include the ticket and acceptance criteria, context, exact orientation paths
and verified facts, constraints, per-ticket commit protocol, exact Checks, and
the required completion envelope. The brief exists at dispatch by construction.
Keep delegate scratch, temporary files, redirected logs, generated helpers, and
caches beneath this run directory. Writers never push, open pull requests, or
edit `backlog/`. Durable intent stays in the checkout's Task. The `subagent`
task is `Read-and-perform:<absolute-run-dir>/BRIEF.md`.

- Couple shared files or invariants; work sequentially.
- Fan out independent reads; give writers disjoint branches, worktrees, and
  non-Git resources.
- Run only the dependency-derived ready frontier. Frontier membership alone
  never authorizes overlap: check accountable ownership and conflicts first.
  Child suffixes are non-ordinal, and no durable `parallel_with` relation exists.
- Cap writers at 3–5; serialize integration.

## Dispatch and status

Dispatch environment and config: README Install. The globally mounted
extension selects the active qq checkout for qq worktrees and canonical qq
primary `main` elsewhere; `cwd` selects the assigned Git worktree.

Pass the ticket's absolute run directory as `QQ_DISPATCH_RUN_DIR` for its
exact dispatch:

```ts
// QQ_DISPATCH_RUN_DIR=<absolute-run-dir>
subagent({agent:"implementer",task:"Read-and-perform:<absolute-run-dir>/BRIEF.md",acceptance:{level:"none",reason:"per the manifests"},cwd:"<absolute-worktree>",context:"fresh",async:true})
```

The delegate writes its only result to `<absolute-run-dir>/ENVELOPE.md` per
`delegation/manifests/ENVELOPE.md`; no envelope means the ticket is not
complete, and a delegate ending on a user message has failed. The adapter
writes `<absolute-run-dir>/TERMINAL` when the child exits. Keep each active run
directory and sweep its `TERMINAL` on every inbound event so asynchronous
completions are incorporated.

Keep the subagent id and `details.asyncDir`. Inspect only at lifecycle
boundaries: fleet state, the run directory, `status.json`, `events.jsonl`,
output, and the subagent log. No start after ten minutes blocks with `no thread
after 10m`; a terminal nonzero fails. A review-infrastructure failure gets one
resume with the source run's recorded `timeoutMs`, then is
`inconclusive-under-substrate`—never ask the operator to restate it. Resume
passes the source run's recorded `timeoutMs` and no contract override.
Reconstruct from Tasks, run directories, artifacts, transcripts, and
worktrees.

After the first recognized `/dev/fd` or equivalent substrate failure, record
the Check once as `inconclusive-under-substrate` and do not rerun it in the
child. The owner's native rerun plus CI is binding green.

## Verify and close

The envelope reports status, commits, files, Check results, decisions,
questions, risks, branch, and worktree. Read complete Check output; exit status
alone is not the result. Resolve a warning naming an in-scope corrective action
or list it in unresolved risks; never report it only as `pass`. Verify every
envelope claim against the tree before publishing `envelope-verified`; claims
are not evidence.

The owner may steer rework but never transfers lifecycle, alignment, review, or
delivery. New decisions and scope gaps return to the assigner. Retain the five
gates—intent alignment, plan approval, review verdict, acceptance, merge—and
route every Change through `code-review` and `deliver-change`.
