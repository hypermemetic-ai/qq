---
name: delegate
description: Composes one complete bounded work order and dispatches it through an isolated worktree and stateless qq engine while the accountable owner retains judgment, gates, and delivery. Use after one ticket is approved; use bounded batch support only for a dependency-derived set of genuinely independent tickets.
---

# Delegate bounded work

Start with one ticket after intent and plan bounds settle. The accountable owner retains judgment, acceptance, and delivery. Each writing ticket gets its assigned isolated worktree; read-only tickets may share a checkout only when their resources and run directories do not collide.

## Complete work order

At ticket creation, create one private mode-700 durable run directory beneath the delegate runtime root and write its complete work order as `BRIEF.md`. Include the ticket and acceptance criteria, exact orientation paths and owner-verified facts, constraints and ownership fences, commit protocol, exact Checks, and the required completion envelope. Map supporting files beside the brief. Keep scratch and generated helpers under its `cache/`; never use child cache as the handoff.

Run every literal Check exactly as written from the target worktree before dispatch and preserve the baseline in brief-mapped material. A Check that cannot run literally is a work-order defect; repair the order rather than dispatching around it. For adapters, require production-seam acceptance evidence; protocol-only evidence is insufficient. If work builds on a rebuildable derived store, name the one materialization function that reconstructs it.

Writers never push, open pull requests, edit managed Backlog Markdown, or cross another worktree. Couple tickets that share files or invariants. Fan out only independent work, after checking accountable ownership and whole-Change conflicts. Run only the dependency-derived ready frontier; suffix order and frontier membership do not authorize overlap. Keep writers to 3–5 and serialize integration.

## Dispatch

Invoke the assigned worktree's resident engine. It validates that checkout's Pi wrapper, canonical manifest, execution profile, role prompt, methodology kernel, and selected Skills.

For one ticket:

```sh
<assigned-worktree>/bin/qq-delegate start --role implementer \
  --cwd <absolute-worktree> --brief <absolute-run-dir>/BRIEF.md
```

An authorized work order may add repeatable `--skill writing-for-clients` only for an Implementer or Reviewer. Implementers always receive `diagnosing-bugs`; other selection names, duplicates, malformed values, and role-disallowed selections refuse before child launch.

For a bounded independent frontier, write an absolute JSON file containing 1–12 tickets. Existing tickets use exact keys `role`, `cwd`, and `brief`; a ticket that selects Skills adds an exact `skills` string array:

```json
[{"role":"implementer","cwd":"/absolute/worktree","brief":"/absolute/run/BRIEF.md","skills":["writing-for-clients"]}]
```

Then run:

```sh
<assigned-worktree>/bin/qq-delegate start-batch <absolute-batch.json>
```

Acceptance emits exact run ID/directory and returns promptly. Retain both; never scan by ID. Exact-path `status` is bounded and nonwaiting, `wait` is the only lifecycle wait, and `collect` verifies exact `TERMINAL` v2 plus `ENVELOPE.md` while preserving child exit. `run` and `batch` remain blocking compatibility.

A nonzero terminal or refused/missing envelope fails. On engine refusal, timeout, or substrate failure, retry once with the same brief in a fresh directory. Spent directories are refused. A second infrastructure failure is `inconclusive-under-substrate`, never an operator restatement. After the first recognized `/dev/fd` or equivalent substrate failure, record that Check once as inconclusive and leave the owner's native rerun plus CI as binding evidence.

## Verify and close

The envelope reports status, commits, files, Check evidence, contestable decisions, questions, risks, branch, and worktree. Read complete output; exit status alone is not a result. A warning that names an in-scope corrective action remains unresolved until corrected. Verify every envelope claim against the tree before publishing `envelope-verified`; the envelope is not authority.

Steer bounded rework without transferring lifecycle, alignment, review, or delivery. A new decision or scope gap returns to the assigner. The Change Owner applies the intrinsic lifecycle and routes non-trivial artifacts through `review`.
