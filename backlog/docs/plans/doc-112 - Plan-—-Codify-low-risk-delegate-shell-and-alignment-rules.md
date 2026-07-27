---
id: doc-112
title: Plan — Codify low-risk delegate-shell and alignment rules
type: specification
created_date: '2026-07-27 09:20'
updated_date: '2026-07-27 09:52'
tags:
  - plan
  - architect
  - delegation
  - alignment
---
# Plan — Codify low-risk delegate-shell and alignment rules

**Status:** APPROVED

Approved by the operator on 2026-07-27 through the accountable alignment exchanges recorded below.

## Outcome

Deliver one instruction-only Change across three durable records without adding implementation scope:

- T-164 owns its four previously approved delegate-substrate and operator-alignment rules.
- T-164.1 implements the two new delegate/reviewer rules.
- T-176 is the born-in-worktree integer-ID accountable intake owner mapped to both routed decisions, as required by the verified return seam.

## Consequential decisions and dispositions

- Six-rule instruction-only Change — operator answered “Approve as written (Recommended).”
- Born-in-worktree companion Task after the verified engine rejected existing tracked T-164 — operator answered “Create companion Task (Recommended).”
- Integer-ID T-176 after the engine rejected subtask ID T-164.1 — operator answered “Add top-level intake Task (Recommended).”
- Separate minimal `qq-observe` wrapped-frontmatter correction and stacked PR #262 base after `record-handoff-result` rejected valid Backlog CLI wrapping — operator answered “Approve separate fix (Recommended)” and “Approve stacked base (Recommended).” The correction landed in PR #264; the exact result command then returned `status: verified` and wrote the batch result.
- Append-only plan collision recovery — after concurrent PR #262 landed a different doc-110, the operator answered “Approve append-only recovery (Recommended).” The receipt-bound intake plan remains untouched and untracked at its exact local path/hash; doc-112 is the only T-164 plan that will land. No duplicate plan ID from this Change enters Git history.
- Require every delegate and reviewer work order to place temporary files, redirected logs, generated helpers, npm caches, and reviewer-runnable test scratch beneath confinement-provided `$TMPDIR`, never literal `/tmp` or worktree-local scratch — handoff decision `decision-c57b48e36e9bd16bc2f340abf13ce406` plus the approved alignment.
- Require a Check warning that names an in-scope corrective action to be resolved or reported in the Completion Envelope as an unresolved risk, never represented only as `pass` — handoff decision `decision-45d8a6f24d19be579a4323daf59f654b` plus the approved alignment.
- “For T-164 only, do not land a Backlog decision record; approved doc-112 and this exchange settle the six-rule contract and boundary” — verbatim operator opt-out, 2026-07-27.

## Ownership boundary

T-164 owns the original four rules. T-164.1 owns implementation of the two new rules. T-176 owns their structured Architect intake mapping. qq owns the prospective Skill instructions. Runtime confinement, pi-subagents, the Completion Envelope schema, Observer provenance, and historical records remain unchanged.

## Non-goals

No runtime or confinement change, policy grant, new tool, durable workflow state beyond the required ordinary Tasks/plan/decision, gate, schema, provenance machinery, convergence mechanism, browser/target verification, review redesign, package-inventory capability, or unrelated cleanup.

## Implementation

1. Amend `skills/delegate-batch/SKILL.md` with the exact work-order scratch contract, the one-shot recognized substrate-failure rule, and warning-bearing completion evidence.
2. Amend `skills/code-review/SKILL.md` so every temporary review brief supplies the same exact `$TMPDIR` scratch contract for reviewer-created files, logs, helpers, caches, and runnable-test scratch.
3. Amend `skills/grilling/SKILL.md` so generic continuation cannot select consequential options and broad-class requests are restated before an example narrows them.
4. Keep the resulting instruction set minimal and remove duplication where the same obligation can be stated once at its owning surface.

## Verification

- Validate each changed Skill with Codex Skill Creator `quick_validate.py`.
- Run focused textual/scenario assertions that observe all six rules on the authoritative Skill surfaces.
- Run `bash tests/test-ratchet.sh`, applicable top-level Repository Checks, and `git diff --check`; inspect complete output, including warnings.
- Run fresh-context `code-review`, verify any finding, and review each in-scope correction delta.
- Verify the staged/PR diff excludes the receipt-bound local doc-110 and contains only the three owning Task records, doc-112, and authoritative Skill instructions within the approved boundary.

## Delivery

Commit and push only after the Change is green, open one pull request, finalize T-164, T-164.1, and T-176 in that same pull request, and stop for operator merge. Never merge automatically. After merge, preserve the checkout if the untracked receipt-bound doc-110 prevents automatic retirement.
