---
name: bpmn-plans
description: Turns the aligned plan for a non-trivial work item into an evidence-stamped BPMN diagram before execution — generated deterministically by the bundled pipeline, stored as a Backlog plans document linked from the owning task(s), presented to the operator at plan approval, and conformance-checked inside the owning Change before Task finalization. Trigger when closing alignment on non-trivial work, when the operator asks to see a plan, and when planned work reaches green PR handoff. Skip for trivial or purely mechanical work.
---

# BPMN plans

A plan the operator approves is a diagram, not prose: every decision is a
visible gateway, every step a task typed by its actor. The same file is the
review artifact, the execution contract, and the conformance baseline.

## Authoring the plan spec

Write a plan-spec JSON per `pipeline/README.md`. Rules:

- One flat process — no pools, lanes, or subprocesses (the linter rejects
  them; they render wrong). Failure exits are error end events. Boundary
  events attach to tasks.
- Operator and judgment steps are `userTask`; mechanical steps are
  `serviceTask`; decisions are `exclusiveGateway` with labeled outgoing flows.
- Every element carries `evidence: {file, lines}` pointing at what justifies
  the step — the owning Task, acceptance criteria, source files, or the Skill
  being followed. The pipeline stamps it into `bpmn:documentation` and
  `qq:evidence` extension elements and verifies it survives layout losslessly.

## Process boundary

End the BPMN process when the planned implementation is green in its owning
pull request and ready for handoff. Do not add flow nodes for conformance
recording or Task finalization; they are closeout metadata about the executed
plan, not planned execution. Do not add operator review, merge, rejection,
disposition waiting, primary-main synchronization, branch/worktree cleanup, or
other post-handoff delivery activities. `deliver-change` owns those activities
outside BPMN conformance.

## Generate

From `skills/bpmn-plans/pipeline/` (first use: `npm ci`; rendering needs
Chrome — see README):

```sh
node bin/qq-bpmn.mjs all <plan-spec.json> <outdir>
```

Nonzero exit means the plan violates the subset or lost evidence in layout —
fix the spec, never the pipeline output.

After the command succeeds, immediately open the generated
`<outdir>/<plan-id>.png` in the operator's graphical image-viewer application
through a process that survives the tool call. On graphical Linux, use
`setsid -f xdg-open "<outdir>/<plan-id>.png" >/dev/null 2>&1`; otherwise use the
runtime's durable native opener. A tool-result preview, path, or link does not
substitute for a persistent viewer window. Confirm the window remains visible
after the launch call returns before continuing.

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

When closing alignment (grilling's final confirmation), keep the rendered
diagram visible in that graphical image-viewer window alongside the question
and give the PNG path for reference. The operator approves the diagram;
material plan changes after approval mean a regenerated diagram, a fresh
image-viewer presentation, and a fresh confirmation.

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
