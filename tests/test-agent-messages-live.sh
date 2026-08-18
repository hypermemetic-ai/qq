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
mkdir -m 700 "$TMP/xdg" "$TMP/xdg/qq-relay"
relay_state_home="$TMP/xdg"
relay_state_dir="$relay_state_home/qq-relay"
relay_socket="$relay_state_dir/qq-relay.sock"
"$ROOT/bin/qq-relay" serve --state-dir "$relay_state_dir" >"$TMP/service.out" 2>"$TMP/service.err" &
SERVICE_PID=$!
for _ in $(seq 1 250); do
  [[ -S "$relay_socket" ]] && break
  kill -0 "$SERVICE_PID" 2>/dev/null || { cat "$TMP/service.err" >&2; exit 1; }
  sleep 0.02
done
[[ -S "$relay_socket" ]] || { cat "$TMP/service.err" >&2; exit 1; }
"$ROOT/bin/qq-relay" --state-dir "$relay_state_dir" inspect '{"view":"health"}' \
  | grep -Fq '"service":"qq-relay"'
node --experimental-strip-types "$ROOT/tests/test-agent-messages-live.mjs" "$ROOT" "$relay_socket" "$relay_state_home"
