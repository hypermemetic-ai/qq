---
id: decision-22
title: Drop the pi-subagents 0.37 Change entirely
date: '2026-07-28 05:00'
status: accepted
---
## Context

T-166.3 prepared a pi-subagents 0.37.0 update and receipt repair as fork
candidate commits `87a4eca420615371a6e6a3d8c36fa155bf3ac605` and
`b0bb5d12ec0aa24d0b2b7f1793b90a07aacb19cc`, with the live selected runtime
rolled back to exact pre-Change pin
`f8f0ef71ef70606288e34e10b14949c730cf9dcf`. A 2026-07-28 scope audit found
that the Change did not retire qq machinery, added substantial delegation
runtime surface, carried an unrelated `.gitignore` edit, had contradictory
candidate records, and remained unreconciled with current main. During the
audit, the currently selected runtime again marked a completed reviewer child
failed when `execution-profile-receipt.json` was absent.

## Decision

Drop the pi-subagents 0.37 Change entirely. Do not promote either candidate,
do not open its pull request, and do not continue its repair. The operator
said: “drop it entirely.” The live selected runtime remains exact Git pin
`f8f0ef71ef70606288e34e10b14949c730cf9dcf`. Any future upstream runtime
update, receipt repair, or retry is a new separately aligned Change, not a
resumption of this dropped Change.

## Consequences

- T-166.3 is archived/dropped without completion or delivery; its dropped
  branch may be preserved only as unreferenced Git history, not an active
  Change surface.
- The local T-166.3 worktree/branch are removed and no PR exists.
- The rejected published candidate refs remain immutable provenance only; they
  are not install authorities.
- The missing receipt defect and T-166.4's real-delegate gate concern remain
  open operator-visible risks to address through separately aligned work.
- No Pi settings, npm package state, execution-profile policy, credentials,
  Landstrip policy, or other package baseline is changed by this decision.
