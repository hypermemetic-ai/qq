# Pinned DSH Web operator-surface QA

This runbook evaluates only the stock official DSH Web UI pinned in [`pins.json`](pins.json). It does not install or compare community clients, change delegation, cut over the operator runtime, or remove Pi/Herdr. The recorded result is [`web-evidence.json`](web-evidence.json).

## Install and launch

Requirements are the same as the compatibility harness: Linux, Node.js 22.19 or newer, npm, and network access for the clean install.

```bash
npm ci --prefix compat/pi2dsh/toolchain --no-audit --no-fund

qa_home=$(mktemp -d)
export DSH_HOME="$qa_home/dsh-home"
compat/pi2dsh/toolchain/node_modules/.bin/dsh web \
  --host 127.0.0.1 --port 3080
```

The package version and integrity come from the existing exact toolchain lock and `pins.json`. Keep the bind on `127.0.0.1`: the browser can execute tools on the host.

In a clean browser profile, open `http://127.0.0.1:3080`, accept the testing notice, and choose **Configure later**. No model credential is needed for surface QA. Choosing a real workspace and submitting a probe is safe without a credential: the pinned runtime durably records the user turn and stops locally with `MISSING_CREDENTIAL` before model traffic.

## Reproduce the QA matrix

Use browser developer tools or equivalent automation to confirm `window.innerWidth` and `window.innerHeight`.

1. At **1440x900**, add a disposable workspace, create a session, and inspect the sidebar, transcript, composer, Settings, and **Settings > Plugins**.
2. In **Settings > General**, select **Dark**. Confirm `$DSH_HOME/settings.yaml` contains `ui-theme.preference: dark`. Press Tab once to focus **System**, press Enter, and confirm the preference changes to `system`.
3. Close Settings with Escape. In the composer type `keyboard`, press Shift+Enter, type `probe`, and confirm the value has two lines. Press Enter and confirm the user bubble contains both lines. Without a key, `MISSING_CREDENTIAL` is the expected local result.
4. At **390x844**, inspect the new-session and transcript views with the sidebar collapsed. Then open the sidebar, select the session, and open Settings. Capture both states; the pinned stock UI squeezes the transcript beside the 280px sidebar and keeps a two-column Settings dialog whose content column clips and wraps controls.
5. Check the browser console, uncaught page errors, and failed network requests at both sizes. The observed run was clean apart from the intentional credential result rendered by the application.

The UI customization paths exercised by this run are:

- live, persisted General settings (agent preset, permission mode, locale, theme, and busy-input behavior);
- plugin configuration and inventory in **Settings > Plugins**;
- the Web profile's user composition layer at `$DSH_HOME/profiles/web/cordis.patch.yml`;
- official package composition with `dsh plugin --profile web add <package>` and disposable overlays with `--patch <path>`.

Those Cordis seams can replace or add browser slot occupants, but they are development/configuration seams rather than an end-user layout editor.

## Safe second-device access

Do not bypass the official all-interfaces refusal. Keep the server command above on loopback. From each authenticated operator device, create a local SSH forward to the DSH host:

```bash
ssh -N \
  -L 127.0.0.1:13080:127.0.0.1:3080 \
  operator@dsh-host
```

Open `http://127.0.0.1:13080` on that device. A phone needs an SSH client that supports local port forwarding. The browser retains a loopback authority, DSH creates no non-loopback listener, and SSH supplies the authenticated transport. Grant the tunnel only to trusted operator accounts/devices because the page still carries host code-execution authority.

The observed continuity probe used a real `ssh -L` process and a second independent browser origin. The second client listed the first client's workspace and session and loaded its persisted multiline prompt. Both tunnel endpoints happened to be on the QA host, so this proves the transport/UI continuity but not a physical-phone deployment.

Confirm the security boundary separately:

```bash
set +e
DSH_HOME=$(mktemp -d) \
  compat/pi2dsh/toolchain/node_modules/.bin/dsh web \
  --host 0.0.0.0 --port 0
printf 'exit=%s\n' "$?"   # expected: 1
set -e
```

The pinned command must report that `0.0.0.0` is intentionally unsupported because it would expose remote code execution. A specific Tailnet/LAN IP is not a supported alternative in this pin: the Web server schema accepts only `127.0.0.1` or `0.0.0.0`.

## Verdict: reject

The pinned stock UI is polished on desktop, has real Cordis customization seams, preserves sessions across browser clients, and supports basic keyboard form/composer behavior. It does not meet this ticket's complete operator requirement: the phone Settings/sidebar states are not usable enough, efficient global keyboard navigation is absent, and remote devices need an external per-device tunnel. Keep Herdr/Pi unchanged and do not cut over on this evidence.
