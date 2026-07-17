---
id: doc-48
title: 'Conventions — board hygiene, Task vocabulary, board deep links'
type: guide
created_date: '2026-07-16 17:08'
updated_date: '2026-07-17 01:33'
---
# Conventions — board hygiene, Task vocabulary, board deep links

Settled under T-46 (operator-directed toolchain adoption, 2026-07-15;
recorded by the accountable session 2026-07-16). Each convention is cheap to
reverse; contest by editing this doc through a reviewed Change.

## Board hygiene: where backlog doctor runs

`backlog doctor` (duplicate-Task-ID audit) runs at minimum as the first step
of every Done-sweep chore, and additionally inside any board-touching Change
before its finalization commit (cheap, catches cross-worktree ID collisions
at the moment they can be repaired without history rewrites). The Done-sweep
chore itself: run doctor, then `backlog task complete` every Done Task on the
active board. Concurrent Task minting across sessions remains unsafe between
audits — mint serially in one checkout (the T-46 observation stands; do
not generalize the one observed skip into a guarantee).

## Task id scheme: T-n

Adopted 2026-07-16 under T-65 (operator-directed one-time rename from the
original TASK-n scheme). Task ids use the prefix `t`: files are `t-n`, ids
render as `T-n`. The backlog CLI refuses `config set taskPrefix` after init
by design; the migration edited `task_prefix` in `backlog/config.yml`
directly and renamed every task file and id in the same Change (verified:
list, view, create, and doctor all resolve the migrated ids).

Boundary rules, settled here so nobody re-derives them:

- Pre-cutover git history, PR titles, and branch names keep the TASK-n /
  task-n spellings permanently — grep both spellings when doing archaeology
  across the cutover.
- Lowercase `task-n` strings in Task records that name other projects' tasks
  (deciq, deciq-logic), historical branch or worktree names, or quoted
  evidence paths were deliberately left unchanged: they are verbatim
  identifiers of things outside this repo's id scheme, not vocabulary.

## Task vocabulary: types and priorities

- Types: keep the backlog.md 1.48 defaults (bug, feature, enhancement, task,
  chore, docs, spike) unchanged; no design type for now — design rounds are
  documented in docs/plans and owned by ordinary Tasks. New Tasks set a type.
- Priorities: adopt High/Medium/Low for batch triage (dispatch order and
  operator attention), leaving no-priority as valid for convention/meta
  Tasks. First live use: the 2026-07-16 board-driven batch (T-56…61).

## Board deep links

The browser board serves /tasks/:id on the configured port (6420). Delegate
status-surface detail blocks carry a ticket line with that URL per delegate
(adopted live in the 2026-07-16 batch). Honest caveat recorded from the
T-59 diagnosis: no long-lived board server runs by default, so the links
resolve only while the operator has `backlog browser` up; the terminal
`backlog board` TUI has no deep-link surface. The link is a convenience
pointer, not a liveness claim.
## Task truth: the hybrid convention

Settled by the operator 2026-07-16, closing the open decision in doc-46. A
Task record is born and kept current in the primary `main` checkout's
working tree: mint, status flips, and in-flight notes happen there through
the Backlog CLI, so the board renders live truth for the work that is
actually moving. At finalization the owning Actor moves the record file
into the Change's checkout with a single `mv`, then records Done, the final
summary, and AC checks there; the record lands in the same pull request as
its code.

Consequences: delegate worktrees never edit anything under `backlog/`; pull
collisions are prevented by construction (the primary copy is gone before
its merge returns); a finalizing Task briefly leaves the board between the
move and merge-plus-pull. Until the backlog.md release that ships the
BACK-547 repaint fix, restart boards after sweeps (T-66).
