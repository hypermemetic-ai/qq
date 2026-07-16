---
id: TASK-47
title: 'Fix popup file navigation: close on quit and PTY winsize workaround'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-16 02:46'
updated_date: '2026-07-16 02:52'
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
Root cause probed live: herdr 0.7.4 popups draw the frame at configured size but never set the popup PTY winsize (stty size stayed 24x80 across t0/t1/t2 while the frame rendered near 80%). Fix: both file-navigation popups pinned to 120x32 cells with a matching stty cols 118 rows 30 preamble so PTY, content, and frame agree, and the trailing interactive shell dropped so quitting yazi/broot closes the popup. Reviewer probe confirmed 30x118 and clean bash exit; mechanical AC verification, live popup re-check at operator sign-off. Percent sizing returns when upstream sets the winsize; upstream issue drafted pending operator approval to post.
<!-- SECTION:FINAL_SUMMARY:END -->
