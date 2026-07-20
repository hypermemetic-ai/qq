---
name: delegate-batch
description: Composes complete work orders and dispatches aligned bounded tickets through isolated worktrees and stateless qq engines while the accountable session retains judgment, gates, and delivery. Use for an approved batch or an operator request to work the to-do list.
---

# Delegate a bounded ticket batch

Start only after intent and plan bounds settle. For aligned or board-driven
work, the accountable session stays in the project home and owns judgment and
delivery; each writing ticket gets its own work session and worktree.

## Work orders and shape

Write one complete brief per ticket under the OS temporary directory. Include
the ticket and acceptance criteria, necessary batch context, exact orientation
paths and verified facts, hard constraints, commit protocol, exact Checks, and
required completion envelope. Writing delegates work locally, never push or
open pull requests, and never edit `backlog/`. Keep durable intent in the Task;
the runtime prompt is only `qq-dispatch`'s file pointer.

- Couple shared files or invariants and work them sequentially.
- Fan out independent read-only work natively; give independent writers
  disjoint branches, worktrees, work sessions, and non-Git resources.
- Run only a dependency chain's unblocked frontier. Keep at most 3–5 writing
  tickets in flight and serialize integration.

## Dispatch and status

From each ticket worktree call:

```sh
qq-dispatch implementer \
  --root <worktree> --brief <brief> --output <envelope> \
  --events <events> --stderr <stderr>
```

Substitute only absolute paths under the OS temporary directory; never place
ticket prose on the command line. The engine owns isolation, containment, role
configuration, artifacts, and completion wake. Opt into external knowledge
only when the brief requires it; use a harness-native subagent only for tools or
judgment beyond the plan bound.

At every dispatcher boundary call `qq-status` with `queued`, `dispatched`,
`working`, `envelope-received`, `envelope-verified`, `review`, `pr-open`,
`blocked`, `failed`, or `terminal`, supplying its identities and event details.
It owns atomic stage reporting, sequencing, notifications, cleanup, and Herdr
degradation; this glass never gates work.

Inspect each live events file once at natural boundaries. Publish `working`
when `thread.started` supplies its handle. If absent ten minutes after dispatch,
publish `blocked` with `no thread after 10m`; never poll. At completion publish
`failed` for exit 124 or a missing envelope, otherwise `envelope-received`.
Reconstruct after dispatcher loss from Tasks, envelopes, and worktrees.

## Verify and close

The envelope reports per-ticket status, commits, files, Check results,
contestable decisions, open questions, risks, branch, and worktree. It always
displays parallel, never-blended net production-LOC and decision-point deltas
for every fix commit. Verify every claim against the tree before publishing
`envelope-verified`.

Growth in either counter spends one mechanical `same fix, smaller`
regeneration. Checks pass and strictly smaller takes it; otherwise the original
stands without justification prose.

The owner may steer rework but never transfers lifecycle, alignment, review, or
delivery. New decisions and scope gaps return to the assigner. Retain the five
gates—intent alignment, plan approval, review verdict, acceptance, and merge—
and route every Change through `code-review` and `deliver-change`.
