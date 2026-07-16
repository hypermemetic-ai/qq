---
id: doc-48
title: 'Conventions — board hygiene, Task vocabulary, board deep links'
type: guide
created_date: '2026-07-16 17:08'
updated_date: '2026-07-16 17:22'
---
# Conventions — board hygiene, Task vocabulary, board deep links

Settled under TASK-46 (operator-directed toolchain adoption, 2026-07-15;
recorded by the accountable session 2026-07-16). Each convention is cheap to
reverse; contest by editing this doc through a reviewed Change.

## Board hygiene: where backlog doctor runs

`backlog doctor` (duplicate-Task-ID audit) runs at minimum as the first step
of every Done-sweep chore, and additionally inside any board-touching Change
before its finalization commit (cheap, catches cross-worktree ID collisions
at the moment they can be repaired without history rewrites). The Done-sweep
chore itself: run doctor, then `backlog task complete` every Done Task on the
active board. Concurrent Task minting across sessions remains unsafe between
audits — mint serially in one checkout (the TASK-46 observation stands; do
not generalize the one observed skip into a guarantee).

## Task vocabulary: types and priorities

- Types: keep the backlog.md 1.48 defaults (bug, feature, enhancement, task,
  chore, docs, spike) unchanged; no design type for now — design rounds are
  documented in docs/plans and owned by ordinary Tasks. New Tasks set a type.
- Priorities: adopt High/Medium/Low for batch triage (dispatch order and
  operator attention), leaving no-priority as valid for convention/meta
  Tasks. First live use: the 2026-07-16 board-driven batch (TASK-56…61).

## Board deep links

The browser board serves /tasks/:id on the configured port (6420). Delegate
status-surface detail blocks carry a ticket line with that URL per delegate
(adopted live in the 2026-07-16 batch). Honest caveat recorded from the
TASK-59 diagnosis: no long-lived board server runs by default, so the links
resolve only while the operator has `backlog browser` up; the terminal
`backlog board` TUI has no deep-link surface. The link is a convenience
pointer, not a liveness claim.
