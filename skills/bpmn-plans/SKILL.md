---
name: bpmn-plans
description: Turns the aligned plan for a non-trivial work item into an evidence-stamped BPMN diagram before execution — generated deterministically by the bundled pipeline, stored as a Backlog plans document linked from the owning task(s), presented to the operator at plan approval, and conformance-checked against what actually happened after the work lands. Trigger when closing alignment on non-trivial work, when the operator asks to see a plan, and when planned work completes. Skip for trivial or purely mechanical work.
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

## Generate

From `skills/bpmn-plans/pipeline/` (first use: `npm ci`; rendering needs
Chrome — see README):

```sh
node bin/qq-bpmn.mjs all <plan-spec.json> <outdir>
```

Nonzero exit means the plan violates the subset or lost evidence in layout —
fix the spec, never the pipeline output.

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

When closing alignment (grilling's final confirmation), present the rendered
diagram to the operator with the question — give the PNG path and, where the
session allows, render it inline or as a private artifact page. The operator
approves the diagram; material plan changes after approval mean a regenerated
diagram and a fresh confirmation.

## Conformance after the work lands

Write `completions.json` covering every task and gateway in the plan
(`done` / `skipped` / `diverged`, each with evidence or a note), then:

```sh
node bin/qq-bpmn.mjs conform <plan.bpmn> <completions.json> -o report.md
```

Append the report to the plan document via `backlog doc update`. Explained
divergence is information — replanning happens. Unexplained divergence or
unaccounted elements block marking the owning Task Done.

## Boundary

Wiki process diagrams of the landed system belong to the openwiki-maintainer
flow, not this Skill. Plan documents describe intended change and never
masquerade as current-system truth.
