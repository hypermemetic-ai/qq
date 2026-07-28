---
id: doc-122
title: >-
  Plan — Delete delegate confinement and rebuild delegate lifecycle on one run
  dir
type: specification
created_date: '2026-07-28 06:27'
updated_date: '2026-07-28 06:48'
---

**Status:** APPROVED by the operator in the 2026-07-28 intake alignment exchange (one answered card covering both plans; batches 1d06da51 and a997e834 absorbed).

## Outcome

qq delegation keeps exactly one boundary — the git worktree — and exactly one lifecycle owner — one durable run dir per delegate. The confined-delegation layer (Landlock/Landstrip grants, confined edit/bash parity machinery, writable-tmpdir work orders) and the writer role are deleted, and the failure classes they produced cease to exist. The structured-output schema pipeline is replaced by an ENVELOPE.md template written in the run dir. deliver-change becomes six steps with Task finalization before any PR opens, and its vocabulary distinguishes "created locally" from "mergeable now". REVIEW.md's per-fix-commit counter mandate is deleted. Observer and intake integrity corrections land: intake verifies a named-branch checkout, the Observer writes one entry per evidence object with the assembler as sole writer of analysis.json, and explicit run lineage is the only membership source. The architect/disposition pipeline's own ceremony is cut. The named keeps survive: `backlog decision update --content`, one atomic backlog doc supersede command, intercom single-flight, bash unknown-argument refusal, role startup validation, one structured package-inventory command, and a session-edit-ledger-gated pi-lens turn-end autoformat.

This Change reverses T-177's global confined-delegation posture (`decision-19`) and the counter portion of `decision-5`, per the operator's 2026-07-28 dispositions.

## Cut list

Every cut and keep is settled by the operator-settled architect batches `batch-1d06da518a08f95d931c3a1a07fc2ae7` (immutable handoff `handoff-1d06da518a08f95d931c3a1a07fc2ae7`, 36 routed findings in scope (a), settled 2026-07-28) and `batch-a997e8347fde61d4b394c0a3dccb0c5e` (immutable handoff `handoff-a997e8347fde61d4b394c0a3dccb0c5e`, 19 routed findings folded into this same Change, settled 2026-07-28), plus the operator's verbal alignment session in the architect tab the same day. Cut numbers are the first batch's own; the second batch folds in as noted.

- **Cut 1 — Delegate confinement deleted.** Landlock/Landstrip policy generation, confined edit/bash parity machinery, and tmpdir confinement go. The git worktree is the only boundary; one mutation path with the same grant as shell. Reviewer cache environment redirects beneath the run dir. With confinement die the nested-check rerun rules, the known-substrate rerun class, process-substitution terminal failures, and sandbox-guard revival paths; Checks run unchanged across contexts, and reviewer scratch lives in the run dir (batch 2).
- **Cut 2 — Structured-output pipeline deleted.** The schema contradiction, boundary copies, inline schema transcription, and provider-close capture channel go; no schema is passed at all. An ENVELOPE.md template in the run dir is the delegate's result surface; no ENVELOPE.md means not complete, and a delegate ending on a user message is failed (batch 2).
- **Cut 3 — Writer role deleted.** No read-only implementer lane. Role startup validation (declared tools must exist and load) is kept (batch 2: unloadable child-tool declarations refuse at startup).
- **Cut 4 — One durable run dir owns delegate lifecycle state** from creation: the brief exists in the run dir at dispatch by construction (never /tmp, no inferred artifact layout), a durable terminal file replaces receipts and failed marks, the parent sweeps run dirs on inbound events so async completions are incorporated, and review-infrastructure failures get one resume, then inconclusive — never an operator restatement (batch 2).
- **Cut 5 — deliver-change becomes six steps** with Task finalization (acceptance verification, summary, Done, push) before the PR opens; the pre-finalization mergeable window closes; two-state vocabulary ("created locally" / "mergeable now") lands; the existing PR watch is retained for post-handoff drift; pending Checks yield to the watch instead of conflicting polls; and retire refuses until the observer package exists (batch 2 sequence line).
- **Cut 6 — REVIEW.md counter mandate deleted** (parallel net production-LOC and decision-point deltas per fix commit). Smallest-resulting-system and fence-or-shrink stay; the counter portion of `decision-5` is reversed.
- **Cut 7 — Intake identity constraints relaxed** to named-branch-checkout verification; the existing-result and integer-only Task identity rejections go. Keeps ride here: `backlog decision update --content` (noninteractive decision-body authoring) and one atomic backlog doc supersede command that re-ids a colliding unmerged document, updates Task references, and emits an append-only old-to-new receipt.
- **Cut 8 — Intercom single-flight.** A second concurrent ask becomes an ordinary tool error; send is refused while an inbound ask is pending, directing the caller to reply.
- **Cut 9 — Observer integrity.** One entry per evidence object, the assembler is the sole writer of analysis.json, and explicit run lineage is the only session-membership source — the run dir is the Change boundary, and whole-accountable-session cross-change attribution is impossible by construction (batch 2).
- **Cut 10 — Architect/disposition-pipeline ceremony deleted** (operator bundle directive given verbally in the architect session after the first handoff was confirmed): generic validation rejections, in-memory context loss, stale-evidence refusals, exact-phrase retry rituals, and hand-cranked pending intakes. Settled-batch immutability and verified intake results stay; the refusal-and-retry theatre goes.
- **Keeps and small additions** — `backlog decision update --content`; one atomic backlog doc supersede command with append-only receipt; intercom single-flight; bash refusal of unsupported arguments; role startup validation; one structured package-inventory command replacing the bespoke README display-parser (batch 2); pi-lens turn-end autoformat gated by the session edit ledger or deleted (batch 2); work-order prose naming one materialization function for any rebuildable derived store (batch 2).

## Ownership boundary

- `bin/qq-dispatch`, `bin/qq-observe`, `bin/qq-change`, `bin/qq-execution-profiles`, `bin/lib/**`
- `extensions/**` delegate environment wiring (including the intercom single-flight seam on the owned Pi surface)
- `delegation/manifests/**` — roles minus the writer role; completion-envelope template replaces structured-output schemas; observer schemas adjusted
- `skills/deliver-change`, `skills/delegate-batch`, `skills/architect`, `skills/agent-messaging`, and confinement-era prose in other owning skills
- `REVIEW.md` (counter mandate removal), `CONCEPTS.md`, `README.md`, `AGENTS.md` (vocabulary and T-177 posture reversal)
- the Backlog CLI in use (backlog.md), through qq's existing package-patching posture, for the two kept commands
- pi-lens configuration on the owned Pi surface (turn-end autoformat gate) and the package-inventory command's owning surface
- `tests/**` — new-contract tests; confinement fixtures deleted

## Non-goals

- No new confinement, sandbox, or fencing layer in any form; no replacement parity machinery.
- No redesign of Herdr, cockpit, or OpenWiki beyond vocabulary fallout.
- The alignment-contract Change (T-185) is the sibling; this Change does not rewrite grilling's engagement contract.
- No pi-subagents vendor runtime fork; the thin qq adapter posture (`decision-14`) stands.
- Decision-record minting for cross-Change dispositions happens in this Change's checkout before Task finalization (the ledger then switches from exchange citations to record ids); not at intake.

## Success evidence

- Focused tests: dispatch launches an unconfined delegate in a Change worktree; the run dir holds brief, ENVELOPE.md, and terminal state from creation; a delegate without ENVELOPE.md is not complete; a second concurrent intercom ask errors and send-with-pending-ask refuses; bash refuses an unsupported argument; `backlog decision update --content` and doc supersede round-trip with receipt; observer assemble/finalize produces one entry per evidence object with sole-writer explicit lineage; an intake result records against a named-branch checkout without the deleted rejections; the structured package-inventory command replaces the README display-parser; pi-lens autoformat fires only with a session edit ledger (or is gone); retire refuses while its observer package is absent.
- deliver-change reads as six steps with finalization-before-PR; REVIEW.md contains no counter mandate; no Landlock/Landstrip policy seam exists outside history; T-177's global posture is reversed in vocabulary and docs.
- Full native ratchet, shellcheck, and extension tests green; fresh-context code-review PASS; one PR carrying T-184's intent and this plan.
