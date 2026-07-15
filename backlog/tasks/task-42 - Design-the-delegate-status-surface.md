---
id: TASK-42
title: Design the delegate status surface
status: Done
assignee: []
created_date: '2026-07-15 00:53'
updated_date: '2026-07-15 16:37'
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
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A design document settles the status surface: what it shows, where it lives, what feeds it, and how it degrades when a feed is absent
- [x] #2 The design explicitly decides whether the codex app-server adapter is adopted for delegate hosting, steering, or event supply, and what stays deferred
- [x] #3 The chosen design preserves the delegation automation contract: envelope files, single-notification wakes, and sandbox enforcement
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Design settled in doc-43 through a live-evidence design round with three independent review rounds and two in-session operator decisions (2026-07-15). The surface is two-layer: primary — a persistent right side pane in the orchestrator session (operator-chosen from a four-candidate walkthrough after rejecting the demo's down-split) running watch -n 2 cat over a per-repo, per-work-session status file the dispatcher atomically rewrites at stage boundaries it owns (dispatched, working, envelope received/verified, review round N, PR open, blocked, failed, terminal); ambient — herdr agents-sidebar reporting via pane report-agent/report-metadata (--ttl-ms) onto each ticket work session's existing placeholder pane, operator-confirmed as a keeper after a staged live demo (screenshots in assets/doc-43: sidebar rendering, blocked-state escalation to the workspace dot, clean release). App-server explicitly not adopted for hosting, event supply, or steering — codex exec keeps the whole automation contract (sole command delta: --json plus output redirections, capture-only); steering stays exec resume via the thread id read opportunistically from the events artifact; the doc-42 adapter lane stays deferred behind three named revisit triggers. Contract preserved: envelope files, process-exit single-notification wakes, sandbox enforcement all untouched; no owned renderer, no polling, no per-delegate panes. Review: round 1 found 7 defects (all fixed, one — UI chrome rendering — resolved by screenshot evidence), round 2 found 6 (all fixed, incl. single-writer status file and the failed stage), round 3 confirmed 5/6 with one residual state-mapping conflict fixed and self-verified as a one-sentence delta. Follow-up implementation in delegate-batch awaits operator approval as its own ticket.
<!-- SECTION:FINAL_SUMMARY:END -->
