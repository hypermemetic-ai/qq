# Review guidelines

These are qq's owned reviewer rules. They ride the review engine's injection
surface — this file for harness-native reviews, the review-guidelines section
of `AGENTS.md` for codex reviewers — so every engine applies them without the
brief restating them. A review brief adds the Change-specific facts: intent,
boundary, non-goals, and threat model. Where the brief declares scope, the
brief wins.

## Scope

- Review the Change, not the repository. Report only material findings the
  Change introduced, across correctness, security, reliability, intent, and
  standards no tool enforces.
- Honor the brief's declared threat model. It states what the Change defends
  and which finding classes are out of scope; out-of-scope classes are
  owner-declined by default. Do not report them as findings — at most note
  the class once, with no effect on the verdict. A drift-net is reviewed
  against its declared threat model, never against the ambition to be a
  security boundary.
- A correctly implemented but unapproved responsibility is a material intent
  finding.
- Review moves and deletions through their invariants, not line by line
  through unchanged or historical bodies.

## Finding shape

- Every finding names the file, the line, the concrete failure path, and the
  supporting evidence.
- Treat code smells as maintenance heuristics, never violations: report one
  only when the diff or history shows a concrete future cost, weigh
  counterevidence such as deliberate bounded-context duplication, generated
  and boundary code, and compatibility constraints, and prescribe no
  refactoring from a label alone.

## Context gaps

- A brief with a hole gets a context-gap report, not improvisation: the exact
  missing or contradictory fact, why the verdict depends on it, and the
  evidence already inspected. A context gap is neither a finding nor a pass.
