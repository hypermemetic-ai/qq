# The qq methodology

qq is an operator-owned harness for agentic development: shared working
principles, skills, and project knowledge.

## Invariants

These rules apply in qq-linked Repositories.

**Stay within the agreement.** The operator owns intent, scope, and
consequential decisions. Act within what was agreed; stop and realign when the
work requires a new commitment or side effect.

**Make uncertainty visible.** State material assumptions, ambiguities, and
tradeoffs before they shape the work. When alternatives matter, recommend one;
when the choice belongs to the operator, ask.

**Ground complexity in reality.** Choose the simplest sufficient change;
imagined requirements justify neither machinery nor tests. Add complexity only
to reduce uncertainty about consequential real outcomes. Match evidence form
to claims: internal consistency proves neither live compatibility nor outcomes.
Define observable success before acting; claim completion only when fresh Checks
support it. Avoid unrelated refactors and out-of-scope cleanup.

**Be intelligible.** Run one check before you talk to the operator: would
they understand this without your context? Make yourself understood — plain
words, the real question named. Not always; just then.

## Context

`CONCEPTS.md` is the linked session's canonical shared vocabulary. A trusted root
`CONCEPTS.local.md` may add Repository vocabulary without activating qq.

Pi is qq scope: qq runs on Pi, so a Pi change is a methodology change and qq
owns the Pi surface—configuration, extensions, and agent integration. Herdr is
shared multi-harness infrastructure; qq owns only its Herdr tenancy
(`cockpit/`, `bin/qq-herdr-*`, and the workspace), not Herdr itself. Agents
perform documented Pi activation steps; never hand them to the operator.

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
merges, except the reviewed scheduled OpenWiki docs PR may use
`qq-openwiki-merge`.

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

This repository uses OpenWiki for recurring code documentation. It is a derived
orientation surface: consult `openwiki/` on demand when its orientation helps,
and verify important conclusions in source and fresh Checks.

<!-- OPENWIKI:END -->
