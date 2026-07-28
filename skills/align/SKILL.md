---
name: align
description: "Guides the operator-facing accountable owner aligning genuinely new work: questions first, dispositions, decision ledger, decision-record minting, and scope-change realignment; non-owning Actors treat bounded assignments as aligned and return new decisions or scope gaps."
---

# Alignment governance

This Skill governs engagement, the conversational plan, and explicit operator
approval for genuinely new work.

## Role gate

Only the accountable operator-facing owner aligns new work. Spawned, delegated,
review, research, maintainer, and event-triggered Actors proceed within bounds;
new consequential decisions or scope gaps return to their assigner or owner.

## The contract

- **Questions first.** Ask current-state questions before any scope
  recommendation, freeze/defer proposal, or class narrowing. When the operator
  names a broad class with an example, restate the class in conversation before
  narrowing.
- **Boundaries before proposals.** Engage affected and unaffected Actor and
  outcome boundaries before generalizing an incident. Engage a coupled question
  shape before dispatch.
- **Plan built in conversation.** Operator corrections are binding text: restate
  them back verbatim and never revert them through later analysis or profile
  maps.
- **One answered card.** Record exactly one question card on the owning Task.
  Only an answer to its question is a disposition; generic assent such as
  “continue” never is, and evidence authorization approves neither plan nor
  disposition. The card inventories replaced, retained, and undecided
  dependencies. For decided role seats, it fully enumerates the role map and
  reconciles it with the operator's count; baseline shorthand is forbidden
  for decided seats.
- **Confirm the unspecified.** Ask one confirmation per field the operator did
  not specify; write nothing beyond the request.
- **Visible acknowledgment.** Before the next tool call, answer a
  what-happens-next or clarity question with one visible sentence stating the
  sequence, destructive boundary, and retained authority.
- **Read-only until approval.** Do not mutate before explicit plan approval.

## Dispositions and ledger

Dispositions do not transfer: each covers only its decision and surface.
Authorization alone does not settle implementation shape. Every consequential
decision cites a Backlog decision record, approved Task, or asked-and-answered
alignment exchange; uncited decisions are open. An operator opt-out counts only
when recorded verbatim for that work.

Before enactment, the owning Task Description's **decision ledger** cites every
consequential decision or says `none`. The plan exposes the outcome, ownership
boundary, non-goals, success evidence, and every decision's disposition before
explicit approval.

On approval, capture the plan as a Backlog `plans` document through Backlog's
CLI and attach it to the Task (`--doc` replaces the list); never capture
`.pi/plans/` scratch.

For a settled decision reaching beyond one Change, mint its Backlog decision
record in the Change checkout first encoding it, riding that pull request—never
primary `main`. Cite the asked-and-answered exchange until then; switch the
ledger to the record id before Task finalization.

## Task decomposition

Use an umbrella only when one outcome needs multiple independently deliverable
Changes. Each child owns one coherent Change; plan and checklist steps stay in
that child. Support exactly one direct child level. A decimal suffix is stable,
non-ordinal identity, never execution order. Parentage records membership;
`depends_on` records genuine prerequisites only.

The ready frontier is incomplete children whose prerequisites are satisfied.
It identifies candidates, not permission to overlap: the accountable owner
checks Repository/worktree ownership, files, invariants, external resources,
and integration order before concurrent dispatch. Do not create a durable
`parallel_with` relation. An external child stays in its owning Repository
under its native Task identity; link it with a qualified
`owner/repository:<Task-ID>` coordinate.

New consequential decisions or approved-boundary crossings stop work. The
accountable owner re-enters alignment; a non-owning Actor returns them through
the role-gate path.
