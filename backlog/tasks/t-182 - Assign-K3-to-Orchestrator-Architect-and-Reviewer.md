---
id: T-182
title: Assign K3 to Orchestrator Architect and Reviewer
status: In Progress
assignee: []
created_date: '2026-07-28 04:57'
updated_date: '2026-07-28 05:13'
labels: []
dependencies: []
documentation:
  - >-
    backlog/docs/plans/doc-120 -
    Plan-—-Assign-K3-to-Orchestrator-Architect-and-Reviewer.md
modified_files:
  - delegation/policies/execution-profiles.json
  - tests/test-qq-execution-profiles.sh
  - README.md
priority: medium
type: chore
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Set the persistent qq execution-profile map so Orchestrator, Architect, and Reviewer use Kimi K3 at max effort with provider-default service class, while Implementer, Researcher, and Observer use GPT-5.6 Sol at xhigh with provider-default service class. Install the same policy as the active operator-owned profile.

Decision ledger:
- Orchestrator moves to `kimi-coding/k3:max` with provider-default service class — operator direction "set k3 going forward too" and explicit plan approval in this session.
- Architect and Reviewer join Orchestrator as exactly the three K3 roles — operator direction "make review and architect also k3" followed by selection of "Exactly 3 K3 roles" and explicit plan approval in this session.
- Observer returns to `openai-codex/gpt-5.6-sol:xhigh` with provider-default service class — operator direction "there was a change to set observer to k3. but I prefer gpt5.6" in this session.
- Implementer and Researcher remain `openai-codex/gpt-5.6-sol:xhigh` with provider-default service class — existing repository baseline retained under the explicit approved plan in this session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The repository execution-profile policy assigns exactly Orchestrator, Architect, and Reviewer to `kimi-coding/k3:max` with provider-default service class.
- [x] #2 The repository execution-profile policy assigns Implementer, Researcher, and Observer to `openai-codex/gpt-5.6-sol:xhigh` with provider-default service class.
- [x] #3 README and the pinned execution-profile test describe and enforce the same six-role map.
- [x] #4 The active operator-owned profile is byte-exact with the repository policy and `bin/qq-execution-profiles verify` passes.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification 2026-07-28: repository and active policy jq assertions pass for exactly Architect/Orchestrator/Reviewer on kimi-coding/k3:max provider-default and Implementer/Observer/Researcher on openai-codex/gpt-5.6-sol:xhigh provider-default. tests/test-qq-execution-profiles.sh passes; full top-level tests/test-*.sh loop passes; native QQ_LANDSTRIP_BIN delegate-enforcement test passes; bash -n and shellcheck -x pass for the changed test; git diff --check passes. bin/qq-execution-profiles install and verify pass from this checkout; repository and active policies are byte-exact; active file is mode 600, operator-owned, one-link regular file.

Fresh-context review returned APPROVE with no material findings. The reviewer substrate failed after capturing the valid completion envelope because its execution-profile receipt directory had been removed; the same receipt-path infrastructure failure repeated on resume. The reviewer-reported focused-script limitation was confined to its Landstrip substrate following the unchanged O_NOFOLLOW probe; the owner-run focused script passed on the host.
<!-- SECTION:NOTES:END -->
