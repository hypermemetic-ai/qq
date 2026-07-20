---
id: T-111
title: Retire yazi cockpit surface in favor of files-widget
status: To Do
assignee: []
created_date: '2026-07-19 19:58'
updated_date: '2026-07-19 20:21'
labels: []
dependencies: []
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator preference (T-107, 2026-07-19): files-widget over yazi as the browsing surface. NOT YET ALIGNED — needs its own alignment brief before any Change. Tension: yazi/qqy/qqbr/qqroot encode parent-shell cwd changes, Broot eval, focused-herdr-worktree targeting, MIME openers, and prefix+f popups (doc-60 KEEP verdict); files-widget cannot change the parent shell's cwd and lives only inside pi. Options span: full retirement (accept cwd-loss), demotion (yazi stays for cwd/openers, files-widget for browsing), or cockpit reshaping. Evidence: T-107 trial notes, cockpit/README.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 #1 Alignment brief approved before implementation
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Operator direction 2026-07-19 ('legacy stuff needs to go; this isn't a museum'): when this gets its alignment brief, target FULL retirement — solve the parent-shell-cwd and focused-worktree problems properly (or accept their loss with a named replacement), do not frame demotion/keep-yazi as the default.
<!-- SECTION:NOTES:END -->
