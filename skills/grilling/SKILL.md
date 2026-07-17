---
name: grilling
description: Operator-facing alignment for the accountable owning agent before enacting a genuinely new work item. The default form is the alignment brief — plain-language intended work, every embedded consequential decision with its cited disposition or a recommendation, one approval question; escalate to the full interview when any decision is genuinely open. Never invoke from a spawned, delegated, review, research, maintainer, or event-triggered agent; those Actors treat bounded assignments as aligned and return new consequential decisions or scope gaps to their assigning or owning Actor. Skip only when the operator explicitly opts out or the message merely continues work already aligned and approved.
---

# Grilling

Only the operator-facing agent accountable for owning the work item may invoke
this Skill. A spawned, delegated, review, research, maintainer, or event-triggered
agent must not invoke it for a bounded assignment. Treat the bounded assignment
as aligned and execute within its boundary. If it exposes a new consequential
decision or scope gap, stop and return it to the assigning or owning Actor rather
than asking the operator or expanding the assignment.

Two rules bound every alignment judgment. Dispositions do not transfer: an
operator decision covers exactly the decision it settled, on the surface it
settled it for; a disposition for a sibling Actor, surface, or Change never
carries over (decision-2 records the worked example). Authorization is not
alignment: an instruction to fix a problem never settles the fix's shape,
whose consequential decisions are each dispositioned or open on their own.
A decision without a citation — a Backlog decision record, an approved
Task, or an asked-and-answered alignment exchange — is open. An explicit
operator opt-out is itself a disposition: record it verbatim in the
ledger, covering exactly the work item it was given for.

Default to the alignment brief. Before enacting a genuinely new work item,
send the operator a plain-language brief: the intended work, every
consequential decision it embeds, and for each either its citation or a
recommendation, closed by a single approval question. Give all the context
that bears on each decision and nothing that does not, before any option
is presented; never assume the operator has seen what only this session
inspected. A brief whose every decision already carries a citation is
still sent — silently skipping alignment is not within the agent's gift.

Escalate to the full interview when any embedded decision is genuinely
open. Before asking, inspect the codebase and available resources for
relevant facts. Build the decision tree and group related open decisions
into at most a few batches. Resolve dependencies between batches until the
operator and agent share the same understanding.

Ask each batch together and wait for its answers. Every question must be
answerable from the briefing that precedes it and carries a recommended
answer with brief rationale. Look up discoverable facts instead of asking
the operator. Put every decision to the operator. If inspection reveals no
open decision, the alignment brief's single approval question is the
interview.

Close alignment by stating the intended outcome, the ownership boundary—
responsibilities added or changed plus explicit non-goals—and the evidence
that will demonstrate success. When an answer settles a decision whose
reach extends beyond this one Change, record it as a Backlog decision
record and cite it from the owning Task's decision ledger. Mint the
record inside the Change that first encodes the decision — its checkout,
riding its pull request — never in the primary checkout, whose
synchronization rail admits only in-flight Task records. The ledger cites
the asked-and-answered exchange until the record exists in that checkout,
then switches to the record id before Task finalization.

Do not enact the work until the operator confirms shared understanding. Treat
approval or an instruction to proceed as authorization to carry out the aligned
work without reopening settled decisions. If a new decision emerges during the
work or the work crosses the ownership boundary, stop. The operator-facing owner
stops and resumes alignment. A non-owning Actor follows the return path above.
