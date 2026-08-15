# qq Herdr integration

Herdr's Rust source, tests, build, and installation belong to the linked
`/home/qqp/projects/herdr` repository, not qq. qq linking is repository-local:
run `qq-methodology link` from the target checkout, then start a fresh Pi
session or run `/reload`; use `qq-methodology inspect` to verify it.

- `downstream/upstream.env` records the upstream URL and branch, linked landed
  repository, accepted operator-input capability floor, and base version. It
  does not pin a Herdr product commit.
- `config.toml` is the staged cockpit configuration, including q mode and the
  80-column preferred pane width.
- `plugins/q-mode` owns readiness-gated, pane-bound qq-dictation controls.
- `qq-herdr-pane-add` is the only qq-owned add-pane primitive. It fixes direction
  to right and leaves explicit ratio/layout overrides available through raw
  Herdr APIs when needed.
- `qq-herdr-smoke` proves qq's plugin and public CLI contract against an
  installed Herdr binary. It does not acquire or compile Herdr.

## Build and coordinated activation

Use the Herdr repository's own checks, build, and install workflow. Its landed
`master` tip must contain `HERDR_OPERATOR_INPUT_COMMIT`; that commit is a
capability floor, not a product version. qq intentionally provides no Herdr
build or upgrade wrapper.

qq-dictation likewise owns building and installing Handy. Its
`qq-dictation-commit` marker records build provenance only; q mode does not
compare it with a commit stored in qq. Before forwarding controls, q mode
requires the readiness marker's PID and allowed state, a live process whose
`/proc/<pid>/exe` is the installed Handy executable, and a bounded successful
semantic Handy invocation.

After the owner projects have built and installed their artifacts, the
operator-visible qq cutover steps are:

```text
qq-q-mode-uat preflight
qq-herdr-activate
qq-q-mode-uat post-activate
```

`qq-herdr-activate` validates Handy readiness and the single accepted live Herdr
server in the Ghostty scope and outside the systemd service cgroup. It installs
the staged q mode config, selects the installed client and future service,
performs Herdr's live handoff, links the qq q mode plugin, and refuses success
unless every workspace, tab, pane, and pane shell process survives. The current
client detaches once; run `~/.local/bin/herdr` at the outer terminal prompt to
reconnect.

`qq-q-mode-uat` proves the installed Herdr version, config, plugin, process
readiness, semantic Handy control surface, and retained Left-Control bridge
before presenting the manual focused-cockpit checklist. A successful semantic
helper exit proves only that a control was forwarded to the already-running
Handy instance; it is not a cold-start path or action acknowledgement.

Building and installing Herdr or Handy and activating or restarting either live
product remain explicitly staged operator actions. Do not retire the
Left-Control bridge or change remote/laptop workflows as part of this handoff.
