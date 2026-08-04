# Review guidelines

Brief supplies intent, ownership/trust boundaries, non-goals, and threat model;
its scope wins.

## Scope

- Review only materially consequential correctness, security, reliability,
  intent, or unenforced standards failures the Change owns through current use,
  aligned outcome, demonstrated contract, observed failure, or credible
  consequential threat. Review additions and omissions: unsupported behavior,
  abstractions, guards, and tests qualify when materially complex;
  imaginability alone does not.
- Honor the declared threat model: declined classes do not affect the verdict;
  review drift-nets against it, never as security boundaries.
- Correct but unapproved responsibility is an intent finding.
- Review moves/deletions through invariants, not unchanged bodies.

## Finding shape

- Findings name failure, file/line, concrete path, and evidence. Fences cite
  declared trust boundaries; otherwise shrink.
- Classify by declared-boundary lookup, never origin archaeology. Price guard
  and state-space-removal forms; no addition-shaped prescriptions. An interior
  guard stays labeled only after surviving mechanical same-fix-smaller.
- Smells are not violations. Report only diff/history-supported future cost
  after weighing generated, boundary, compatibility, or deliberate
  bounded-context counterevidence; never prescribe from a label.

## Remedy and gates

- Smallest remedy means smallest resulting system; diff only breaks ties.
  In-boundary state-space shrinkage or preservation is pre-authorized and
  envelope-reported; boundary changes align.
- Only-down count budgets, such as complex functions or long files, are
  merge-boundary shape gates. Trends, including fix-net and health composites,
  gate nothing.
- Place obligations where retry is cheap or firing rare; inform elsewhere.
  Blended gates are gameable and undiagnosable; frequent per-Change obligations
  become rote.

## Context gaps

Context gaps name missing/contradictory facts, why verdict depends, and inspected
evidence; never improvise or call them findings/passes.

## Recurrence rules

- A new permanent protocol names the user-visible failure it prevents and
  retires at least as much protocol as it adds.
- Provider command construction exists in exactly one adapter.
- Core workflow tests pass absent Herdr and OpenWiki.
- `deliver-change` reaches green handoff without requiring Herdr, a browser, or
  a polling loop.
- After the hybrid Task-truth convention retires, no Task-record relocation is
  a lifecycle transition.
- Fresh-context review is the default for every non-trivial Change; the only
  skip is a purely mechanical Change (deletion or docs/prose edit,
  grep/CI-verifiable, no trust boundary, no operator state, no external side
  effect). No other universal review/UAT gate exists without an explicit risk
  trigger; the decision ledger is exempt.
