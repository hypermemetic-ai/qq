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
requires the operator.

## Batch into one handoff

Collect every operator-only step the task will need and present them together
where dependencies allow. Do not dribble avoidable interruptions one at a time.

## Minimize each step

Reduce every surviving step to the smallest feasible operator action. Prefer
one click, one paste, or one yes/no when possible, but do not treat that as a
rigid rule. Remove every part the agent can absorb: link to the exact page,
prepare paste-ready commands, pre-fill files or diffs around the missing value,
and state the value's expected shape. These are examples, not a checklist.

Validate the operator's input immediately when it arrives, then resume without
further operator involvement.

## Bring the surface to the operator

Open or pre-stage the destination yourself when possible instead of sending the
operator elsewhere with instructions. For secrets such as API keys, tokens, or
passwords, prepare the destination and mark the paste point so the secret lands
where it belongs without transiting the transcript. If the operator pastes a
secret into chat anyway, place it without repeating it and plainly flag the
transcript exposure.

This Skill governs operator-only steps. It does not run interviews: alignment
decisions belong to `grilling`, and hands-on acceptance Checks belong to
`uat-signoff`. Both may share this Skill's pre-staging discipline, but their
protocols are their own.
