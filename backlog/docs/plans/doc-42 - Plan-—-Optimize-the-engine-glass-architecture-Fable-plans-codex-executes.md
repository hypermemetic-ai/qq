---
id: doc-42
title: 'Plan — Optimize the engine-glass architecture: Fable plans, codex executes'
type: specification
created_date: '2026-07-14 22:45'
updated_date: '2026-07-15 00:53'
---
# Plan — Optimize the engine/glass architecture: Fable plans, codex executes

Approved by the operator on 2026-07-14 after alignment in the accountable
session, on the evidence of the TASK-35 delivery (a one-session ticket batch
run entirely on harness primitives) and the doc-41 vendor research.

## Intent

Minimize operator attention and Fable token spend on the post-Phase-4
architecture. The accountable Claude (Fable) session composes plans, briefs,
and verdicts; codex (gpt-5.6-sol) executes everything bounded by them.
Ceremony that survived Phase 4 slims to what the delivery evidence supports,
and Phase-4 vocabulary debt is cleared.

## Use pattern

Two operator entry points, one machinery:

- **New work.** The operator describes work to a Fable session in the project
  home. Fable aligns, files the Task, composes the work order, and delegates
  bounded execution codex-first. For a single Change the accountable session
  migrates into the Change's work session per deliver-change.
- **Board-driven dispatch.** The operator tells the session to work the to-do
  list. Fable stays in the project home as dispatcher: takes the unblocked
  frontier, bounds concurrency at 3–5 writing tickets, dispatches one codex
  worker per ticket into its own labeled work session, verifies completion
  envelopes, and carries each ticket through the unchanged gates. The
  dispatcher posture is an explicit, deliberate exception to deliver-change
  step 1.

In both modes the operator talks to exactly one session, and the five gates
(intent alignment, plan approval, review verdict, acceptance, merge) are
unchanged.

## Decisions settled at alignment

1. **Codex-first delegation.** Within plan bounds, execution defaults to
   `codex exec` (workspace-write sandbox, dedicated worktree per writing
   ticket); Claude subagents only when the work needs harness-native tools or
   judgment beyond plan bounds. Operator rationale: Fable is very expensive;
   gpt-5.6-sol is supremely competent over long horizons within the bounds of
   a plan.
2. **Primary optimization target: operator attention.** Token cost falls out
   of codex-first as the second-order win; wall-clock concurrency stays
   bounded by operator review bandwidth (doc-41: roughly 3–5 tickets).
3. **The batch pattern lives in a new small skill** (`delegate-batch`), not in
   deliver-change and not as AGENTS.md prose.
4. **herdr scope: qq-side only.** doc-41's adapter architecture (observing
   `claude agents --json` and the codex app-server) is deferred until Agent
   view and ACP leave research preview.
5. **Review-quality grafts are out of scope** by operator decision, including
   the owned-vs-native review benchmark.

## Changes

1. **TASK-39 — delegate-batch skill.** Work-order brief composition,
   codex-first runtime selection, completion envelope, one worktree per
   writing ticket, concurrency bound 3–5, sequential-vs-fanout per doc-41's
   work-shape table, both entry points, dispatcher posture.
2. **TASK-40 — deliver-change diet round 2.** Attach-existing-checkout
   documented as the default when a checkout exists (harness worktrees adopt
   cleanly; evidence in the TASK-35 delivery); agent-chosen,
   operator-renameable change labels with the CONCEPTS.md work-session
   definition updated to match; the handoff verifies the notification result
   and plainly reports the browser-only fallback when notifications are
   disabled.
3. **TASK-41 — housekeeping sweep.** CONCEPTS.md gains "work order" and
   "completion envelope" and its "agent messaging" entry reflects the
   narrowed skill; an assigned openwiki refresh purges the deleted
   activation-chain description from `openwiki/operations.md`.

## Non-goals

Review-loop changes and grafts (including the benchmark); herdr product or
adapter work; TASK-37 machine identity; changes to the five gates; owned
orchestration runtime code; schedulers or dependency DAGs; scheduled or
headless dispatch entry.

## Evidence of success

Each Change lands as its own green one-PR delivery. TASK-39 additionally
proves itself live: a real ticket batch executed end-to-end through a codex
delegate under the skill, returning a conforming completion envelope,
recorded in task notes. TASK-40 proves an honest handoff signal on a real
delivery. TASK-41's wiki refresh lands as a maintainer docs pull request.

## Sequencing

TASK-39 first; TASK-40 and TASK-41 depend on its vocabulary and may land in
either order after it.

## Amendments

- 2026-07-14 — Operator-approved addition to TASK-40: headless delegates get optional cockpit visibility via a throwaway observability pane opened as a no-focus right split of the accountable pane (accountable keeps roughly 70% width), running tail -f --pid=<delegate-pid> on the delegate's output stream so the pane self-retires when the delegate exits — glass over the process artifact, no pane-lifecycle ownership. Self-retirement verified live; right-split placement corrected by operator UAT after a down-split squeezed the accountable pane (house convention per task-23).
- 2026-07-15 — Observability pane withdrawn by operator UAT: both raw-tail and pane-hosted codex exec rendering judged too noisy against a real panel. Headless delegates stay hidden; delegate visibility moves to a designed status surface owned by TASK-42 (full design round in a fresh session, app-server adapter as candidate substrate for events and steering). The disposition-watch poll interval was tightened from 30 to 5 seconds by operator decision. TASK-40's pane acceptance criterion was removed; its remaining criteria stand.
