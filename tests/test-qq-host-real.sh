#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
: "${QWEN_TOKEN_PLAN_API_KEY:?set QWEN_TOKEN_PLAN_API_KEY to run the real qq host smoke}"

work=$(mktemp -d "${TMPDIR:-/tmp}/qq-host-real.XXXXXX")
pid=
cleanup() {
  if [[ -n $pid ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT

port=$(node -e '
  const server = require("node:net").createServer()
  server.listen(0, "127.0.0.1", () => {
    console.log(server.address().port)
    server.close()
  })
')
session_id="session-$(node -e 'console.log(crypto.randomUUID())')"
nonce="QQ_DSH_PRO_REAL_$(node -e 'console.log(crypto.randomUUID().replaceAll("-", "").toUpperCase())')"
origin="http://127.0.0.1:$port"

DSH_HOME="$work/dsh-home" \
DSH_TELEMETRY_DISABLED=1 \
QQ_PORT="$port" \
QQ_DSH_SESSION_ID="$session_id" \
QQ_PROJECTS_ROOT="$(dirname "$root")" \
QQ_DSH_PROVIDER=qwen-token-plan \
QQ_DSH_MODEL=deepseek-v4-pro-0813 \
"$root/bin/qq" \
  >"$work/dsh.stdout.log" 2>"$work/dsh.stderr.log" &
pid=$!

for _ in {1..600}; do
  if curl -fsSL --max-time 2 "$origin/qq/" >"$work/startup.html" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    cat "$work/dsh.stdout.log" >&2
    cat "$work/dsh.stderr.log" >&2
    echo "test-qq-host-real: DSH host exited during startup" >&2
    exit 1
  fi
  sleep 0.05
done
grep -Fq "$session_id" "$work/startup.html"

# Exercise pinned DSH creation without spending a second model turn.
curl -fsS --max-time 30 -D "$work/new-session.headers" \
  -H "Origin: $origin" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data '' "$origin/qq/sessions" >"$work/new-session.post.html"
new_session_path=$(awk 'tolower($1) == "location:" { gsub("\\r", "", $2); print $2 }' "$work/new-session.headers" | tail -1)
project_name=${root##*/}
[[ $new_session_path =~ ^/qq/project/$project_name/session/session-[0-9a-f-]{36}$ ]]
curl -fsS --max-time 10 "$origin$new_session_path" >"$work/new-session.html"
grep -Fq 'This DSH session has no transcript yet.' "$work/new-session.html"
grep -Fq "$session_id" "$work/new-session.html"

curl -fsS --max-time 300 \
  -H "Origin: $origin" \
  -H 'HX-Request: true' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "prompt=Reply with exactly $nonce and nothing else." \
  "$origin/qq/project/$project_name/session/$session_id/prompt" >"$work/response.html"
grep -Fq "$nonce" "$work/response.html"
grep -Fq 'qwen-token-plan/deepseek-v4-pro-0813' "$work/dsh.stderr.log"

printf 'test-qq-host-real: pass (%s)\n' "$nonce"
