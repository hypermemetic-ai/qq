# q mode plugin

This qq-owned Herdr plugin adapts q mode actions to the already-running
qq-dictation process. `qq-dictation.env` records the linked repository relation
and the accepted pane-targeting capability floor, not a product commit pin.

- `start-or-stop` requires Herdr's exact `HERDR_PANE_ID` and invokes
  `handy --toggle-transcription --herdr-pane <id>` only after the runtime marker
  PID and allowed state identify a live process whose executable is the
  installed Handy executable.
- `cancel` is targetless and idempotent. If no accepted running process exists,
  it exits without launching Handy.
- Escape and Enter both leave q mode and invoke `cancel` through `on_exit`;
  neither submits dictation. Space remains the start, stop, and submit control.
- The installed `qq-dictation-commit` marker is build provenance only and is
  not part of q mode readiness.
- Each semantic control is bounded. A secondary process that does not promptly
  forward to the existing instance is terminated instead of becoming a
  cold-start path. A successful exit proves forwarding only, not acceptance or
  completion of the dictation action.

Herdr keeps the small q mode indicator; Handy keeps its active recording and
processing HUD. The existing Left-Control bridge and remote/laptop paths are
not owned or changed by this plugin.
