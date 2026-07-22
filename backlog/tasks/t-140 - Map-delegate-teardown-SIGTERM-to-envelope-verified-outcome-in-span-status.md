---
id: T-140
title: Map delegate teardown SIGTERM to envelope-verified outcome in span status
status: Done
assignee: []
created_date: '2026-07-22 00:15'
updated_date: '2026-07-22 16:05'
labels: []
dependencies: []
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-79 follow-on (SELECT #1). 17 of 21 baseline spans end exit=143 (teardown SIGTERM) and map to status=error although their runs delivered complete envelopes; the error rate is useless as a health signal until span status records the run outcome (status.json/envelope) rather than the exit code. Decision ledger: doc-79 ranking, owner analysis 2026-07-22; batch delegation (T-140 + T-141) and T-141's qq-side approach — asked-and-answered exchange with the operator, accountable project-home session 2026-07-22.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered via branch t140-span-status-outcome: read-time outcome resolution in bin/qq-observe (qq-dispatch and the append-only store untouched). Teardown-signaled dispatch spans (exit 143/130/129, run.id != manual) resolve against pi-subagents' <runtime-root>/async-subagent-runs/<run.id>/status.json: complete→ok, failed/stopped→error, missing/unreadable/malformed/oversize→error unresolved; summarize aggregates resolved status and --json exposes per-span raw/resolved status + outcome note (span_statuses). status.json reads capped at 1 MiB; outcome-state handling total for every JSON shape.

Two confined review rounds, both findings owner-reproduced pre-fix and post-fix: round 1 unbounded json.load MemoryError (fenced, 8892d42), round 2 unhashable-state TypeError introduced by the round-1 shrink (class-killing isinstance gate, 6d7315c). Fix-delta review round 2: ACCEPT. REVIEW.md counters discharged: fix commits +2 LOC/+0 DP and +0 LOC/+1 DP; one same-fix-smaller regeneration spent and retained (+78/+18 → +76/+17). Owner evidence: native full suite 0 failures at HEAD; regression tests fail at tests-only commit 7f540e7 (exit 1), pass at HEAD; live-store proof — 10 baseline teardown spans resolve ok (complete), remaining errors match pi-subagents failed run states; store untouched.
<!-- SECTION:NOTES:END -->
