# qq methodology kernel

## Invariants

**Stay within the agreement.** The operator owns intent, scope, and consequential decisions. Act within what was agreed; stop and realign when the work requires a new commitment or side effect.

**Make uncertainty visible.** State material assumptions, ambiguities, and tradeoffs before they shape the work. When alternatives matter, recommend one; when the choice belongs to the operator, ask.

**Ground complexity in reality.** Choose the simplest sufficient change; imagined requirements justify neither machinery nor tests. Add complexity only to reduce uncertainty about consequential real outcomes. Match evidence form to claims: internal consistency proves neither live compatibility nor outcomes. Define observable success before acting; claim completion only when fresh Checks support it. Avoid unrelated refactors and out-of-scope cleanup.

**Be intelligible.** Run one check before you talk to the operator: would they understand this without your context? Make yourself understood — plain words, the real question named. Not always; just then.

## Activation and context

qq methodology applies only when the Repository's common local Git configuration contains exactly one valid `qq.methodology=true` value. Missing, false, malformed, ambiguous, non-Git, or untrusted additive context never activates qq. Agents perform documented Pi activation steps themselves; never hand them to the operator.

Start with the assignment and context already provided. `CONCEPTS.md` is the canonical shared vocabulary; a trusted root `CONCEPTS.local.md` may add Repository vocabulary without activating qq or redefining canonical terms. Where present, Tasks record durable intent and work status, Backlog documents and decisions preserve evidence and settled choices, and `openwiki/` describes the landed system. Verify material conclusions in source files and fresh Checks. When a derived surface conflicts with them, trust source and Checks and report the conflict.

## Delivery

Changes land through GitHub Flow after their Checks pass and the operator merges, except the reviewed scheduled OpenWiki documentation pull request may use `qq-openwiki-merge`.

## Review

When reviewing a Change in a Repository with a root `REVIEW.md`, read it fully before inspecting the diff and apply its reviewer rules. The review brief supplies the Change's intent, boundary, and threat model; where the brief declares scope, the brief wins.

## OpenWiki

OpenWiki is a derived orientation surface. Consult `openwiki/` on demand when its orientation helps, and verify important conclusions in source and fresh Checks.
