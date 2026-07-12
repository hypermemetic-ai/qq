# qq BPMN pipeline

This package turns a small JSON plan specification into a single-process BPMN
diagram with source evidence on every flow node. It lints the semantic model,
adds deterministic diagram interchange (DI), verifies that documentation and
`qq:evidence` extensions survived layout, and renders SVG and PNG artifacts.

The package requires Node.js 20 or newer. Install the locked dependencies and
run the tests from this directory:

```sh
npm ci
npm test
```

## CLI

Run the CLI directly with Node or through the package's `qq-bpmn` bin:

```sh
node bin/qq-bpmn.mjs build example/plan-spec.example.json out/plan.bpmn
node bin/qq-bpmn.mjs render out/plan.bpmn out/rendered
node bin/qq-bpmn.mjs all example/plan-spec.example.json out/example
node bin/qq-bpmn.mjs conform out/example/qq_release_plan.bpmn completions.json
node bin/qq-bpmn.mjs conform out/example/qq_release_plan.bpmn completions.json -o report.md --strict
```

`build` writes semantic BPMN without DI. `render` writes
`<name>.layout.bpmn`, `<name>.roundtrip.json`, `<name>.svg`, and `<name>.png`.
`all` names the semantic BPMN after the plan's `id` and then runs the complete
pipeline. The round-trip JSON's top-level `lossless` property must be `true`;
loss exits nonzero.

`conform` accounts for every BPMN flow node. Its completions file is an object
keyed by element id:

```json
{
  "inspect_change": {
    "status": "done",
    "evidence": "out/checks/inspect.txt",
    "note": "Optional context"
  },
  "owner_approval": {
    "status": "diverged",
    "evidence": "backlog/docs/decisions/doc-9",
    "note": "Operator approved through the recorded decision instead."
  }
}
```

Allowed statuses are `done`, `skipped`, and `diverged`. Missing plan ids are
reported as unaccounted, and completion ids not present in the plan are listed
as unknown. Reporting exits zero by default. `--strict` exits 1 if any flow
node is unaccounted or any diverged node has no non-empty note.

## Plan-spec schema

The top level is:

```json
{
  "id": "release_plan",
  "name": "Release plan",
  "elements": [],
  "flows": []
}
```

`id` is also the BPMN process id and must match
`[A-Za-z_][A-Za-z0-9_.-]*`. `name`, `elements`, and `flows` are required.
Element order and flow order are retained.

Every element requires these common fields:

```json
{
  "id": "verify",
  "type": "serviceTask",
  "name": "Run checks",
  "documentation": "Run the checks that cover the change.",
  "evidence": {
    "file": "package.json",
    "lines": "8-14"
  }
}
```

`documentation` may be an empty string or omitted. Generation always creates
one BPMN documentation entry ending in `Evidence: <file>:<lines>` and one
`<qq:evidence file="..." lines="..."/>` extension in the
`http://qq.local/schema/evidence` namespace. `evidence.file` and
`evidence.lines` are required non-empty strings.

Supported `type` values are:

- `startEvent`
- `endEvent`; set optional `error: true` for an error end event
- `serviceTask`
- `userTask`
- `manualTask`
- `exclusiveGateway`
- `boundaryEvent`

A boundary event also requires `attachedTo` and `kind`. For `kind: "timer"`,
provide an ISO 8601 `duration` such as `PT30M`. For `kind: "error"`, no duration
is used. `cancelActivity` defaults to `true` and may be set to `false`.

Every flow requires stable `id`, `source`, and `target` element ids. `name` is
optional and is useful for labeled gateway branches:

```json
{
  "id": "flow_approved",
  "source": "decision",
  "target": "publish",
  "name": "approved"
}
```

See [`example/plan-spec.example.json`](example/plan-spec.example.json) for a
complete plan.

## Enforced BPMN subset

The local `bpmnlint-plugin-qq` runs alongside `bpmnlint:recommended`; all four
rules are errors:

- `qq/no-collaboration` rejects collaborations, participants, and message
  flows because this package renders one process, not inter-pool choreography.
- `qq/no-lanes` rejects lane sets and lanes because `bpmn-auto-layout`
  silently drops them.
- `qq/no-subprocess` rejects subprocesses, ad hoc subprocesses, and
  transactions because the renderer shows them collapsed and hides the plan.
- `qq/single-process` requires exactly one process so layout and conformance
  have one unambiguous plan root.

`no-bpmndi` is disabled because semantic inputs intentionally have no DI before
layout. Other recommended bpmnlint rules remain enabled.

## Chrome and rendering

`bpmn-to-image` uses Puppeteer. Install its matching Chrome build in
Puppeteer's user-level cache (normally `~/.cache/puppeteer` on Linux):

```sh
npx puppeteer browsers install chrome
```

Set `PUPPETEER_CACHE_DIR` before both installation and rendering if the user
cache lives elsewhere. Set `QQ_BPMN_SKIP_RENDER=1` only when running tests on a
host without Chrome; semantic generation, lint, layout, round-trip, and
conformance tests still run.

The bpmn.io footer/watermark is deliberately enabled for license attribution.
The PNG carries the visible BPMN.io watermark and is the artifact to publish.
The SVG exporter retains attribution only as a comment, so do not substitute
the SVG when a visibly attributed published diagram is required.

## Determinism

Repeated generation from the same spec is byte-identical. IDs come from the
spec, serialization follows element and flow order, and no timestamps or
random identifiers are introduced. The layout and round-trip JSON are stable
with the committed lockfile. The renderer's generated SVG marker ids are
canonicalized in document order, making repeated SVG renders byte-identical in
the same environment. PNG renders are byte-identical when Chrome, fonts, OS,
and package versions are unchanged; raster bytes are not promised across
different rendering environments.
