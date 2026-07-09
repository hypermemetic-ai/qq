---
id: TASK-20
title: 'Humanize pipeline step durations (minutes, not just seconds)'
status: To Do
assignee: []
created_date: '2026-07-09 04:12'
labels:
  - cockpit
  - parallel-ok
  - afk
dependencies:
  - TASK-19
priority: low
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator, 2026-07-08 (watching a live review step): the pipeline view only tracks seconds; long steps read as huge second counts when they are really minutes. Observed: the attach TUI footer shows totals like '598.3s'; 'no-mistakes axi status' reports completed steps as raw duration_ms (e.g. review,completed,0,5576715 — that is 1h32m57s, and nothing says so). Tonight's runs had review steps of 5,576,715 ms (1h32m57s) and 1,244,837 ms (20m45s), and a cancelled run footer read '598.3s' (9m58s) — exactly where seconds stop being readable. Interestingly the in-progress field already humanizes ('active_for: 1h26m'), so the data is there and only the completed/total renderings lag. SCOPE IS UNDECIDED and should be settled before building: (a) the attach TUI and axi status renderings belong to no-mistakes (external MIT tool) — this may be an upstream feature request or PR rather than qq-side work; (b) qq's own bin/qq-gate-view wraps attach and prints its own summary lines (run id, status, outcome, PR), so it can humanize what it prints regardless of upstream; (c) a shared helper is overkill for one format function. Prefer: fix what qq owns, and file upstream for the TUI. Format: h m s with units dropped when zero (1h32m53s, 12m18s, 47s), matching the style no-mistakes already uses for active_for. ROUND to the nearest second, do not truncate — the figures above are rounded (5,576,715 ms is 1h32m56.7s, rendered 1h32m57s; 1,244,837 ms is 20m44.8s, rendered 20m45s), and a truncating implementation would render them 1h32m56s and 20m44s and disagree with this task. Say which one you implemented in the AC evidence. backlog task create -l takes a comma-separated list; repeated -l flags silently keep only the last, which is how this task was first registered with only afk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Durations qq renders itself (bin/qq-gate-view summary lines) print as h/m/s, never bare seconds or raw milliseconds
- [ ] #2 The upstream surface (attach TUI footer, axi status duration_ms) is either fixed upstream or a filed issue/PR is linked in this task
<!-- AC:END -->
