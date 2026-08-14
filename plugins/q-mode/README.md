# q mode plugin

This qq-owned Herdr plugin adapts q mode actions to the already-running
qq-dictation process pinned in `qq-dictation.env`.

- `start-or-stop` requires Herdr's exact `HERDR_PANE_ID` and invokes
  `handy --toggle-transcription --herdr-pane <id>` only after the installed
  commit, process executable, PID, and overlay-readiness marker agree.
- `cancel` is targetless and idempotent. If no accepted running process exists,
  it exits without launching Handy.
- Each semantic control is bounded. A secondary process that does not promptly
  forward to the existing instance is terminated instead of becoming a
  cold-start path. A successful exit proves forwarding only, not acceptance or
  completion of the dictation action.

Herdr keeps the small q mode indicator; Handy keeps its active recording and
processing HUD. The existing Left-Control bridge and remote/laptop paths are
not owned or changed by this plugin.
