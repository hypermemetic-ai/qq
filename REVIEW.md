# Review guidelines

A brief supplies intent, ownership/trust boundaries, non-goals, and
threat model; its scope wins.

## Scope

- Review only material failures the Change introduced in correctness,
  security, reliability, intent, or unenforced standards.
- Honor the declared threat model: owner-declined classes do not affect the
  verdict; review drift-nets against it, never as security boundaries.
- Correct but unapproved responsibility is an intent finding.
- Review moves/deletions through invariants, not unchanged bodies.

## Finding shape

- Findings state failure, file, line, concrete path, and evidence. A fence cites
  a declared trust boundary; none means shrink.
- Classify by declared-boundary lookup, never origin archaeology. Price guard
  and state-space-removal forms; prescriptions are not addition-shaped. An
  interior guard stands labeled only after surviving mechanical
  same-fix-smaller.
- A smell is a heuristic, not a violation. Report only diff/history-supported
  future cost after weighing generated, boundary, compatibility, or deliberate
  bounded-context counterevidence; never prescribe from a label.

## Remedy and gates

- Smallest remedy means smallest resulting system; diff breaks ties. In-boundary
  state-space shrinkage or preservation is pre-authorized and reported in the
  completion envelope; boundary changes align.
- Always display parallel, unblended net production-LOC and decision-point
  deltas per fix commit on completion and review surfaces. Growth in either
  spends one mechanical implementer-loop same-fix-smaller regeneration: passing
  Checks plus strict shrink wins; otherwise retain the original without
  justification prose.
- Block only at shape: merge-boundary gates are only-down count budgets, such
  as complex functions or long files. Trend gauges, including fix-net and
  health composites, gate nothing.
- Place obligations only where retry is cheap or firing rare; provide
  information elsewhere. Blended gates are gameable and undiagnosable;
  frequent per-Change obligations become rote.

## Context gaps

Context-gap reports name missing/contradictory facts, why the verdict depends,
and evidence inspected; never improvise. They are neither finding nor pass.

## Recurrence rules

- A new permanent protocol names the user-visible failure it prevents and
  retires at least as much protocol as it adds.
- Provider command construction exists in exactly one adapter.
- Core workflow tests pass absent Herdr and OpenWiki.
- `deliver-change` reaches green handoff without requiring Herdr, a browser, or
  a polling loop.
- After the hybrid Task-truth convention retires, no Task-record relocation is
  a lifecycle transition.
- No universal review/UAT gate exists without an explicit risk trigger; the
  decision ledger is exempt.
