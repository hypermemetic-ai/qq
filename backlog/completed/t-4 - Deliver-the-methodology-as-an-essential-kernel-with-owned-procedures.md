---
id: T-4
title: Deliver the methodology as an essential kernel with owned procedures
status: Done
assignee:
  - '@claude'
created_date: '2026-07-12 04:08'
updated_date: '2026-07-12 04:58'
labels:
  - architecture
  - context-engineering
dependencies:
  - T-2
documentation:
  - doc-16
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the essential-context delivery architecture settled under T-2 and doc-16. Rewrite AGENTS.md as an always-on kernel that carries only what must precede conditional retrieval: operator authority, the behavioral invariants, the orientation and routing map, the delivery contract, and runtime neutrality. Move every conditional procedure to its owning surface instead of deleting it. Author all prose fresh; preserve the original strong behavioral lines only where they remain semantically exact. Supersede the unaccepted T-3 reviewer-capsule prototype (PR #29) with an architecture-owned redesign of the code-review skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The authored AGENTS.md kernel carries only admission-worthy content and both generated marker blocks survive byte-for-byte
- [x] #2 Every semantic unit removed from AGENTS.md has a named owning surface; none is silently dropped
- [x] #3 The code-review skill owns delegated review through a complete brief, a fresh reviewer without inherited history, and a context-gap protocol, superseding PR #29
- [x] #4 The herdr coordination procedure moves to a dedicated agent-messaging skill
- [x] #5 An independent code-review of the Change passes before commit, push, and pull request
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Author the AGENTS.md kernel fresh: eight invariants (authority, honesty, proportionality, locality, commitment gate, evidence, supplied context/own judgment, portability), the surface map with source precedence, the no-supplied-orientation router, and the delivery contract. 2. Preserve both generated marker blocks byte-for-byte as tool-owned adapter tails. 3. Rewrite the code-review skill around owned orientation, a complete review brief, a fresh no-history reviewer, and a context-gap protocol. 4. Create the agent-messaging skill to own the herdr procedure. 5. Verify with static Checks (block identity, size, stale references, whitespace). 6. Independent code-review, then commit, push, PR; close PR #29 as superseded.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Disposition of every removed AGENTS.md unit — intro: kernel, rewritten. Surface table and source precedence: kernel, compressed. Authored codebase-memory usage detail (index confirmation, reindex after material uncommitted or branch changes, detect_changes-analyzes-impact-not-freshness): kernel orientation step 4, where the routing these facts guard lives; README.md separately documents install and configuration for the operator audience. Generated codebase-memory block: preserved byte-for-byte, relocated to the adapter tail. Six-step orientation: kernel, rewritten; Backlog command detail beyond the two entry commands is owned by backlog instructions overview (CLI self-documentation). Behavioral floor: kernel, rewritten as invariants with the strong lines preserved verbatim where semantically exact. Commitment-gate paragraph: kernel invariant; its authority/side-effects item moved to the authority invariant. Tasks and Changes plus Verification and review: kernel delivery contract and evidence invariant; review timing and procedure owned by the code-review skill; 'GitHub deletes the merged branch' remains owned by the CONCEPTS.md GitHub Flow definition. Agent collaboration: new agent-messaging skill owns all five herdr facts; kernel keeps one routing line. Runtime neutrality: portability invariant. Generated OpenWiki block: preserved byte-for-byte. New: the supplied-context/own-judgment invariant settles the delegation rule; the code-review brief and context-gap protocol are its first instantiation, superseding the T-3 prototype.

Settled rule from the operator's README finding: an owning surface must sit on the consuming actor's path for the question it owns — operator documentation owns operator procedure only, and disposable runtime adapters (the Claude Code codebase-memory skill, the SessionStart reminder hook) own no portable truth. The operator resolved the README duplication: the agent-usage sentences were trimmed to a pointer — AGENTS.md owns the rules, openwiki/operations.md describes the running stack — keeping only the one-time onboarding step on the operator path.

Verification: both generated blocks byte-identical across all edits (sed extraction + diff, rerun per fix); AGENTS.md 204 lines / 8,858 bytes to 140 / 6,597; no stale references to removed section names outside historical records and derived openwiki; git diff --check clean. Independent fresh-context review (read-only reviewer, complete brief, no inherited history) confirmed the semantic trace end-to-end; its three low findings (multi-step plan obligation, push cadence, bound-term capitalization) and the operator's README finding were each fixed with the smallest causal remedy, and the same reviewer confirmed every exact delta with no material findings remaining. openwiki/ pages regenerate through openwiki-maintainer after landing. Operator runs bin/install.sh from the canonical checkout after merge to link the new skill.
<!-- SECTION:NOTES:END -->
