---
name: bpmn-plans
description: Generates and presents an evidence-stamped BPMN diagram for an aligned plan when the operator asks to see one, at alignment or any later time; stores it as a linked Backlog plans document and requires re-approval after material plan changes.
---

# BPMN plan diagrams

When the operator asks for a plan diagram, render the aligned plan so every
decision is a visible gateway and every step is a task typed by its Actor.
Tests, review, and Checks verify the implementation against the approved
intent.

## Authoring the plan spec

Write a plan-spec JSON per the [pipeline README](../../tools/bpmn-pipeline/README.md). Rules:

- One flat process — no pools, lanes, or subprocesses (the linter rejects
  them; they render wrong). Failure exits are error end events. Boundary
  events attach to tasks.
- Operator and judgment steps are `userTask`; mechanical steps are
  `serviceTask`; decisions are `exclusiveGateway` with labeled outgoing flows.
- Preserve the complete task-specific planned flow: every work-specific action,
  decision, failure path, and acceptance Check remains an explicit flow node.
  Never simplify or remove that content to improve the diagram layout.
- After the last task-specific Check and acceptance step, add exactly one
  `callActivity` named `Complete qq Change delivery` with
  `calledElement: "qq_change_delivery"`. It invokes the inherited delivery
  procedure without expanding generic review, commit, push, pull-request, and
  GitHub-Check mechanics into every plan.
- Every element carries `evidence: {file, lines}` pointing at what justifies
  the step — the owning Task, acceptance criteria, source files, or the Skill
  being followed. The pipeline stamps it into `bpmn:documentation` and
  `qq:evidence` extension elements and verifies it survives layout losslessly.

## Process boundary

End the BPMN process with `Complete qq Change delivery` flowing immediately to
an end event named `Green PR ready`. The call activity covers inherited
pre-handoff delivery mechanics; do not redraw those invariants as plan-specific
nodes. Operator disposition, merge, post-merge synchronization, and cleanup
remain after the green-PR boundary and outside the plan diagram.

## Generate

From `tools/bpmn-pipeline/` (first use: `npm ci`; rendering needs
Chrome — see README):

```sh
node bin/qq-bpmn.mjs all <plan-spec.json> <outdir>
```

Nonzero exit means the plan violates the subset or lost evidence in layout —
fix the spec, never the pipeline output.

Generation is not presentation. Do not launch the operator's persistent
graphical viewer while generating or regenerating candidates, privately
inspecting layout, storing artifacts, linking documents, or running validation.
Intermediate candidates must never create operator-facing windows.

## Store and link

1. `backlog doc create "Plan — <work title>" -p plans -t other`, then set the
   body with `backlog doc update`: intent summary, the diagram image
   reference, and where the spec lives.
2. Place `plan.bpmn`, the spec, and `plan.png` beside the document under
   `backlog/docs/plans/assets/<doc-id>/`. The PNG is the publishable render
   (it carries the license-required BPMN.io watermark).
3. Attach the document to every associated Task, following the managed Backlog
   markdown definition in `CONCEPTS.md`.

## Approval

Only after the final plan version is generated, stored, linked, and verified—and
the approval question is ready—launch that version exactly once in the
operator's graphical image-viewer application. Immediately ask the operator to
approve the visible diagram and include the PNG path. On graphical Linux, use
`setsid -f xdg-open "<stored-plan.png>" >/dev/null 2>&1`; otherwise use the
runtime's durable native opener. A tool-result preview, path, or link does not
substitute for a persistent viewer window. Confirm the window remains visible
after the launch call returns, but do not invoke the opener again for the same
version.

The operator approves the diagram. A material plan change after presentation
creates a new final version: regenerate, store, link, and verify it before
launching that revised version exactly once with a fresh confirmation. Never
reopen an unchanged version merely because intermediate work or messaging
continues.

## Boundary

Wiki process diagrams of the landed system belong to the openwiki-maintainer
flow, not this Skill. Plan documents describe intended change and never
masquerade as current-system truth.
