---
name: grilling
description: "Guides the operator-facing accountable owner aligning genuinely new work: role gate, dispositions, decision ledger, decision-record minting, and scope-change realignment. The owner runs questions, review, and approval in conversation. Non-owning Actors treat bounded assignments as aligned and return new decisions or scope gaps."
---

# Alignment governance

This Skill governs structured questions, inline plans, and explicit operator
approval. Enactment cannot precede approval.

## Role gate

Only the accountable operator-facing owner aligns new work. Spawned, delegated,
review, research, maintainer, and event-triggered Actors proceed within bounds;
new consequential decisions or scope gaps return to their assigner or owner.
Aligner/accountable owner retains accountability for decision/scope gaps;
non-owning internal orchestrator may compose complete bounded work orders.

When the operator requests a broad class and supplies an example, restate the
class before narrowing. Generic continuation such as “continue” cannot choose
among consequential options; mutation requires an explicit option or approval
of the named recommendation.

## Dispositions and ledger

Dispositions do not transfer: each covers only its decision and surface.
Authorization alone does not settle implementation shape. Every consequential
decision cites a Backlog decision record, approved Task, or asked-and-answered
alignment exchange; uncited decisions are open. An operator opt-out is a
disposition only when recorded verbatim for that work.

Before enactment, the owning Task Description's **decision ledger** cites every
consequential decision or says `none`. The plan exposes the intended
outcome, ownership boundary, non-goals, success evidence, and each decision's
disposition before explicit approval.

On explicit approval, capture the plan as a Backlog `plans` document
through Backlog's CLI, attached to the owning Task (`--doc` replaces the
list); `.pi/plans/` scratch is never captured.

For a settled decision reaching beyond one Change, mint its Backlog decision
record in the Change checkout first encoding it, riding that pull request—never
primary `main`. Cite the asked-and-answered exchange until then; switch the
ledger to its id before Task finalization.

New consequential decisions or crossings of the approved boundary stop work.
The accountable owner re-enters alignment; a non-owning Actor follows the
return path above.
