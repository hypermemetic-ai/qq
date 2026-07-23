---
id: doc-81
title: Plan — Session-observer analyst v1 (approved 2026-07-22)
type: other
created_date: '2026-07-22 23:25'
updated_date: '2026-07-23 04:23'
tags:
  - plan
---
# Plan — Session-observer analyst v1 (T-142)

**Status: APPROVED by the operator, accountable project-home session 2026-07-22.** Alignment exchange: accountable project-home session, 2026-07-22.

## Intended outcome

A dedicated qq observer agent that, for every delivered Change, reads the whole
run's session tree post-hoc — accountable session plus delegate/subagent sessions,
including persisted reasoning blocks — and emits a bounded, cited, *ranked* analysis
of harness-improvement opportunities; plus a periodic digest that promotes recurring
findings and re-ranks the opportunities ledger based on operator accept/reject history.
The observer optimizes the **harness** (tools, skills, instructions, workflow), never
the model.

## Settled decisions (asked-and-answered alignment exchange 2026-07-22)

1. **Capture mode: post-hoc session JSONL only.** No live hooks, no span machinery.
   Reaches beyond one Change → mint Backlog decision record in the first build Change.
2. **Optimization target: the harness, not the model.** → decision record, same Change.
3. **Cadence: per delivered Change + periodic digest.**
4. **Scope: whole run tree** — accountable + delegate + subagent sessions.
5. **Build shape: qq-native.** No platform adoption; Phoenix+PXI remains an unexercised
   fallback if analyzer quality disappoints.

## Decisions recommended in this plan (approval = disposition)

1. **Derived-data storage.** Per-Change analyses and the opportunities ledger are
   derived artifacts (regenerable from transcripts): stored append-only under XDG
   state, never tracked in git. Only operator-accepted promotions enter the
   Repository (as Tasks/docs through normal flow). Keeps git history free of
   per-Change telemetry PRs.
2. **Trigger wiring.** One added post-land step in deliver-change: after
   `qq-change land` succeeds, the accountable owner launches the observer on the
   landed Change (async delegation). Every Change gets analyzed by construction;
   no opt-in.
3. **Analyzer output contract.** Schema-bound structured output; every episode
   carries transcript citations (session, message index); top-N findings per run;
   `analysis_failed` record on any analyzer/schema failure (failures never
   masquerade as findings — doc-80 pitfall #1); findings are proposals, nothing
   auto-applies.
4. **Episode taxonomy v1** (MAST adapted to harness targets): **tool-gap**
   (split: *capability-unknown* — tool exists but wasn't surfaced — vs
   *tool-missing*), **instruction-conflict** (co-located waste + contradictory
   live instructions), **friction** (operator corrections), **waste** (retry
   loops, re-derivation), **failure** (MAST modes).

## Architecture (per doc-80 borrow-patterns)

- **Deterministic pre-pass (code, no LLM):** parses transcripts; computes all
  countable facts (turns, tokens, tool calls, error/retry loops, repeated calls,
  operator corrections, durations). Defensive: unknown entry types counted and
  surfaced, never silently dropped. Precision measured against hand-counted
  fixtures. (HarnessScope lesson: naive parsing → confident wrong numbers.)
- **Run-tree assembler:** given a Change, harvest the accountable pi session +
  pi-subagents run sessions into the XDG store at
  landing time. Post-hoc, no instrumentation; also fixes /tmp volatility of
  subagent session files.
- **Observer agent:** read-only delegation manifest + skill carrying the
  procedure, taxonomy, and facet schema. Input: facts JSON + transcripts +
  qq tool/skill inventory (to split capability-unknown vs tool-missing) +
  instruction corpus (AGENTS.md/CONCEPTS/skills/manifests, for conflict
  co-location). Output: validated analysis JSON → rendered analysis doc.
- **Opportunities ledger + digest:** recurrence promotion at 2+ runs;
  Priority/Action/Confidence/Impact ranking; acceptance learning from operator
  dispositions.
- **Calibration:** uncalibrated judges agree with experts only κ=0.77 (MAST) —
  v1 includes a calibration pass where the owner verifies every cited episode on
  the first N real runs before the digest's promotions carry weight.

## Amendment 2026-07-22 — pi-only scope

Operator directive (asked-and-answered exchange, 2026-07-22): qq runs on pi;
codex is removed from qq. The pre-pass and assembler are pi-only; the
pi+codex parsing line and the codex risk item below are superseded, and the
three codex mentions in this document were amended inline the same day.

## Amendment 2026-07-23 — architect-tab consumption model

Operator directive (second exchange, 2026-07-23): the consumption half of this plan is
replaced; production stands with two additions.

**Production (stands, plus):** the post-land headless delegation and the
analysis/`analysis_failed` coverage guarantee are unchanged. Added: no veto window and
no UAT exception on the trigger (UAT outcomes become new Tasks), and the analyst run's
own full session trace is stored beside each analysis document.

**Consumption (replaced):** the operator does not read analysis documents by default;
documents are artifacts and agent-facing sources of truth. Consumption happens in ONE
persistent architect tab in the qq Herdr workspace (qq-space only — methodology
machinery, not per-Repository). A qq-owned pi extension provides a command that opens
a selector over stored analysis rounds (undiscussed first); the operator picks one and
discusses it with the architect — a stateless skill/manifest knowing the XDG store
layout, the ledger, and its role; sessions in the tab are replaceable. Discussion is
grilling-shaped (unpack, accept/reject/reshape); accepted findings become Tasks through
normal flow (T-126 routing, chore branch when no Change is open). A round leaves the
list only on an explicit operator discussed-mark; marks and outcomes are recorded per
round and feed the digest's acceptance learning — this supplies the disposition-capture
mechanism the trigger-wiring section left unspecified. Calibration (first-N citation
verification) happens inside architect discussions.

**Change-sequence impact:** new final Change ⑤ (architect extension + architect
skill/manifest + tab wiring in the qq workspace). Change ③ gains analyst-trace storage;
Change ④ gains discussed-state tracking and mark/outcome recording. Folded in from the
same day's earlier operator note: taxonomy v1 gains a design-question/system-design
episode class, the pre-pass gains reasoning-volume/contortion signals, and the remedy
contract opens to harness-level proposals on all levels — still cited, ranked, and
operator-disposed.

## Change sequence

1. **Reader/pre-pass:** defensive pi transcript parsing (pi-only per the
   amendment below), facts JSON,
   fixtures with hand-counted precision evidence. Mints the two decision records.
2. **Observer v0:** manifest + skill + schema + taxonomy; manual invocation over
   already-delivered Changes; owner calibration of citation validity and finding
   precision.
3. **Assembler + trigger:** run-tree harvest at landing, deliver-change post-land
   step, XDG store, `analysis_failed` delivery verification (every landed Change
   in the window has either an analysis or an explicit failure record).
4. **Ledger + digest:** recurrence, ranking, acceptance learning; first digest.

Each Change: full qq delivery (work order, fresh-context review, Checks, PR,
operator merge).

## Success evidence

- Pre-pass: 100% agreement with hand-counted fixtures for every fact it emits;
  unknown-schema entries surfaced with counts.
- Analyzer (Change 2 calibration): owner verifies every citation resolves and
  scores finding precision honestly; KILL/reshape if citations don't resolve or
  findings are noise.
- Delivery verification: 100% of landed Changes post-Change-3 carry an analysis
  or `analysis_failed` record (no silent skips — doc-80 pitfall #5).
- Digest: promotions are recurrence-backed; operator acceptance tracked; the
  ledger shrinks noise over time (acceptance learning demonstrably affects
  ranking).

## Non-goals (v1)

No live instrumentation or mid-run intervention. No auto-applied changes. No
Phoenix/backend/platform. No retiring the existing trace rig (separate later
Change, separate alignment). No model optimization, eval metrics, or benchmark
rigs. No cross-Repository scope.

## Risks / open items

- Huge sessions: chunk facets then merge (/insights shape); the deterministic
  pre-pass carries global counts so the summarization bottleneck (doc-80
  pitfall #6) can't corrupt statistics.
- Analyzer cost: order $5–15 per Change at research-grade depth (observed
  research run: 381k tokens / $10.86); bounded by top-N and chunking caps.
- PR #205 (T-142 + doc-80) lands first; the Task's decision ledger switches from
  exchange citations to decision-record ids in Change 1, before Task finalization.
