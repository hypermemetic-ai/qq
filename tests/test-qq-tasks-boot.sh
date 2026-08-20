#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
toolchain="$root/dsh"
npm ci --prefix "$toolchain" --no-audit --no-fund >/dev/null

# Scratch launcher tree so sibling presence is the scenario under test.
sim=$(mktemp -d "${TMPDIR:-/tmp}/qq-tasks-boot.XXXXXX")
llm_pid=
dsh_pid=
cleanup() {
  if [[ -n ${dsh_pid:-} ]]; then
    kill "$dsh_pid" 2>/dev/null || true
    wait "$dsh_pid" 2>/dev/null || true
  fi
  if [[ -n ${llm_pid:-} ]]; then
    kill "$llm_pid" 2>/dev/null || true
    wait "$llm_pid" 2>/dev/null || true
  fi
  rm -rf -- "$sim"
}
trap cleanup EXIT

mkdir -p "$sim/bin" "$sim/home" "$sim/config"
cp "$root/bin/qq" "$sim/bin/qq"
ln -s "$toolchain" "$sim/dsh"
ln -s "$root/qq" "$sim/qq"
ln -s "$root/qq-ui" "$sim/qq-ui"
ln -s "$root/qq-relay" "$sim/qq-relay"
ln -s "$root/qq-workflows" "$sim/qq-workflows"

port=$(node -e '
  const server = require("node:net").createServer()
  server.listen(0, "127.0.0.1", () => {
    console.log(server.address().port)
    server.close()
  })
')

stop_host() {
  kill "$dsh_pid" 2>/dev/null || true
  wait "$dsh_pid" 2>/dev/null || true
  dsh_pid=
}

node "$root/dsh/llm-stub.mjs" \
  "$sim/llm-endpoint" "$sim/llm-requests.jsonl" &
llm_pid=$!
for _ in {1..100}; do
  [[ -s $sim/llm-endpoint ]] && break
  kill -0 "$llm_pid" 2>/dev/null || break
  sleep 0.05
done
[[ -s $sim/llm-endpoint ]] || {
  echo "test-qq-tasks-boot: localhost model stub did not start" >&2
  exit 1
}
llm_endpoint=$(<"$sim/llm-endpoint")
settings_file="$sim/architect-settings.json"
cat >"$sim/local-model.patch.yml" <<YAML
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
              thinkingFormat: deepseek
              supportsReasoningEffort: true

- id: qq-workflows
  name: '@hypermemetic-ai/qq-workflows'
  inject: [agents, sessions]
  config:
    settingsFile: '$settings_file'
YAML

origin="http://127.0.0.1:$port"
primary_id=session-63a11000-0000-4000-8000-000000000068

boot() {
  local name=$1
  local state="$sim/$name-state"
  mkdir -p "$state"
  env \
    HOME="$sim/home" \
    XDG_CONFIG_HOME="$sim/config" \
    DSH_HOME="$state" \
    DSH_TELEMETRY_DISABLED=1 \
    QWEN_TOKEN_PLAN_API_KEY=qq-tasks-boot-probe \
    QQ_PORT="$port" \
    QQ_PROJECTS_ROOT="$(dirname "$sim")" \
    QQ_DSH_SESSION_ID="$primary_id" \
    "$sim/bin/qq" --patch "$sim/local-model.patch.yml" \
    >"$sim/$name.stdout.log" 2>"$sim/$name.stderr.log" &
  dsh_pid=$!
  for _ in {1..300}; do
    if curl -fsS --max-time 2 "$origin/qq/" >"$sim/$name.html" 2>/dev/null; then
      break
    fi
    if ! kill -0 "$dsh_pid" 2>/dev/null; then
      cat "$sim/$name.stdout.log" >&2
      cat "$sim/$name.stderr.log" >&2
      echo "test-qq-tasks-boot: $name host exited during startup" >&2
      exit 1
    fi
    sleep 0.05
  done
  [[ -s $sim/$name.html ]] || {
    cat "$sim/$name.stdout.log" >&2
    cat "$sim/$name.stderr.log" >&2
    echo "test-qq-tasks-boot: $name host did not become ready" >&2
    exit 1
  }
}

# Host boots if qq-tasks is absent. Sibling scan must not require it.
boot absent
node - "$sim/absent-state/profiles/qq/package.json" "$sim/qq" "$sim/qq-ui" "$sim/qq-relay" "$sim/qq-workflows" <<'NODE'
const [manifestPath, qqPath, uiPath, relayPath, workflowsPath] = process.argv.slice(2);
const manifest = require(manifestPath);
const deps = manifest.dependencies ?? {};
const linked = (name, path) => deps[name] === `link:${path}` || deps[name] === `file:${path}`;
for (const [name, path] of [
  ["@hypermemetic-ai/qq", qqPath],
  ["@hypermemetic-ai/qq-ui", uiPath],
  ["@hypermemetic-ai/qq-relay", relayPath],
  ["@hypermemetic-ai/qq-workflows", workflowsPath],
]) {
  if (!linked(name, path)) throw new Error(`qq profile is missing ${name}: ${deps[name]}`);
}
if (deps["@hypermemetic-ai/qq-tasks"] !== undefined) {
  throw new Error(`qq profile unexpectedly binds qq-tasks: ${deps["@hypermemetic-ai/qq-tasks"]}`);
}
NODE
stop_host

# Sibling scan picks up qq-tasks when the tree is present.
ln -s "$root/qq-tasks" "$sim/qq-tasks"
: >"$sim/llm-requests.jsonl"
boot present
node - "$sim/present-state/profiles/qq/package.json" "$sim/qq-tasks" <<'NODE'
const [manifestPath, tasksPath] = process.argv.slice(2);
const manifest = require(manifestPath);
const dep = manifest.dependencies?.["@hypermemetic-ai/qq-tasks"];
if (dep !== `link:${tasksPath}` && dep !== `file:${tasksPath}`) {
  throw new Error(`qq profile is missing qq-tasks: ${dep}`);
}
const bundles = manifest.dsh?.profile?.bundles ?? [];
if (!bundles.includes("@hypermemetic-ai/qq-tasks")) {
  throw new Error(`qq profile did not activate the qq-tasks bundle: ${bundles.join(",")}`);
}
NODE

post_prompt() {
  local name=$1
  local text=$2
  local encoded
  encoded=$(node -e 'process.stdout.write(new URLSearchParams({prompt: process.argv[1]}).toString())' "$text")
  curl -fsS --max-time 30 \
    -H "Origin: $origin" \
    -H 'HX-Request: true' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data "$encoded" \
    "$origin/qq/session/$primary_id/prompt" >"$sim/$name.html"
}

wait_ready() {
  local name=$1
  local text=$2
  for _ in {1..400}; do
    curl -fsSL --max-time 2 "$origin/qq/" >"$sim/$name.settled.html" 2>/dev/null || true
    if grep -Fq "$text" "$sim/$name.settled.html" 2>/dev/null \
      && grep -Fq 'status-ready' "$sim/$name.settled.html" 2>/dev/null; then
      return
    fi
    sleep 0.05
  done
  echo "test-qq-tasks-boot: timed out waiting for '$text' to settle" >&2
  exit 1
}

post_prompt select '/workflows architect'
post_prompt talk 'Reply with exactly tasks-boot and nothing else.'
wait_ready talk 'tasks-boot'

node - "$sim/llm-requests.jsonl" <<'NODE'
const { readFileSync } = require("node:fs");
const requests = readFileSync(process.argv[2], "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const turn = requests.find(({ body }) => body.messages?.some(
  ({ role, content }) => role === "user" && JSON.stringify(content).includes("tasks-boot"),
));
if (!turn) throw new Error("missing architect talking turn");
const names = turn.body.tools?.map((tool) => tool.function?.name ?? tool.name) ?? [];
if (!names.includes("rundown")) throw new Error(`missing rundown; have ${names.join(",")}`);
for (const name of ["notes_list", "notes_expand", "session_search", "invoke"]) {
  if (!names.includes(name)) throw new Error(`missing ${name}; have ${names.join(",")}`);
}
for (const pixel of ["design_loop_start", "design_loop_capture", "design_loop_measure", "design_loop_seed", "design_loop_stop"]) {
  if (names.includes(pixel)) throw new Error(`pixel tool ${pixel} registered on architect`);
}
NODE

post_prompt desk '/workflows iterate'
post_prompt desk_talk 'Reply with exactly tasks-desk and nothing else.'
wait_ready desk_talk 'tasks-desk'

node - "$sim/llm-requests.jsonl" <<'NODE'
const { readFileSync } = require("node:fs");
const requests = readFileSync(process.argv[2], "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const turn = requests.find(({ body }) => body.messages?.some(
  ({ role, content }) => role === "user" && JSON.stringify(content).includes("tasks-desk"),
));
if (!turn) throw new Error("missing iterate desk turn");
const names = turn.body.tools?.map((tool) => tool.function?.name ?? tool.name) ?? [];
if (names.includes("rundown")) throw new Error("rundown must not register on the desk");
for (const pixel of ["design_loop_start", "design_loop_capture", "design_loop_measure", "design_loop_seed", "design_loop_stop"]) {
  if (names.includes(pixel)) throw new Error(`pixel tool ${pixel} registered on the desk`);
}
NODE

stop_host
printf 'test-qq-tasks-boot: pass\n'
