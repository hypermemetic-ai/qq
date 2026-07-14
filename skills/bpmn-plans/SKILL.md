---
name: bpmn-plans
description: Turns the aligned plan for a non-trivial work item into an evidence-stamped BPMN diagram before execution — generated deterministically by the bundled pipeline, stored as a Backlog plans document linked from the owning task(s), presented to the operator at plan approval, and conformance-checked inside the owning Change before Task finalization. Trigger when closing alignment on non-trivial work, when the operator asks to see a plan, and when planned work reaches green PR handoff. Skip for trivial or purely mechanical work.
---

# BPMN plans

A plan the operator approves is a diagram, not prose: every decision is a
visible gateway, every step a task typed by its actor. The same file is the
review artifact, the execution contract, and the conformance baseline.

## Authoring the plan spec

Write a plan-spec JSON per the [pipeline README](../../tools/bpmn-pipeline/README.md). Rules:

- One flat process — no pools, lanes, or subprocesses (the linter rejects
  them; they render wrong). Failure exits are error end events. Boundary
  events attach to tasks.
- Operator and judgment steps are `userTask`; mechanical steps are
  `serviceTask`; decisions are `exclusiveGateway` with labeled outgoing flows.
- Preserve the complete task-specific execution contract: every work-specific
  action, decision, failure path, and acceptance Check remains an explicit flow
  node. Never simplify or remove that content to improve the diagram layout.
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
nodes. Do not add flow nodes for conformance recording or Task finalization;
they are closeout metadata about the executed plan. Operator disposition,
merge, post-merge synchronization, and cleanup remain after the green-PR
boundary and outside BPMN conformance.

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
3. Attach the document to every associated Task. `--doc` REPLACES the list:
   `backlog task view <id> --plain` first, then re-pass every existing entry
   plus the plan document.

## Approval

Only after the final plan version is generated, stored, linked, and verified—and
the approval question is ready—launch that version exactly once in the
operator's graphical image-viewer application. Immediately send grilling's
final confirmation with the visible diagram and PNG path alongside the
question. On graphical Linux, use
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

## Same-PR conformance before Task finalization

When the planned implementation reaches its green PR handoff end state, write
`completions.json` covering every flow node in the plan
(`done` / `skipped` / `diverged`, each with evidence or a note), then:

```sh
node bin/qq-bpmn.mjs conform <plan.bpmn> <completions.json> -o report.md --strict
```

Store `completions.json` and the generated report beside the plan artifacts and
append the report to the plan document via `backlog doc update`. Complete this
on the owning Change branch before marking the owning Task Done. Then finalize
the Task and commit and push both conformance and finalization through the same
pull request. Never wait for merge or open a post-merge conformance Change.

Conformance recording and Task finalization remain outside the BPMN flow nodes.
If implementation, review fixes, or other planned behavior changes after the
report was generated, replace the completions and report with fresh conformance
before returning the Task to Done or handing off the PR. Explained divergence
is information — replanning happens. Unexplained divergence or unaccounted
elements block Task finalization.

## Boundary

Wiki process diagrams of the landed system belong to the openwiki-maintainer
flow, not this Skill. Plan documents describe intended change and never
masquerade as current-system truth. Apply the same-PR rule prospectively; do
not rewrite truthful historical conformance records solely because an earlier
procedure recorded them after landing.
