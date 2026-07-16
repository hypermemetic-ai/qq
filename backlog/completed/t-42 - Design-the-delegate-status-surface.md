---
id: T-42
title: Design the delegate status surface
status: Done
assignee:
  - '@claude'
created_date: '2026-07-15 00:53'
updated_date: '2026-07-15 23:38'
labels: []
dependencies: []
documentation:
  - doc-43
  - doc-42
  - doc-41
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full design round in a fresh session, per operator decision after live UAT (2026-07-14/15) rejected both raw-tail and pane-hosted codex exec rendering as too noisy: headless delegates stay hidden, and delegate visibility becomes a designed status surface instead of process output. Warm-start ingredients from the settling conversation: (1) a labelled UI element informing the operator what is going on — stage-boundary one-liners such as dispatched, working, envelope received, review round N, PR open — with no pane-lifecycle ownership; (2) the codex app-server as candidate substrate: its JSON-RPC thread events could feed a structured surface, and turn/steer restores mid-turn steering of headless workers (doc-41 Q2; the deferred adapter lane in doc-42); (3) whatever surface is chosen must preserve the automation contract — envelope files, single-notification wakes, sandbox enforcement — which operator UAT established as non-negotiable relative to visibility.

Added 2026-07-15 from the accountable-session discussion, carried in so the operator does not have to re-raise it: (4) the session-posture question — why two postures exist at all. deliver-change step-1 migration is the legacy Fable-as-implementer posture, and is purely a UI/attention affordance (tool calls must target the checkout path either way); dispatch-only — every Change a batch of one, the accountable session a permanent fixture of the project home — becomes nearly free once mid-turn steering of headless delegates exists, which is exactly the app-server adapter decision this round already owns. Collapsing to a single posture would give the status surface one stable anchor, close the alt+o home-space gap (no claude agent in the home while migrated), and remove deliver-change step 12's one-way stranding of the accountable pane in retired work sessions. The costs: work-order ceremony on trivial changes (the dispatcher may need a floor for direct small edits), and operator iteration through a delegation boundary until steering lands.

Round 2 (2026-07-15, this session): herdr 0.7.4 shipped the day round 1 settled, adding configurable sidebar row layouts with custom pane/workspace metadata tokens, session-modal popup panes, and CLI/API metadata reporting. This round re-settles the doc-43 design against those primitives and records the AC #4 posture disposition.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A design document settles the status surface: what it shows, where it lives, what feeds it, and how it degrades when a feed is absent
- [x] #2 The design explicitly decides whether the codex app-server adapter is adopted for delegate hosting, steering, or event supply, and what stays deferred
- [x] #3 The chosen design preserves the delegation automation contract: envelope files, single-notification wakes, and sandbox enforcement
- [x] #4 The design records an explicit disposition on the session-posture question: collapse to dispatch-only (retiring deliver-change step-1 migration) or keep both postures, with reasons
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Design settled in doc-43 across two rounds. Round 1 (2026-07-15, PR #90): two-layer surface — primary: a persistent right side pane in the orchestrator session running watch -n 2 cat over a per-repo, per-work-session status file the dispatcher atomically rewrites at the stage boundaries it owns; ambient: herdr agents-sidebar reporting onto ticket work-session placeholder panes. App-server explicitly not adopted for hosting, event supply, or steering; codex exec keeps the whole automation contract (sole delta: --json plus output redirections); the doc-42 adapter lane stays deferred behind three named revisit triggers. Round 2 (same day, task reopened after herdr 0.7.4 shipped): ambient stage text re-based onto custom $stage metadata token rows (workspace report-metadata for Space rows, pane report-metadata for Agent rows), closing round 1's placeholder-pane dependency and its migrated-mode sidebar skip; report-agent retained solely for per-delegate presence and blocked/failed state color (board-driven mode); token write contract settled — single writer per work session, blocked/failed outranks routine stages in the rollup, --clear-token at terminal disposition with --ttl-ms only as the dead-owner backstop, --seq from epoch seconds because herdr ignores lower sequences per source for the pane/workspace lifetime; a session-modal popup accessor over the same status files added as on-demand glass (ships with wiring); the sidebar $stage rows landed with this round's config and are inert until reported. AC #2 re-verified against 0.7.4 — no revisit trigger fired. AC #4 disposition: keep both session postures; collapsing to dispatch-only is gated on the same triggers as the app-server lane (mid-turn steering need, or delegates outliving their dispatcher), at which point dispatch-only becomes presumptive and deliver-change steps 1/12 are redesigned in that Change. The alt+o home gap remains in migrated mode (qq-herdr-snap is space-local) but the home's Space panel now shows the migrated Change's stage row. Implementation is T-45 with live-check ACs covering board-driven and migrated modes, token lifecycle, and the popup accessor.
<!-- SECTION:FINAL_SUMMARY:END -->
