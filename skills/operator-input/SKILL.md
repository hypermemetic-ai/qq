---
name: operator-input
description: Makes steps only the operator can perform as small and easy as possible. Use when a task hits a login or authorization wall, needs a browser-only action or operator-held value, requires the operator's accounts or machine, or depends on a fact only the operator knows.
---

# Minimize operator input

When a step can only be performed by the operator, absorb as much of its work
as possible, even when doing so costs the agent substantially more effort.

## Self-service first

Before asking, exhaust ways to obtain the value or perform the step yourself,
including CLIs, APIs, files, and documentation. Ask only for what genuinely
requires the operator. Pi activation steps are a standing self-service example:
agents perform them; they are never operator-owned.

## Batch into one handoff

Collect every operator-only step the task will need and present them together
where dependencies allow. Do not dribble avoidable interruptions one at a time.

## Minimize each step

Reduce every surviving step to the smallest operator action. Prefer
one click, one paste, or one yes/no when possible. Remove every part the agent
can absorb: link to the exact page, pre-fill files or diffs around the missing
value, and state the value's expected shape. These are examples, not a
checklist. Never dictate copy-paste commands: stage them through
`operator_stage` and read the pane back to validate the outcome. Before using a
staged input, confirm browser visibility and confirm that the console targets
the intended project.

Validate the operator's input immediately, then resume without further operator
involvement.

## Prepare without pulling focus

Prepare destinations without pulling focus; notify the operator where to
navigate. For secrets, mark the paste point. If one enters chat, place it
without repeating it and flag the exposure.

This Skill governs operator-only steps. It does not run interviews: alignment
decisions belong to `align`, and hands-on acceptance Checks belong to
`uat-signoff`. Both may share this Skill's pre-staging discipline, but their
protocols are their own.
