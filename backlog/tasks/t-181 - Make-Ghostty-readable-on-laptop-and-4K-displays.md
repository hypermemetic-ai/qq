---
id: T-181
title: Make Ghostty readable on laptop and 4K displays
status: Done
assignee: []
created_date: '2026-07-28 03:16'
updated_date: '2026-07-28 03:37'
labels: []
dependencies: []
modified_files:
  - cockpit/ghostty/config
  - cockpit/ghostty/shaders/column-rails.glsl
  - cockpit/README.md
type: bug
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the 4K-only Ghostty geometry with a portable laptop/4K cockpit preference. Keep machine-wide Cinnamon, display, and GPU settings outside qq.

Decision ledger:
- Promote the already-installed MxPlus IBM VGA 8x16 fallback to primary, using its exact native 12 pt / 16 px laptop size and exact 24 pt / 32 px 2x 4K size, with BigBlue TerminalPlus retained as fallback: operator approval, asked-and-answered exchange 2026-07-27 ("try it") following UAT that exhausted BigBlue's clean 12- and 24-pixel laptop choices.
- Keep the existing palette, 12-unit portable padding, 4K-only shader normalization, and machine-wide display boundary unchanged: T-162 and the approved two-preset outcome.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The laptop default uses a clean native or integer-multiple pixel grid at a readable size between BigBlue's rejected 12- and 24-pixel options
- [x] #2 The 4K fullscreen preset uses a clean integer-multiple pixel grid at couch-targeted size
- [x] #3 The Herdr edge shader does not mask sub-4K terminal content and retains its 4K reference behavior
- [x] #4 Fresh focused checks validate the config and exercise laptop and isolated 4K rendering
- [x] #5 Operator accepts the live laptop result; the disconnected 4K target retains explicit isolated render evidence
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update the portable Ghostty defaults and add exact laptop/4K font-size hotkeys. 2. Gate the reference-coordinate Herdr edge mask to 3840-wide surfaces. 3. Align cockpit documentation. 4. Validate the config and measure terminal grids on the laptop display and an isolated 4K display.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-28 03:23
---
Operator UAT rejected the measured 10.5-point grid because the font rendered incorrectly at the laptop resolution. Reopened to use the face's native 9-point/12-pixel grid and repeat visual plus dimensional checks.
---

created: 2026-07-28 03:25
---
Native-size retry is active in the live configuration. Ghostty validation passes; the live 1600x900 capture shows the 9-point pixel grid; an isolated scale-2 1600x900 render measures 96x37; F12 changes it to the 27-point 32x12 grid and F11 restores exactly 96x37; no small-grid warning occurred. Awaiting operator visual acceptance before completion.
---

created: 2026-07-28 03:28
---
Operator UAT found native 9 point clean but too small. A real-display comparison of 12 and 18 point showed 12 point as the proportionate larger candidate; 18 point is reserved as the next exact integer scale if 12 does not pass live UAT.
---

created: 2026-07-28 03:30
---
Correction: 12 point / 16 pixel was a 4:3 scale, not a clean multiple of BigBlue's native 12-pixel grid. That recommendation contradicted the stated invariant and wasted an operator UAT round. Replaced it with the only next exact scale, 18 point / 24 pixel 2x.
---

created: 2026-07-28 03:32
---
Exact-scale correction validates cleanly: at 1600x900 the 18-point/24-pixel default measures 98x37, F12 selects the 27-point/36-pixel grid at 65x25, and F11 restores exactly 98x37. Ghostty config validation, shader compilation, and git diff hygiene pass. No live Ghostty process existed to reload; the next window will load the corrected default. Awaiting operator visual UAT only.
---

created: 2026-07-28 03:33
---
Operator UAT rejected exact 18 point / 24 pixel as too large. BigBlue has no clean size between its 12- and 24-pixel grids. Restoring the known-clean 9-point baseline pending disposition of the recommended installed MxPlus IBM VGA 8x16 native-16-pixel replacement.
---

created: 2026-07-28 03:34
---
Operator approved the MxPlus IBM VGA 8x16 recommendation. Implementing native 12 point / 16 pixel laptop and exact 24 point / 32 pixel 2x 4K presets, with BigBlue retained only as fallback.
---

created: 2026-07-28 03:36
---
Approved MxPlus configuration is active. Face resolution and render logs confirm MxPlus IBM VGA 8x16 primary with BigBlue fallback. At 1600x900, native 12 point / 16 pixel measures 196x56; F12 selects exact 24 point / 32 pixel at 98x28; F11 restores exactly 196x56. At isolated 3840x2160, the 2x preset measures 238x67 and the shader masks x=3180 to #010101 while preserving #cccccc at x=3160/3200. Config validation and diff hygiene pass. Opened a real Ghostty window for operator UAT.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Promoted the already-installed MxPlus IBM VGA 8x16 mixed-format face to primary with BigBlue TerminalPlus retained as fallback. The laptop default is the font's native 12 pt / 16 px grid, the 4K hotkey selects its exact 24 pt / 32 px 2x grid, F11 returns to laptop, horizontal padding is 12 units, and the shader masks Herdr's reference edge only at exact 3840-pixel width. Operator live UAT accepted the laptop result as "alright" and usable after rejecting fractional BigBlue sizes, native BigBlue as too small, and 2x BigBlue as too large. Fresh Checks: Ghostty 1.3.1 validation passed; show-face and render logs confirmed MxPlus primary for representative text/symbols with BigBlue fallback; the live repository mount and both font files resolved; isolated 1600x900 measured 196x56 at native size, F12 measured 98x28, and F11 restored exactly 196x56; isolated 3840x2160 measured 238x67 and produced #010101 at the x=3180 mask with #cccccc on both sides; no physical 4K display was connected in this round; backlog doctor and git diff --check passed.
<!-- SECTION:FINAL_SUMMARY:END -->
