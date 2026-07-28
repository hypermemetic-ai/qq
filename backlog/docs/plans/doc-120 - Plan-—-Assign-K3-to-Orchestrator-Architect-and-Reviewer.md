---
id: doc-120
title: Plan — Assign K3 to Orchestrator Architect and Reviewer
type: specification
created_date: '2026-07-28 04:58'
updated_date: '2026-07-28 04:58'
---
# Plan — Assign K3 to Orchestrator Architect and Reviewer

## Intent

Set the persistent go-forward execution-profile map to exactly three Kimi K3 roles: Orchestrator, Architect, and Reviewer use `kimi-coding/k3` at max effort with provider-default service class. Implementer, Researcher, and Observer use `openai-codex/gpt-5.6-sol` at xhigh with provider-default service class. Install the resulting repository policy as the active private operator-owned profile.

## Ownership boundary

This Change owns `delegation/policies/execution-profiles.json`, the focused policy assertions in `tests/test-qq-execution-profiles.sh`, the README role-map sentence, Task T-182, and this plan. It also performs the documented operator-machine activation step `bin/qq-execution-profiles install` from the Change checkout.

## Non-goals

- No provider, model, effort, or service-class change for Implementer or Researcher.
- No runtime router, launcher, manifest, credential, or delegation architecture change.
- No OpenWiki refresh in this Change.
- No operator merge; the operator merges the PR.

## Decisions and dispositions

- Orchestrator uses Kimi K3 max/provider-default — operator direction "set k3 going forward too" and explicit plan approval in this session.
- Architect and Reviewer also use Kimi K3 max/provider-default, making exactly three K3 roles — operator direction "make review and architect also k3", selection of "Exactly 3 K3 roles", and explicit plan approval in this session.
- Observer returns to GPT-5.6 Sol xhigh/provider-default — operator direction "there was a change to set observer to k3. but I prefer gpt5.6" in this session.
- Implementer and Researcher remain GPT-5.6 Sol xhigh/provider-default — existing repository baseline retained under the explicit approved plan in this session.

## Success evidence

- `tests/test-qq-execution-profiles.sh` passes against the new map.
- The repository test suite passes.
- `bin/qq-execution-profiles verify` passes after installation from this checkout.
- `jq` confirms exactly Orchestrator, Architect, and Reviewer resolve to `kimi-coding/k3:max` provider-default, and Implementer, Researcher, and Observer resolve to `openai-codex/gpt-5.6-sol:xhigh` provider-default in both repository and active policies.
- A fresh-context review covers the diff before the PR.
