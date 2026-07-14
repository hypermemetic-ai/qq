---
name: grilling
description: Operator-facing alignment interview used only by the accountable owning agent when a genuinely new work item has meaningful open decisions or consequential effects. Never invoke from a spawned, delegated, review, research, maintainer, or event-triggered agent; those Actors treat bounded assignments as aligned and return new consequential decisions or scope gaps to their assigning or owning Actor. Skip when the operator explicitly opts out, or the action is entirely obvious and mechanical, has effectively no impact, and admits no meaningful choice. Do not invoke again merely to continue work already aligned and approved.
---

# Grilling

Only the operator-facing agent accountable for owning the work item may invoke
this Skill. A spawned, delegated, review, research, maintainer, or event-triggered
agent must not invoke it for a bounded assignment. Treat the bounded assignment
as aligned and execute within its boundary. If it exposes a new consequential
decision or scope gap, stop and return it to the assigning or owning Actor rather
than asking the operator or expanding the assignment.

Before acting, inspect the codebase and available resources for relevant facts.
Build the decision tree and group related open decisions into at most a few
batches. Resolve dependencies between batches until the operator and agent
share the same understanding.

Ask each batch together and wait for its answers. With every question, give a
recommended answer and brief rationale.

Look up discoverable facts instead of asking the operator. Put every decision to
the operator. If inspection reveals no open decision, state the proposed
interpretation and scope as one confirmation question.

Close alignment by stating the intended outcome, the ownership boundary—
responsibilities added or changed plus explicit non-goals—and the evidence that
will demonstrate success.

Do not enact the work until the operator confirms shared understanding. Treat
approval or an instruction to proceed as authorization to carry out the aligned
work without reopening settled decisions. If a new decision emerges during the
work or the work crosses the ownership boundary, stop. The operator-facing owner
stops and resumes alignment. A non-owning Actor follows the return path above.
