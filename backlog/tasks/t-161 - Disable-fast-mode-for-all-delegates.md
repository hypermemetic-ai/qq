---
id: T-161
title: Disable fast mode for all delegates
status: In Progress
assignee: []
created_date: '2026-07-25 17:30'
updated_date: '2026-07-25 17:55'
labels: []
dependencies: []
documentation:
  - doc-100
modified_files:
  - bin/qq-dispatch
  - extensions/qq-codex-fast.ts
  - extensions/index.ts
  - tests/test-qq-dispatch.sh
  - tests/test-qq-extension-mount.sh
  - README.md
  - >-
    backlog/decisions/decision-16 -
    Canonical-delegates-use-the-standard-service-tier.md
  - >-
    backlog/docs/plans/doc-100 -
    Plan-—-Disable-fast-mode-for-every-qq-delegate.md
  - backlog/tasks/t-161 - Disable-fast-mode-for-all-delegates.md
type: chore
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Retire qq's automatic fast/priority delegation so every canonical delegate uses the provider standard/default service tier while retaining the existing openai-codex/gpt-5.6-sol:xhigh compute profile.

## Decision ledger

- All canonical qq delegates use standard/default service class; model and xhigh effort stay unchanged — decision-16 and operator direction in the accountable session on 2026-07-25: “Let's stop using fast mode for all of the delegates.”
- Retire the fast extension completely rather than preserve an opt-in delegate bypass — operator-approved plan doc-100 in the same accountable-session exchange on 2026-07-25.
- Preserve the generic patched-Pi service-class seam; this Change alters qq policy, not generic transport/accounting capability — approved non-goal in doc-100; T-153 remains authoritative for the transport seam.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 qq-dispatch launches implementer, reviewer, researcher, and observer without injecting qq-codex-fast.ts or any priority service-tier request.
- [ ] #2 The retired fast extension and its current dispatcher/mount test assumptions are removed without changing delegate model, xhigh effort, confinement, completion, or generic patched-Pi service-class support.
- [ ] #3 Current README/runtime documentation states that canonical delegates use the standard/default service tier, and a durable accepted decision prevents future role-profile work from silently restoring fast mode.
- [ ] #4 Targeted dispatcher and extension-mount checks, applicable Repository checks, and fresh-context code review pass before publication.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Remove the dispatcher's mandatory fast extension, delete the extension, replace priority-specific regressions with standard-tier launch tripwires, update current operating documentation, and record the durable policy decision. Verify targeted and applicable Repository checks, then fresh-context review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The current primary dispatcher was itself the prohibited fast-mode injector, so using the normal implementer route would have violated the operator's immediate directive. The owner applied the bounded deletion in the isolated Change checkout. The observed active priority children were signaled to terminate and their owning sessions were told not to relaunch through the old dispatcher.

Verification: exact role argv regressions prove reviewer, researcher, implementer, and observer receive no injected fast extension; dispatcher and extension-mount focused checks pass; `git diff --check`, Bash syntax, `shellcheck -x`, ratchet, all 35 Repository shell Checks, and all 21 embedded runtime tests pass. Kimi fresh review was unavailable because that account is also quota-exhausted; a fresh read-only GPT-5.6 reviewer was therefore launched through this Change checkout's already-standard dispatcher, not the priority primary dispatcher. Its strict envelope reports PASS with no material findings, context gaps, open questions, or unresolved risks (`/tmp/qq-t161-review-envelope.json`). Production delta is a net 62-line reduction (10 insertions, 72 deletions before Backlog records).
<!-- SECTION:NOTES:END -->
