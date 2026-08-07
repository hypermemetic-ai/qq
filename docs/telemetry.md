# Telemetry tab

The Telemetry tab is a display-only terminal panel for live provider capacity. It shows Kimi weekly and five-hour usage, Codex seven-day usage and credits, DeepSeek balance, and Qwen official or explicitly labeled machine-observed usage. Provider fetch failures remain visible as unavailable rows.

The tab does not host a Pi session. T-214.1 must never bind an actor to it.

## Create or relaunch the tab

From the qq repository, create the tab without taking focus:

```sh
herdr tab create --workspace wM --label Telemetry --no-focus --cwd /home/qqp/projects/qq
```

The command returns the new tab and pane identifiers. Copy its pane identifier and launch the panel:

```sh
herdr pane run <PANE_ID> /home/qqp/projects/qq/bin/qq-telemetry
```

Use the same `herdr pane run` command with the Telemetry pane identifier to relaunch the display after it exits. In the panel, `r` forces a refresh and `q` quits.

`cockpit/` is intentionally untouched. It is a config-only surface; the Telemetry tab is created and run through Herdr commands rather than repository cockpit configuration.

## Qwen browser cookies

Qwen official usage is gated on an operator-confirmed Firefox cookie refresh:

```sh
bin/qq-telemetry-cookies refresh
```

The command reads only `qwencloud.com` rows from the Firefox `*.default-release` profile. It first prints cookie **names and counts only**, then asks `continue? [y/N]`. Only an explicit `y` writes `~/.local/state/qq/telemetry/qwen.cookies`; the file is fixed at mode 600. Refresh then performs the usage, quota-config, and subscription gateway round-trip.

Other inspection commands are:

```sh
bin/qq-telemetry-cookies status
bin/qq-telemetry-cookies validate
```

`status` reports file metadata, domain counts, and gateway availability without cookie values. `validate` reports only non-secret provider usage metadata and tier ceilings.

## Cadence and overrides

The panel defaults to a 30-second display refresh and a 300-second Qwen official-gateway cadence:

- `TELEMETRY_REFRESH` — panel refresh interval in seconds.
- `TELEMETRY_QWEN_GW_CADENCE` — Qwen gateway interval in seconds.
- `TELEMETRY_QWEN_COOKIE_FILE` — alternate Qwen cookie-file input for the panel.
- `TELEMETRY_QWEN_COOKIE` — in-memory Qwen Cookie header override.
- `TELEMETRY_QWEN_SEC_TOKEN` — in-memory gateway token override.
- `TELEMETRY_QWEN_TIER` — fallback tier hint retained for operator compatibility.

For a non-interactive snapshot, run `bin/qq-telemetry --once`.

The Qwen machine meter caches per-session-file metadata and rolling usage at `~/.local/state/qq/telemetry/meter-cache.json`. Changed files are rescanned; rotated and deleted paths are removed.

## Credential rules

The panel reads provider credentials from `~/.pi/agent/auth.json` and Qwen browser cookies from `~/.local/state/qq/telemetry/qwen.cookies`. These files remain machine-local. Never print, log, copy, commit, or report API keys, OAuth material, browser-cookie values, or gateway tokens. Panel and cookie-helper output must contain provider usage and cookie names/counts only—never credential values.
