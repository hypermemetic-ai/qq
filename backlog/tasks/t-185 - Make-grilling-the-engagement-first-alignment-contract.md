---
id: T-185
title: Make grilling the engagement-first alignment contract
status: Done
assignee: []
created_date: '2026-07-28 06:30'
updated_date: '2026-07-28 08:04'
labels: []
dependencies: []
documentation:
  - doc-123
priority: high
type: enhancement
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rename the alignment skill to align (skills/grilling → skills/align) and rewrite it as the engagement-first alignment contract — current-state questions before any recommendation or narrowing, boundaries engaged before proposals, plan built in conversation, operator corrections binding and restated, exactly one answered question card on the owning Task carrying the dependency inventory and reconciled role-map enumeration, one confirmation per unspecified field, one visible acknowledgment sentence before the next tool call, read-only until approval, generic assent never a disposition — update every reference across skills, AGENTS.md, and CONCEPTS.md, and land the standing conduct rules as prose in the owning skills. Approved plan: doc-123.

## Decision ledger

- D1 Engagement-first contract (questions first; affected/unaffected boundaries before proposals; plan built in conversation; corrections binding, restated, never reverted; one answered card on the Task; read-only until approval; only an answer to the card's question is a disposition; generic assent never a disposition) — disposition: operator-settled architect batch `batch-1d06da518a08f95d931c3a1a07fc2ae7`, immutable handoff `handoff-1d06da518a08f95d931c3a1a07fc2ae7`, 14 routed findings in scope (b), settled 2026-07-28; alignment-contract adoption confirmed in the operator's 2026-07-28 architect alignment session.
- D2 Batch-2 contract additions (card gains replaced/retained/undecided dependency inventory and full role-map enumeration reconciled with the operator's count with baseline shorthand forbidden for decided seats; one confirmation per unspecified field with nothing written beyond the request; one visible sentence — sequence, destructive boundary, retained authority — before the next tool call; operator-input staging verification with a Pi-activation example; review contract prose converging two fix rounds in one finding class through an operator question) — disposition: operator-settled architect batch `batch-a997e8347fde61d4b394c0a3dccb0c5e`, immutable handoff `handoff-a997e8347fde61d4b394c0a3dccb0c5e`, 8 routed findings folded into this same Change, settled 2026-07-28.
- D3 Standing conduct prose (status questions answered from the record never a steer; first authoritative status before recovery tooling; a stop steer is terminal; adapter tickets require production-seam acceptance tests; acceptance criteria map to fresh evidence before any merge-ready word; never self-prompt — preload only and describe as preloaded; foreign drift at land resolves through one preserve-or-restore question) — disposition: standing-rule notes of settled batch `batch-1d06da518a08f95d931c3a1a07fc2ae7` scope (b).
- D4 Naming: the skill is renamed grilling → align (directory, SKILL.md name, and all references across skills, AGENTS.md, and CONCEPTS.md; "grilling interview" vocabulary goes) because names teach posture — "grilling" taught interrogation, "align" mounts the canonical vocabulary and states what the skill owns — disposition: operator answer in the architect session, 2026-07-28. The Task title and plan doc-123's title deliberately keep the old name: retitling renames managed files pinned by the recorded intake receipts, and the operator judged the cost exceeds the gain (2026-07-28).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 align SKILL.md (renamed from skills/grilling) states the engagement-first contract: current-state questions precede any recommendation, freeze/defer proposal, or class narrowing; affected/unaffected boundaries are engaged before proposals; the plan is built in conversation; operator corrections are binding, restated, never reverted; exactly one answered card is recorded on the owning Task; no mutation before explicit approval; only an answer to the card's question is a disposition.
- [x] #2 Standing conduct prose lands in deliver-change, delegate-batch, and agent-messaging per plan doc-123: status from the record never a steer; first authoritative status before recovery; stop steer terminal; adapter tickets require production-seam acceptance tests; acceptance criteria map to fresh evidence before merge-ready; never self-prompt; foreign drift resolves through one preserve-or-restore question.
- [x] #3 CONCEPTS.md alignment vocabulary matches the contract and no grilling reference survives outside Git history.
- [x] #4 Prose budgets, ratchet, and skill-surface Checks green; fresh-context review PASS; exactly one PR.
- [x] #5 Batch-2 contract elements land: the card carries the replaced/retained/undecided dependency inventory and full role-map enumeration reconciled with the operator's count; one confirmation per unspecified field with nothing written beyond the request; one visible acknowledgment sentence (sequence, destructive boundary, retained authority) before the next tool call; operator-input staging verification with the Pi-activation example; review contract prose converges two fix rounds in one finding class through an operator question.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed as PR #278 (branch feat/t-185-alignment-contract, head 93634e9 + repair): skills/grilling renamed to skills/align and rewritten as the engagement-first contract (all seven elements incl. batch-2 card contents); standing conduct prose in deliver-change, delegate-batch, agent-messaging, operator-input, code-review; CONCEPTS.md alignment-brief entry rewritten; qq-handoff.py brief templates and test expectations updated; zero live grilling references outside backlog history and derived openwiki. Checks: test-qq-handoff pass, shellcheck/py_compile clean, tracked git-grep zero, ratchet clean (prose_words raised 7675->7941 under operator-approved plan doc-123), CI shell-tests pass 2m20s, fresh-context review PASS with zero material findings. Post-merge land follow-through: re-sync live ~/.pi skill copies (activation) and refresh derived openwiki via the maintainer.
<!-- SECTION:FINAL_SUMMARY:END -->
