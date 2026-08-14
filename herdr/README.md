# qq Herdr distribution

qq pins an exact commit from the maintained Herdr fork. Herdr's centered-pane
and generic operator-input Rust source and tests live in the linked
`/home/qqp/projects/herdr` repository, not in qq. qq linking is
repository-local: run `qq-methodology link` from the target checkout, then start
a fresh Pi session or run `/reload`; use `qq-methodology inspect` to verify it.

- `downstream/upstream.env` pins the acquisition ref, linked landed repository,
  exact landed commit, accepted operator-input commit, and base version.
- `config.toml` is the staged cockpit configuration, including q mode and the
  80-column preferred pane width.
- `plugins/q-mode` owns readiness-gated, pane-bound qq-dictation controls.
- `qq-herdr-pane-add` is the only qq-owned add-pane primitive. It fixes direction
  to right and leaves explicit ratio/layout overrides available through raw
  Herdr APIs when needed.

## Build and coordinated activation

The qq-dictation side is pinned by `plugins/q-mode/qq-dictation.env`. From a
clean checkout at that exact commit, its coordinated cutover begins with its
own `tools/check.sh <exact-commit>`, contained `ops/build/build-local.sh`, and
`ops/install/install-local.sh`. Those steps replace the running Handy product;
keep them staged with the Herdr steps below rather than running either side
piecemeal.

```text
qq-herdr-build build
qq-herdr-build install
qq-q-mode-uat preflight
qq-herdr-activate
qq-q-mode-uat post-activate
```

`qq-herdr-build` fetches the configured fork ref and, while the landed commit is
still local-only, acquires that exact object from the linked Herdr repository. It
checks out only the pinned commit, requires the accepted operator-input commit
in its ancestry, runs formatting and
tests, builds a release binary, records its source commit beside it, then proves
the centered-pane policy and qq's public CLI/plugins against one disposable
server/client session. `install` atomically writes
`~/.local/lib/qq/herdr/bin/herdr` and its commit marker, reports outdated
installed lifecycle integrations (including the required Pi integration), and
does not update those integrations or switch the running service.

`qq-herdr-activate` first requires the pinned qq-dictation build and its live
readiness marker. It then validates the single accepted live Herdr server in
the Ghostty scope and outside the systemd service cgroup, installs the staged q
mode config, pins the local client and
future service, performs Herdr's live handoff, links the qq q mode plugin, and
refuses success unless every workspace, tab, pane, and pane shell process
survives. The current client detaches once; run `~/.local/bin/herdr` at the outer
terminal prompt to reconnect (an existing shell may have cached Homebrew's old
path).

`qq-q-mode-uat` proves the exact Herdr and qq-dictation pins, config, plugin,
process readiness, and retained Left-Control bridge before presenting the
manual focused-cockpit checklist. A successful semantic helper exit proves only
that a control was forwarded to the already-running Handy instance; it is not a
cold-start path or action acknowledgement.

All build, install, activation, and UAT commands above are operator-visible
cutover steps. Stage them together and do not execute them during source-only
integration. In particular, do not retire the Left-Control bridge or change the
remote/laptop workflows in this cutover.

`qq-herdr-upgrade` checks the latest immutable fork release, or a supplied tag
such as `qq-v0.8.1-1`, in a temporary checkout and prints the ref, commit, and
version fields to review. Upstream synchronization and generic operator-input
development belong in the linked Herdr repository.
