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

At ticket creation, the owner creates one private mode-700 durable run directory
beneath the delegate runtime root and writes its complete work order as `BRIEF.md`.
Include the ticket, acceptance criteria, context, exact orientation paths and
verified facts, constraints, commit protocol, exact Checks, and required completion
envelope. `BRIEF.md` exists by construction at dispatch and maps supporting
files or directories beside it.
Before dispatch, the owner runs every literal Check exactly as written from the
target worktree and records the baseline outcome in brief-mapped material. A
Check that cannot run as written is a work-order defect—fix the order; never
dispatch around it. `cache/` is disposable child/runtime storage, not for
parent handoff. Keep scratch and generated helpers beneath it. Writers
never push, open pull requests, or edit `backlog/`. Durable intent stays in the
checkout's Task.

- Couple shared files or invariants; work sequentially.
- Fan out independent reads; give writers disjoint branches, worktrees, and
  non-Git resources.
- Run only the dependency-derived ready frontier. Frontier membership alone
  never authorizes overlap: check accountable ownership and conflicts first.
  Child suffixes are non-ordinal, and no durable `parallel_with` relation exists.
- Cap writers at 3–5; serialize integration.

## Dispatch and status

This is the canonical dispatch contract; other skills cite it instead of
restating it.

Invoke the assigned worktree's resident engine. It resolves that checkout's Pi
wrapper, manifests, and execution-profile policy and rejects a `--cwd` outside
its Git common directory. For one ticket, use the prompt-returning path:

```sh
<assigned-worktree>/bin/qq-delegate start --role implementer \
  --cwd <absolute-worktree> --brief <absolute-run-dir>/BRIEF.md
```

For fan-out, make `<absolute-batch.json>` a JSON array of
`{"role","cwd","brief"}` tickets and start its ready frontier:

```sh
<assigned-worktree>/bin/qq-delegate start-batch <absolute-batch.json>
```

Acceptance emits exact run ID/directory and returns the prompt. Retain both;
never scan by ID. Exact-path `status` is bounded/nonwaiting; `wait` is the only
lifecycle wait; `collect` verifies exact `TERMINAL` v2 and `ENVELOPE.md`,
preserving child exit. `run` and `batch` remain blocking compatibility.

A nonzero terminal or refused/missing envelope fails. On infrastructure failure
(engine refusal, timeout, or substrate), retry once in a fresh directory with
that brief. Spent directories are refused. Use manifest `timeoutMs`; a second
failure is `inconclusive-under-substrate`, never an operator restatement.

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
