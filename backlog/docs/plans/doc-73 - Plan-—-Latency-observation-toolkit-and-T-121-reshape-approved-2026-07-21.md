---
id: doc-73
title: Plan — Latency-observation toolkit and T-121 reshape (approved 2026-07-21)
type: other
created_date: '2026-07-21'
---
# Plan — Latency-observation toolkit and T-121 reshape

**Owning Task:** T-127. **Approved:** operator, explicit approval in the
accountable project-home session, 2026-07-21 ("Approve as briefed"). Captured
per grilling (approved plans land as Backlog plans docs).

## Intended outcome

T-121 reshaped to the observation-first direction and the session's records
landed on main through one Change, so the next batch (the latency-observation
toolkit, T-127) starts from a clean board in a fresh session.

## Boundary and non-goals

Records only in this Change: T-121 rewritten, T-127 created, T-125 decision
ledger completed, this plan captured. Building the toolkit, building
qq-derive, and any skill amendments are out — they ride the implementation
batch.

## Decisions and dispositions

1. **Observation-first direction; the derivation store becomes a candidate
   intervention** that observation evidence selects or kills — operator
   rulings, 2026-07-21 accountable-session exchanges.
2. **Split, not rewrite:** T-121 becomes "derivation store — candidate
   intervention," parked and blocked by T-127; T-127 owns the toolkit with
   doc-71 as its evidence base — operator approval, same exchange.
3. **Toolkit architecture direction per doc-71** — owned thin core
   (session-JSONL seam + TRACEPARENT-style injection at the qq-dispatch
   chokepoints + OTel-shaped spans), disposable local backends only during
   analysis sprints, architecture borrowed from Claude Code and the MIT
   Braintrust pi extension — operator approval ("let's do it"), 2026-07-21.
4. **Sequencing amendment:** the toolkit has no T-95 substrate dependency;
   the 2026-07-20 T-94→T-95→T-121 order is superseded for this work —
   settled in the same exchanges.
5. **Delivery classification:** records Change, no behavioral surface →
   trivial risk, no fresh-context review gate per REVIEW.md; operator merges.

## Evidence base

- doc-71 (latency-tooling build-vs-adopt sweep; owner spot-checked):
  nothing off the shelf measures cross-session, multi-agent SDLC-phase
  latency while staying local-first; hybrid leaning build.
- doc-70 (web-access architecture audit; owner spot-checked) and doc-72
  (HIGH-authority provider sweep): T-125's evidence, landed via PRs #174/#176.

## Success evidence

Main carries the reshaped T-121, T-127 with doc-71 attached, this plan, and
T-125's completed ledger; the board is clean for the fresh session to
dispatch the toolkit batch.
