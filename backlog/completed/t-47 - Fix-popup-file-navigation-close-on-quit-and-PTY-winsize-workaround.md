---
id: T-47
title: 'Fix popup file navigation: close on quit and PTY winsize workaround'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-16 02:46'
updated_date: '2026-07-16 03:07'
labels: []
dependencies: []
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator UAT on PR #95's popup conversion found two gaps: quitting yazi left a popup shell requiring a typed exit, and markdown rendered wrong at the new panel size. Probes established the root cause of the second: herdr 0.7.4 draws the popup frame at the configured size but never sets the popup PTY winsize, which stays 24x80 for the popup's lifetime (t0/t1/t2 stty probes, 2026-07-15; no fix on upstream master). Fix: drop the trailing interactive shell so quit closes the popup, and pin the popups to 120x32 cells with a matching stty preamble so content, PTY, and frame agree. Percent sizing returns when upstream fixes the winsize.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Quitting yazi or broot closes the popup without a typed exit
- [x] #2 A markdown file opened from the popup renders with correct wrapping
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Two corrective rounds. Round 1 shipped close-on-quit plus a 120x32 fixed frame with stty 118x30 — broken live: the frame exceeded the tiled panel area and clamped while the PTY claimed 118 columns, smearing every redraw. Root cause of the sizing error: an unverified terminal-width assumption. Round 2 measured the layout via herdr api snapshot (tiled area 104x33 at x=29, terminal ~133 cols) and the operator tuned the final size live on a temporary binding before shipping: 74x29 frame, stty 72x27, verified rendering, quit-to-close, and centering by hand. The underlying herdr 0.7.4 bug (popup PTY winsize never set, stays 24x80) is probed and documented; an upstream issue draft is parked pending operator approval. Percent sizing returns when upstream fixes the winsize.
<!-- SECTION:FINAL_SUMMARY:END -->
