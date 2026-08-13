# QQ Herdr distribution

QQ pins Herdr source and carries one deliberately small downstream patch.

- `downstream/upstream.env` is the source/tag/commit manifest.
- `downstream/patches/0001-centered-pane-row.patch` adds `ui.pane_preferred_width`, centers only the pane canvas, and balances horizontal rows after ordinary split-right and close operations.
- `config.toml` is the live configuration, with a 60-column preferred pane width.
- `qq-herdr-pane-add` is the only QQ-owned add-pane primitive. It fixes direction to right and leaves explicit ratio/layout overrides available through raw Herdr APIs when needed.

## Build and upgrade

```text
qq-herdr-build build
qq-herdr-build install
qq-herdr-upgrade
```

`qq-herdr-build` verifies the immutable upstream commit, applies the patch from a clean checkout, runs formatting and tests, builds a release binary, then proves centering and balancing against a disposable server/client session. `install` atomically writes `~/.local/lib/qq/herdr/bin/herdr`; it does not switch the running service.

`qq-herdr-upgrade` checks the latest release, or a supplied version such as `v0.8.1`, in a temporary checkout. A patch conflict blocks the upgrade. If it applies, pin the printed tag and commit in `upstream.env`, then run the normal build.

The user service in `systemd/user/herdr.service` points at the pinned binary rather than Homebrew. Switching or restarting that live service is an operator-visible action because Herdr owns the active terminal processes.
