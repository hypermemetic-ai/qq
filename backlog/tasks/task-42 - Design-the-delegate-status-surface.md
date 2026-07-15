---
id: TASK-42
title: Design the delegate status surface
status: To Do
assignee: []
created_date: '2026-07-15 00:53'
labels: []
dependencies: []
documentation:
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
- [ ] #1 A design document settles the status surface: what it shows, where it lives, what feeds it, and how it degrades when a feed is absent
- [ ] #2 The design explicitly decides whether the codex app-server adapter is adopted for delegate hosting, steering, or event supply, and what stays deferred
- [ ] #3 The chosen design preserves the delegation automation contract: envelope files, single-notification wakes, and sandbox enforcement
<!-- AC:END -->
