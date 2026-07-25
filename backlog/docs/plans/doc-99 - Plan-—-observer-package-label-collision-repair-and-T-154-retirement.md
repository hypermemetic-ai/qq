---
id: doc-99
title: Plan — observer package label collision repair and T-154 retirement
type: other
created_date: '2026-07-25 00:45'
---

# Plan — observer package label collision repair and T-154 retirement

## Outcome

Allow `qq-observe assemble` to package all truthfully selected Pi sessions when distinct sources share a safe basename, so merged PR #244 can complete observation and T-154/T-154.2 can retire without rewriting completed runtime metadata.

## Ownership boundary

qq continues to own observer package assembly, persisted-session observation, analysis validation/finalization, and delivery coverage. Pi session JSONL remains the sole agent-content source. This Change affects only collision handling for derived package labels.

## Approved implementation

1. Preserve canonical-source deduplication before label handling.
2. Preserve the requested safe label when it is unused.
3. When another canonical source already owns that label, derive a deterministic safe suffix from the colliding source's canonical path and use the suffixed label.
4. Fail closed only if even the deterministic collision label is already owned by a third distinct source.
5. Add focused fixtures proving distinct same-basename sessions assemble with stable unique labels, repeated references to one canonical session still deduplicate, and existing unique labels do not change.
6. Run focused and repository Checks, then use the corrected checkout's engine to assemble, validate, finalize, and verify delivery coverage for PR #244 without altering runtime status or session content.
7. Summarize and mark T-154/T-154.2 Done only after that evidence passes. Fresh-review the complete delta, deliver one corrective PR, and never merge it.

## Non-goals

- Changing session discovery, selection, timestamps, branch/worktree matching, or source trust.
- Changing copied JSONL content, facts, signals, validation, analysis, ledger, or comparison semantics.
- Renaming labels that are already unique.
- Rewriting completed pi-subagents status records or parent session files.
- Starting the separately approved researcher-only Context7 Change before T-154 retirement.

## Success evidence

- New collision and deduplication regressions pass.
- Existing observer-assembly fixtures pass unchanged.
- PR #244 produces a complete observer package and valid finalized analysis, and `qq-observe verify-delivery` reports coverage.
- T-154/T-154.2 acceptance remains green and both Tasks carry final summaries and Done status.
- All Repository Checks, ratchet, diff check, fresh review, and GitHub CI pass.

## Decision dispositions

- Collision-safe corrective PR rather than runtime metadata rewriting: explicitly selected by the operator on 2026-07-25.
- Narrow deterministic suffix algorithm, regressions, #244 observation, and task retirement: explicitly approved by the operator on 2026-07-25.
- Persisted-session-only content observation: decision-10.
- T-154 ownership and sequencing: decision-14, T-154.2, and approved doc-98.
