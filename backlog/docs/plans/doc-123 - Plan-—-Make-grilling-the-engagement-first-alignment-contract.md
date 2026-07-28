---
id: doc-123
title: Plan — Make grilling the engagement-first alignment contract
type: specification
created_date: '2026-07-28 06:27'
updated_date: '2026-07-28 06:48'
---

**Status:** APPROVED by the operator in the 2026-07-28 intake alignment exchange (one answered card covering both plans; batches 1d06da51 and a997e834 absorbed).

## Outcome

Alignment becomes an engagement-first contract instead of a form-shaped gate. The accountable owner opens with current-state questions before any recommendation, narrowing, freeze, or defer proposal; the plan is built in conversation with the operator rather than presented as a finished artifact; operator corrections are binding text — restated back verbatim and never silently reverted; exactly one answered question card is recorded on the owning Task as the alignment evidence; and the owner stays read-only until approval. Generic continuation ("continue") is never a consequential disposition, and only an answer to the card's question settles it. The standing conduct rules observed missing in this cycle land as prose in the skills that own each behavior.

Every element is settled by the operator-settled architect batches `batch-1d06da518a08f95d931c3a1a07fc2ae7` (immutable handoff `handoff-1d06da518a08f95d931c3a1a07fc2ae7`, 14 routed findings in scope (b), settled 2026-07-28) and `batch-a997e8347fde61d4b394c0a3dccb0c5e` (immutable handoff `handoff-a997e8347fde61d4b394c0a3dccb0c5e`, 8 routed findings folded into this same Change, settled 2026-07-28), plus the operator's verbal alignment session in the architect tab the same day.

## Contract (grilling rewrite)

- **Questions first.** Current-state questions precede any scope recommendation, freeze/defer proposal, or class narrowing; when the operator names a broad class with an example, the class boundary is restated in conversation before narrowing.
- **Boundaries before proposals.** Affected/unaffected actor and outcome boundaries are engaged with the operator before any incident is generalized into a proposal; a coupled question shape is engaged before dispatch, never collapsed to one failure case.
- **Plan built in conversation.** The plan emerges from the exchange; operator corrections are binding text, restated back, and never reverted by later analysis or profile maps.
- **One answered card.** Exactly one question card is recorded on the owning Task; only an answer to the card's question is a disposition; generic assent is never a disposition; authorization to gather evidence is not plan or disposition approval. The card carries a replaced/retained/undecided dependency inventory and, when roles or seats are decided, a full role-map enumeration reconciled with the operator's count — baseline shorthand is forbidden for decided seats (batch 2).
- **Confirm the unspecified.** One confirmation per field the operator did not specify; nothing is written beyond the request (batch 2).
- **Visible acknowledgment.** A what-happens-next or clarity question gets one visible sentence — sequence, destructive boundary, retained authority — before the next tool call (batch 2).
- **Read-only until approval.** No mutation precedes the operator's explicit approval of the presented plan.

## Standing conduct prose (owning skills)

- **deliver-change / delegate-batch:** status questions are answered from the record, never with a steer; the first authoritative status answers before any recovery tooling; a stop steer is terminal — no new investigation after it; adapter tickets require production-seam acceptance tests; acceptance criteria map to fresh evidence before any merge-ready word.
- **agent-messaging (and intercom users):** never self-prompt; preload only and describe preloaded state as preloaded.
- **deliver-change (land):** foreign drift at land resolves through exactly one preserve-or-restore question, never an operator-input deadlock.
- **operator-input:** staged inputs are verified before use (browser visibility confirmed, console target project confirmed), and the examples include a Pi-activation step — Pi activation is agent-performed, never operator-owned (batch 2).
- **code-review (review contract prose):** two fix rounds in one finding class converges through an operator question, not further loop machinery (batch 2).

## Ownership boundary

- `skills/grilling/SKILL.md` — rewritten as the engagement-first contract
- `skills/deliver-change/SKILL.md`, `skills/delegate-batch/SKILL.md`, `skills/agent-messaging/SKILL.md`, `skills/operator-input/SKILL.md`, `skills/code-review/SKILL.md` — standing conduct prose
- `CONCEPTS.md` — alignment vocabulary (alignment brief becomes the engagement-first contract; one answered card)
- `tests/**` prose/ratchet budgets touched by the rewrite

## Non-goals

- No new tooling, cards UI, or enforcement machinery; this Change is contract prose and vocabulary.
- The giant subtractive Change (T-184) is the sibling; this Change does not touch dispatch, confinement, run dirs, or the Observer.
- No changes to the five operator gates themselves (intent alignment, plan approval, review verdict, acceptance, merge) — only how the owner engages inside them.

## Success evidence

- grilling reads as the engagement-first contract with the elements above, including the batch-2 card contents (dependency inventory, role-map enumeration reconciled with the operator's count), per-unspecified-field confirmation, and the visible-sentence rule; each standing rule appears in its owning skill; operator-input carries staging verification and the Pi-activation example; the review contract carries the convergence prose; CONCEPTS.md vocabulary matches.
- Prose budgets, ratchet, and skill-surface Checks green; fresh-context code-review PASS; one PR carrying T-185's intent and this plan.
