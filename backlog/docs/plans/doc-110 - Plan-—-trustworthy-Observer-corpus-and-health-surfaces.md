---
id: doc-110
title: Plan — trustworthy Observer corpus and health surfaces
type: other
created_date: '2026-07-27 07:47'
updated_date: '2026-07-27 07:48'
tags:
  - plan
  - approved
---
# Plan — trustworthy Observer corpus and health surfaces

**Status:** APPROVED by the operator in the accountable alignment exchange for T-175.

## Intended outcome

Make decision-relevant operational regressions investigable when their evidence is present, and make failed or incomplete observation visible without turning Observer into a veto or an autonomous decision-maker.

## Ownership boundary

This Change owns guided package instruction-corpus completeness, verify-delivery health classification, the bounded /architect health ingress, directly affected Skill wording, and focused regressions. Immutable Observer run artifacts remain evidence, never implementation state. Repository qualification, TOON encoding, occurrence identity, pending intake, and disposition authority remain unchanged.

## Settled contract

1. Guided assembly copies every tracked Markdown instruction manifest under delegation/manifests recursively from the exact merge commit.
2. verify-delivery keeps covered for successfully analyzed and ledger-applied guided rounds only, adds analysis_failed, retains uncovered, and returns unhealthy status when any failure, gap, or unresolved commit exists.
3. Architect context schema advances to v3 and adds observer_health: at most the 20 newest repository-qualified guided failed or pending rounds plus an omitted count. Rows carry status, Repository/PR/run coordinates, assembled time, and a bounded safe reason. Health participates in context freshness but never occurrence/disposition identity.
4. Health is informational only: no fabricated finding, routing, retry, auto-remediation, Task creation, merge gate, or delivery veto.
5. The existing 131072-byte context limit and 50-finding cap remain; health consumes the same bound and may reduce displayed findings with omitted_findings reported.

## Implementation sequence

1. Add failing disposable fixtures that reproduce nested agent-manifest omission, failed-as-covered delivery output, and absent Architect failed/pending health.
2. Strengthen the assembly fixture so its frozen Change snapshot co-presents a shorter Skill timeout, exact timeout-kill evidence, and the authoritative 2700000ms nested role manifest. Assert package evidence only, never a particular LLM conclusion.
3. Make the corpus path predicate recursive for tracked Markdown below delegation/manifests.
4. Split verify-delivery classification into covered, analysis_failed, and uncovered with explicit unhealthy status/exit behavior.
5. Derive bounded health rows from immutable repository-qualified guided package state; safely bound failure reasons and distinguish unfinished from ledger-incomplete success.
6. Add observer_health to context v3 and context hashing; update the extension validator, TOON prompt, and Architect/deliver-change Skills without adding health rows to selectable occurrences.
7. Run focused Checks, applicable Skill validation, LSP, shell syntax, ratchet, diff checks, and full top-level shell tests as warranted.
8. Run fresh-context review, verify and repair only confirmed in-scope findings, review each fix delta, then publish one PR for operator merge.

## Reproduce-before-fix evidence

- Assembly test fails because corpus/delegation/manifests/agents/implementer.md is absent.
- Delivery test fails because analysis_failed appears in covered and the report exits healthy.
- Routing/extension tests fail because context v2 lacks observer_health and /architect cannot expose failed/pending rounds.

## Checks

- bash tests/test-qq-observe-assemble.sh
- bash tests/test-qq-observe-verify-delivery.sh
- bash tests/test-qq-observe-routing.sh
- bash tests/test-qq-architect-extension.sh
- bash -n bin/qq-observe and primary LSP diagnostics for extensions/qq-architect.ts
- validate changed Skills with the configured Skill validator
- bash tests/test-ratchet.sh; git diff --check; applicable top-level shell suite/CI
- fresh-context code review and fix-delta review

## Non-goals

No T-134.1 timeout correction or T-164. No retry or mutation of batch-861f1e8f2428e0025ff75a8ae27d5fc4. No live run rewriting, finding-cap/ranking changes, auto-remediation, Observer veto, or unrelated provenance architecture.
