# QQ Herdr distribution

QQ pins an immutable release from the maintained Herdr fork. Herdr's centered-pane Rust source and tests live in the linked `/home/qqp/projects/herdr` repository, not in QQ. QQ linking is repository-local: run `qq-methodology link` from the target checkout, then start a fresh Pi session or run `/reload`; use `qq-methodology inspect` to verify it.

- `downstream/upstream.env` is the fork URL/tag/commit manifest.
- `config.toml` is the live configuration, with an 80-column preferred pane width.
- `qq-herdr-pane-add` is the only QQ-owned add-pane primitive. It fixes direction to right and leaves explicit ratio/layout overrides available through raw Herdr APIs when needed.

## Build and upgrade

```text
qq-herdr-build build
qq-herdr-build install
qq-herdr-activate
qq-herdr-upgrade
```

`qq-herdr-build` verifies the immutable fork tag and commit, checks out that source without QQ patches, runs formatting and tests, builds a release binary, then proves the centered-pane policy and QQ's public CLI operations against one disposable server/client session. `install` atomically writes `~/.local/lib/qq/herdr/bin/herdr`, reports outdated installed lifecycle integrations (including the required Pi integration), and does not update those integrations or switch the running service.

`qq-herdr-activate` validates a Homebrew 0.7.5 server outside the systemd service cgroup, restores the direct Alt-arrow navigation bindings, pins the local client and future service, performs Herdr's live handoff, and refuses success unless every workspace, tab, pane, and pane shell process survives. The current client detaches once; run `~/.local/bin/herdr` at the outer terminal prompt to reconnect (an existing shell may have cached Homebrew's old path).

`qq-herdr-upgrade` checks the latest immutable fork release, or a supplied tag such as `qq-v0.8.1-1`, in a temporary checkout. Pin the printed tag and commit in `upstream.env`, then run the normal build. Upstream synchronization and centered-pane development belong in the linked Herdr repository.

The user service in `systemd/user/herdr.service` points at the pinned binary rather than Homebrew. Switching or restarting that live service is an operator-visible action because Herdr owns the active terminal processes.
