# The qq methodology

qq is an operator-owned harness for agentic development: shared working
principles, skills, and project knowledge.

## Invariants

These rules apply to every work item.

**Stay within the agreement.** The operator owns intent, scope, and
consequential decisions. Act within what was agreed; stop and realign when the
work requires a new commitment or side effect.

**Make uncertainty visible.** State material assumptions, ambiguities, and
tradeoffs before they shape the work. When alternatives matter, recommend one;
when the choice belongs to the operator, ask.

**Solve the agreed problem—no more, no less.** Choose the simplest change that
achieves the agreed outcome. Do not add speculative capability, unrelated
refactors, or out-of-scope cleanup.

**Use evidence to decide and report.** Define observable success before acting.
Inspect the evidence behind material conclusions, and claim completion only
when fresh Checks demonstrate the intended outcome.

## Context

Read `CONCEPTS.md` before working and use its vocabulary. Where present,
`CONCEPTS.local.md` appends the Repository's own vocabulary to that
glossary.

Start with the assignment and context already provided. Resolve only what is
missing, using the surfaces present in the Repository:

- Where present, Tasks record durable intent and work status.
- Where present, Backlog documents and decisions preserve evidence, lessons,
  and settled choices.
- Where present, `openwiki/` describes the landed system.

Use source files and fresh Checks to verify material conclusions. When a
derived surface conflicts with them, trust source and Checks and report the
conflict.

## Delivery

Changes land through GitHub Flow after their Checks pass and the operator
merges.

## Review guidelines

When reviewing a Change in a Repository with a root `REVIEW.md`, read it fully
before inspecting the diff and apply its reviewer rules. The review brief
supplies the Change's intent, boundary, and threat model; where the brief
declares scope, the brief wins.

The tool-managed sections below describe optional per-Repository surfaces.
Each applies only where its named surface exists in the Repository being
worked on.

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links.

OpenWiki is a derived orientation surface. Verify important conclusions in source and fresh Checks.

<!-- OPENWIKI:END -->
