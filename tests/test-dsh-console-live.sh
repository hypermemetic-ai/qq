#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
toolchain="$root/compat/pi2dsh/toolchain"
npm ci --prefix "$toolchain" --no-audit --no-fund >/dev/null

workbench="$root/bin/qq-dsh-workbench"
work=$(mktemp -d "${TMPDIR:-/tmp}/qq-dsh-console-live.XXXXXX")
llm_pid=
dsh_pid=
stream_pid=
post_pid=
cleanup() {
  if [[ -n $post_pid ]]; then
    kill "$post_pid" 2>/dev/null || true
    wait "$post_pid" 2>/dev/null || true
  fi
  if [[ -n $stream_pid ]]; then
    kill "$stream_pid" 2>/dev/null || true
    wait "$stream_pid" 2>/dev/null || true
  fi
  if [[ -n $dsh_pid ]]; then
    kill "$dsh_pid" 2>/dev/null || true
    wait "$dsh_pid" 2>/dev/null || true
  fi
  if [[ -n $llm_pid ]]; then
    kill "$llm_pid" 2>/dev/null || true
    wait "$llm_pid" 2>/dev/null || true
  fi
  rm -f -- "$root/.qq-dsh-workbench-tool-proof"
  if [[ ${QQ_DSH_CONSOLE_KEEP:-0} == 1 ]]; then
    printf 'test-dsh-console-live: kept %s\n' "$work" >&2
  else
    rm -rf -- "$work"
  fi
}
trap cleanup EXIT

node "$root/compat/pi2dsh/llm-stub.mjs" \
  "$work/llm-endpoint" "$work/llm-requests.jsonl" &
llm_pid=$!
for _ in {1..100}; do
  [[ -s $work/llm-endpoint ]] && break
  kill -0 "$llm_pid" 2>/dev/null || break
  sleep 0.05
done
[[ -s $work/llm-endpoint ]] || {
  echo "test-dsh-console-live: localhost model stub did not start" >&2
  exit 1
}
llm_endpoint=$(<"$work/llm-endpoint")
cat >"$work/local-model.patch.yml" <<YAML
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      qwen-token-plan:
        apiKeyEnv: QWEN_TOKEN_PLAN_API_KEY
        baseURL: '$llm_endpoint'
        models:
          - id: deepseek-v4-pro-0813
            name: DeepSeek V4 Pro 0813
            contextWindow: 1000000
            maxTokens: 384000
            input: [text]
            reasoningEfforts:
              high: high
              max: max
            compat:
              thinkingFormat: qwen
              supportsReasoningEffort: true
YAML

export DSH_HOME="$work/dsh-home"

primary_id=session-63a11000-0000-4000-8000-000000000011
secondary_id=session-63a11000-0000-4000-8000-000000000012
session_id=$primary_id
port=$(node -e '
  const server = require("node:net").createServer()
  server.listen(0, "127.0.0.1", () => {
    console.log(server.address().port)
    server.close()
  })
')
origin="http://127.0.0.1:$port"

canonical() {
  printf '/qq/session/%s' "$1"
}

start_host() {
  local -a session_env=()
  if [[ -n $session_id ]]; then
    session_env+=("QQ_DSH_SESSION_ID=$session_id")
  fi
  env \
    HOME="$work/home" \
    XDG_CONFIG_HOME="$work/config" \
    DSH_HOME="$DSH_HOME" \
    DSH_TELEMETRY_DISABLED=1 \
    QWEN_TOKEN_PLAN_API_KEY=qq-dsh-console-local-probe \
    QQ_DSH_CONSOLE_PORT="$port" \
    "${session_env[@]}" \
    "$workbench" --patch "$work/local-model.patch.yml" \
    >"$work/dsh.stdout.log" 2>"$work/dsh.stderr.log" &
  dsh_pid=$!

  for _ in {1..300}; do
    if curl -fsS --max-time 2 "$origin/qq" >"$work/startup.html" 2>/dev/null; then
      return
    fi
    if ! kill -0 "$dsh_pid" 2>/dev/null; then
      cat "$work/dsh.stdout.log" >&2
      cat "$work/dsh.stderr.log" >&2
      echo "test-dsh-console-live: DSH host exited during startup" >&2
      exit 1
    fi
    sleep 0.05
  done
  echo "test-dsh-console-live: DSH host did not become ready" >&2
  exit 1
}

close_stream() {
  if [[ -n $stream_pid ]]; then
    kill "$stream_pid" 2>/dev/null || true
    wait "$stream_pid" 2>/dev/null || true
    stream_pid=
  fi
}

stop_host() {
  close_stream
  kill "$dsh_pid"
  wait "$dsh_pid" || true
  dsh_pid=
}

wait_file() {
  local file=$1
  local text=$2
  for _ in {1..400}; do
    grep -Fq "$text" "$file" 2>/dev/null && return
    sleep 0.05
  done
  echo "test-dsh-console-live: timed out waiting for '$text' in $file" >&2
  exit 1
}

wait_count() {
  local file=$1
  local text=$2
  local expected=$3
  for _ in {1..400}; do
    local count
    count=$(grep -Fc "$text" "$file" 2>/dev/null || true)
    ((count >= expected)) && return
    sleep 0.05
  done
  echo "test-dsh-console-live: timed out waiting for $expected copies of '$text' in $file" >&2
  exit 1
}

open_stream() {
  local client=$1
  local id=$2
  local user_agent=$3
  local route
  route=$(canonical "$id")
  curl -fsS --max-time 5 -A "$user_agent" \
    "$origin$route" >"$work/$client.page.html"
  grep -Fq 'id="console-stream" hx-ext="sse"' "$work/$client.page.html"
  grep -Fq "sse-connect=\"$route/events\"" "$work/$client.page.html"
  grep -Fq 'id="session-panel"' "$work/$client.page.html"
  grep -Fq 'sse-swap="session" hx-swap="innerHTML"' "$work/$client.page.html"
  : >"$work/$client.sse"
  curl -NsS --max-time 120 -A "$user_agent" \
    "$origin$route/events" >"$work/$client.sse" &
  stream_pid=$!
  wait_file "$work/$client.sse" '<form id="composer"'
}

post_prompt() {
  local client=$1
  local id=$2
  local prompt=$3
  local mode=$4
  local encoded
  encoded=$(node -e 'process.stdout.write(new URLSearchParams({prompt: process.argv[1]}).toString())' "$prompt")
  local -a headers=(
    -H "Origin: $origin"
    -H 'Content-Type: application/x-www-form-urlencoded'
  )
  if [[ $mode == htmx ]]; then
    headers+=(-H 'HX-Request: true')
  fi
  curl -fsS --max-time 30 -D "$work/$client.headers" \
    "${headers[@]}" --data "$encoded" \
    "$origin$(canonical "$id")/prompt" >"$work/$client.post.html"
}

post_interrupt() {
  local client=$1
  local id=$2
  curl -fsS --max-time 30 -D "$work/$client.headers" \
    -H "Origin: $origin" \
    -H 'HX-Request: true' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data '' "$origin$(canonical "$id")/interrupt" >"$work/$client.post.html"
}

# Home: one real page owns one SSE stream; send produces running and completed swaps.
session_id=$primary_id
start_host
grep -Fq '<!doctype html>' "$work/startup.html"
grep -Fq "$primary_id" "$work/startup.html"
open_stream home "$primary_id" proof-home
post_prompt home "$primary_id" 'home durable handoff' htmx &
post_pid=$!
wait_file "$work/home.sse" '<form id="interrupt-form"'
wait_file "$work/home.sse" 'home durable handoff'
wait "$post_pid"
post_pid=
! grep -Fq '<section id="session-panel"' "$work/home.post.html"
grep -Fq '<form id="composer"' "$work/home.post.html"
stop_host

# Materialize a second canonical DSH session through the same configured backend.
session_id=$secondary_id
start_host
post_prompt selector-setup "$secondary_id" 'secondary durable session' normal
grep -Eq '^HTTP/[0-9.]+ 303' "$work/selector-setup.headers"
stop_host

# Laptop: restart on the primary id, select the second session, then interrupt live work.
session_id=$primary_id
start_host
open_stream laptop "$primary_id" proof-laptop
grep -Fq 'home durable handoff' "$work/laptop.page.html"
grep -Fq "/qq/session/$secondary_id" "$work/laptop.page.html"
curl -fsS --max-time 5 "$origin$(canonical "$secondary_id")" >"$work/laptop-selected.html"
grep -Fq '<code>session-63a11000-0000-4000-8000-000000000012</code>' "$work/laptop-selected.html"
grep -Fq 'secondary durable session' "$work/laptop-selected.html"
post_prompt laptop-turn "$primary_id" 'laptop interrupt handoff' htmx &
post_pid=$!
wait_file "$work/laptop.sse" '<form id="interrupt-form"'
post_interrupt laptop-interrupt "$primary_id"
grep -Fq 'Interrupt requested for the running DSH turn.' "$work/laptop-interrupt.post.html"
grep -Fq '<form id="composer"' "$work/laptop-interrupt.post.html"
wait "$post_pid"
post_pid=
grep -Fq '<form id="composer"' "$work/laptop-turn.post.html"
wait_count "$work/laptop.sse" 'event: session' 3
close_stream

# Phone is a later independent page, not a simultaneous observer.
open_stream phone "$primary_id" proof-phone/390x844
grep -Fq 'home durable handoff' "$work/phone.page.html"
grep -Fq 'laptop interrupt handoff' "$work/phone.page.html"
post_prompt phone "$primary_id" 'phone durable handoff' htmx &
post_pid=$!
wait_file "$work/phone.sse" '<form id="interrupt-form"'
wait_file "$work/phone.sse" 'phone durable handoff'
wait "$post_pid"
post_pid=
stop_host

# Local reconnect after another host restart reads the launcher's saved session
# identity rather than receiving one from the test process.
session_id=
start_host
session_id=$primary_id
curl -fsS --max-time 5 "$origin/qq/" >"$work/local-again.html"
for prompt in 'home durable handoff' 'laptop interrupt handoff' 'phone durable handoff'; do
  grep -Fq "$prompt" "$work/local-again.html"
done
home_line=$(grep -nF 'home durable handoff' "$work/local-again.html" | head -1 | cut -d: -f1)
laptop_line=$(grep -nF 'laptop interrupt handoff' "$work/local-again.html" | head -1 | cut -d: -f1)
phone_line=$(grep -nF 'phone durable handoff' "$work/local-again.html" | head -1 | cut -d: -f1)
((home_line < laptop_line && laptop_line < phone_line))
find "$DSH_HOME/sessions" -type f \( -name session.jsonl -o -name session.jsonl.zstd \) \
  -print | grep -q .
[[ $(<"$DSH_HOME/qq-console.session") == "$primary_id" ]]

# The selected token-plan DeepSeek Pro route receives DSH's own
# read/write/edit/search/bash schemas, and its deterministic calls execute in
# this repository without pi2dsh.
post_prompt workbench-tools "$primary_id" 'QQ_DSH_NATIVE_TOOL_PROBE' htmx
grep -Fq 'QQ_DSH_NATIVE_TOOL_PROBE_COMPLETE' "$work/workbench-tools.post.html"
[[ $(<"$root/.qq-dsh-workbench-tool-proof") == beta ]]
node - "$work/llm-requests.jsonl" <<'NODE'
const { readFileSync } = require("node:fs");
const requests = readFileSync(process.argv[2], "utf8").trim().split("\n").map(JSON.parse);
const probe = requests.filter(({ body }) => body.messages?.some(
  ({ role, content }) => role === "user" && JSON.stringify(content).includes("QQ_DSH_NATIVE_TOOL_PROBE"),
));
if (probe.length !== 6) throw new Error(`expected 6 native-tool requests, got ${probe.length}`);
for (const { body } of probe) {
  if (body.model !== "deepseek-v4-pro-0813") throw new Error(`unexpected model ${body.model}`);
  const names = body.tools?.map(({ function: fn }) => fn.name) ?? [];
  for (const name of ["read", "write", "edit", "grep", "bash"]) {
    if (!names.includes(name)) throw new Error(`missing native ${name} tool`);
  }
}
const messages = probe.at(-1).body.messages;
const results = new Map(messages.filter(({ role }) => role === "tool").map(
  ({ tool_call_id: id, content }) => [id, JSON.stringify(content)],
));
for (let index = 0; index < 5; index += 1) {
  if (!results.has(`call_qq_workbench_${index}`)) throw new Error(`missing tool result ${index}`);
}
if (!results.get("call_qq_workbench_1").includes("alpha")) throw new Error("native read did not observe write");
if (!results.get("call_qq_workbench_3").includes("beta")) throw new Error("native grep did not observe edit");
if (!results.get("call_qq_workbench_4").includes(process.cwd())) throw new Error("native bash did not pass in repository");
NODE
rm -f -- "$root/.qq-dsh-workbench-tool-proof"

printf 'test-dsh-console-live: pass\n'
