---
id: decision-9
title: Work sessions retired — session-absent as the default Change posture (T-129)
date: '2026-07-21 06:21'
status: accepted
---
## Context

The per-Change Herdr work-session workspace predates the pi-subagents
substrate. Its root placeholder pane once carried delegate presence and
stage reporting (killed by decision-3); its remaining load was the
retire-census ownership marker. Since T-95, delegates are headless child
processes with `cwd` set to the Change worktree — they hold no panes — and
the accountable owner dispatches from the project home. The result: every
in-flight Change spawned a workspace under the qq space holding only an
empty shell pane — operator-visible clutter with no payoff ("empty panes
for each worktree under their space", operator, 2026-07-21).

The retire engine already implements a session-absent path
(`bin/qq-change retire --checkout <path> --workspace-absent-owned`, gated on
the executing owner verifiably owning the Change delegate lifecycle), and
`bin/qq-reap` already tolerates absent placeholder evidence. Cockpit
attachment was already best-effort and never blocked delivery.

The session-migration alternative — moving the interactive session into the
worktree workspace so it consumes the placeholder pane — was considered and
abandoned by the operator (verbatim, 2026-07-21: "I abandon the movement
idea. it doesn't work in practice, like with multiple subagents, each in a
different worktree (this should be how it works), can't move to multiple
worktrees."). The multi-worktree delegate fan-out is affirmed as the
correct model.

## Decision

Stop creating per-Change Herdr work-session workspaces. Changes are born as
plain linked worktrees; session-absent retirement is the default Change
posture. This supersedes the work-session-creation half of the T-70
convention; T-70's dispatch-from-project-home posture stands unchanged.
Approved by the operator 2026-07-21 (alignment exchange and approved plan,
doc-74, owning Task t-129).

## Consequences

- deliver-change step 2 creates no Herdr workspace; step 11's canonical
  retire invocation is the session-absent form. The `--placeholder-pane`
  form remains for retiring legacy work sessions (e.g. T-122's parked w71)
  until none remain; no migration of existing sessions.
- Engines stay byte-identical: qq-change, qq-reap, qq-herdr-pull,
  qq-herdr-home, qq-herdr-snap.
- Accepted costs, named at approval: `qqcd` focused-worktree jumps die by
  absence (its `QQ_HOME` fallback is by construction); the CONCEPTS
  "work session" glossary entry is retired; in-flight Change visibility
  rests on the Backlog board (T-88 cross-worktree aggregation), not on
  workspace grouping.
- No alt+up/down rebind and no herdr-side requests: with no worktree
  entries under the space, there is nothing to skip.
- `qq-herdr-pull --workspace` remains an operator-invocable mover for any
  workspaces that still exist; its binary is unchanged.
- T-129 itself is the first Change born session-absent; its retirement
  exercises `--workspace-absent-owned` as the default posture in live use.
