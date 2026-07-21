---
id: T-111
title: Retire yazi cockpit surface in favor of files-widget
status: Done
assignee: []
created_date: '2026-07-19 19:58'
updated_date: '2026-07-21 04:27'
labels: []
dependencies: []
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator preference (T-107, 2026-07-19): files-widget over yazi as the browsing surface. ALIGNED 2026-07-20: full retirement approved via alignment brief; outcome recorded as decision-7 (named replacements: qqroot/qq_space_dir kept + new qqcd; prefix+f/ prefix+shift+f popups deleted, doc-60 KEEP verdict on them superseded; MIME openers/Glow loss accepted with xdg-open and pi read tools named). Tension (historical): yazi/qqy/qqbr/qqroot encode parent-shell cwd changes, Broot eval, focused-herdr-worktree targeting, MIME openers, and prefix+f popups (doc-60 KEEP verdict); files-widget cannot change the parent shell's cwd and lives only inside pi.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 #1 Alignment brief approved before implementation
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Operator direction 2026-07-19 ('legacy stuff needs to go; this isn't a museum'): when this gets its alignment brief, target FULL retirement — solve the parent-shell-cwd and focused-worktree problems properly (or accept their loss with a named replacement), do not frame demotion/keep-yazi as the default.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed via PR #165 (feat/t-111-retire-yazi, merged 2026-07-20): cockpit/yazi deleted, file-navigation.bash shrunk to qqroot/qq_space_dir/qqcd, prefix+f popups removed, MIME/Glow losses accepted per decision-7. Record flip was missed in the Change; repaired by this records chore.
<!-- SECTION:FINAL_SUMMARY:END -->
