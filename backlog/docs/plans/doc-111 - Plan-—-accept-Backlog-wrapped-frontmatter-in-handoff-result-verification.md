---
id: doc-111
title: Plan — accept Backlog-wrapped frontmatter in handoff-result verification
type: specification
created_date: '2026-07-27 08:40'
updated_date: '2026-07-27 08:40'
tags:
  - plan
  - observer
  - bug
  - handoff
---
# Plan — accept Backlog-wrapped frontmatter in handoff-result verification

**Status:** APPROVED

The operator approved a separate minimal parser-fix Change on 2026-07-27 with “Approve separate fix (Recommended),” then approved the stacked PR #262 base with “Approve stacked base (Recommended).”

## Outcome

Allow `qq-observe record-handoff-result` to scan valid Task frontmatter written by the Backlog CLI when a YAML list scalar is wrapped onto continuation lines. Preserve every existing identity, topology, receipt, hash, approved-plan, decision-ledger, and append-only recording rail.

## Reproduction

A verified intake-result receipt for Architect batch `batch-861f1e8f2428e0025ff75a8ae27d5fc4` is saved, but `record-handoff-result` exits 65 while scanning unrelated registered Task candidates. Backlog has emitted long `modified_files`, `references`, and `documentation` list scalars as an item line followed by one or more indented continuation lines. `backlog_frontmatter()` currently requires every non-empty indented line to start with `-`, so it rejects those valid records before reaching the mapped Task.

## Ownership boundary

This Change owns only the small frontmatter reader used by `qq-observe` handoff-result verification and its focused regression. It is based on PR #262’s committed T-175 head to avoid overlapping writer and Backlog-ID conflicts. It must not alter T-175 behavior, the typed handoff, the verified intake receipt, mapped decisions, Observer artifacts, routing semantics, or T-164/T-164.1/T-176 implementation scope.

## Consequential decisions and dispositions

- Accept continuation lines only as part of a preceding list scalar and keep malformed structures fail-closed — operator-approved separate-fix alignment exchange.
- Use a separate T-175.1 Change stacked on PR #262; publish only after PR #262 lands — operator-approved stacked-base alignment exchange.
- Add no YAML dependency or general parser framework; implement the smallest correction matching Backlog CLI output — same approved boundary and smallest-resulting-system invariant.

## Implementation

1. Add a focused regression fixture containing a valid Backlog-generated wrapped list item and prove the unfixed reader rejects it.
2. Adjust `backlog_frontmatter()` to join valid indented continuation text to the current list item while still rejecting an orphan continuation or malformed list structure.
3. Verify the exact `record-handoff-result` path, malformed-input refusal, Python compilation, focused and applicable Repository Checks, diff hygiene, and fresh-context review.
4. After PR #262 lands, publish this separate Change for operator merge. After this Change lands, retry the already verified exact `record-handoff-result` command.

## Non-goals

No general YAML parser, dependency, Task-format rewrite, unrelated frontmatter normalization, changes to intake mapping, source occurrences, pending-intake semantics, routing, delivery health, Architect context, or T-164 instructions.
