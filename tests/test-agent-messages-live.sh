#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d "$HOME/am.XXXXXX")"
SERVICE_PID=""
cleanup() {
  [[ -z "$SERVICE_PID" ]] || kill "$SERVICE_PID" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT
chmod 700 "$TMP"
mkdir -m 700 "$TMP/state" "$TMP/xdg"
"$ROOT/bin/event-plane" serve --state-dir "$TMP/state" >"$TMP/service.out" 2>"$TMP/service.err" &
SERVICE_PID=$!
for _ in $(seq 1 250); do
  [[ -S "$TMP/state/event-plane.sock" ]] && break
  kill -0 "$SERVICE_PID" 2>/dev/null || { cat "$TMP/service.err" >&2; exit 1; }
  sleep 0.02
done
[[ -S "$TMP/state/event-plane.sock" ]] || { cat "$TMP/service.err" >&2; exit 1; }
node --experimental-strip-types "$ROOT/tests/test-agent-messages-live.mjs" "$ROOT" "$TMP/state/event-plane.sock" "$TMP/xdg"
