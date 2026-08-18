#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
toolchain="$root/dsh"
npm ci --prefix "$toolchain" --no-audit --no-fund >/dev/null

workbench="$root/bin/qq-dsh-workbench"
work=$(mktemp -d "${TMPDIR:-/tmp}/qq-workflows-boot.XXXXXX")
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
  rm -rf -- "$work"
}
trap cleanup EXIT

node "$root/dsh/llm-stub.mjs" \
  "$work/llm-endpoint" "$work/llm-requests.jsonl" &
llm_pid=$!
for _ in {1..100}; do
  [[ -s $work/llm-endpoint ]] && break
  kill -0 "$llm_pid" 2>/dev/null || break
  sleep 0.05
done
[[ -s $work/llm-endpoint ]] || {
  echo "test-qq-workflows-boot: localhost model stub did not start" >&2
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
              thinkingFormat: deepseek
              supportsReasoningEffort: true
YAML

export DSH_HOME="$work/dsh-home"
primary_id=session-63a11000-0000-4000-8000-000000000065
port=$(node -e '
  const server = require("node:net").createServer()
  server.listen(0, "127.0.0.1", () => {
    console.log(server.address().port)
    server.close()
  })
')
origin="http://127.0.0.1:$port"

env \
  HOME="$work/home" \
  XDG_CONFIG_HOME="$work/config" \
  DSH_HOME="$DSH_HOME" \
  DSH_TELEMETRY_DISABLED=1 \
  QWEN_TOKEN_PLAN_API_KEY=qq-workflows-boot-probe \
  QQ_DSH_CONSOLE_PORT="$port" \
  QQ_DSH_SESSION_ID="$primary_id" \
  "$workbench" --patch "$work/local-model.patch.yml" \
  >"$work/dsh.stdout.log" 2>"$work/dsh.stderr.log" &
dsh_pid=$!

for _ in {1..300}; do
  if curl -fsS --max-time 2 "$origin/qq/" >"$work/startup.html" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$dsh_pid" 2>/dev/null; then
    cat "$work/dsh.stdout.log" >&2
    cat "$work/dsh.stderr.log" >&2
    echo "test-qq-workflows-boot: DSH host exited during startup" >&2
    exit 1
  fi
  sleep 0.05
done
[[ -s $work/startup.html ]] || {
  echo "test-qq-workflows-boot: DSH host did not become ready" >&2
  exit 1
}
grep -Fq "$primary_id" "$work/startup.html"

profile="$DSH_HOME/profiles/qq-console/package.json"
[[ -f $profile ]]
node - "$profile" "$root/qq-workflows" <<'NODE'
const [manifestPath, workflowsPath] = process.argv.slice(2);
const manifest = require(manifestPath);
const dep = manifest.dependencies?.["@hypermemetic-ai/qq-workflows"];
if (dep !== `link:${workflowsPath}` && dep !== `file:${workflowsPath}`) {
  throw new Error(`qq-console profile is missing qq-workflows: ${dep}`);
}
NODE

grep -Fq 'auto: false' "$root/dsh-console/cordis.patch.yml"
grep -Fq "id: compaction-basic" "$root/dsh-console/cordis.patch.yml"
env \
  HOME="$work/home" \
  XDG_CONFIG_HOME="$work/config" \
  DSH_HOME="$DSH_HOME" \
  DSH_TELEMETRY_DISABLED=1 \
  QWEN_TOKEN_PLAN_API_KEY=qq-workflows-boot-probe \
  QQ_DSH_CONSOLE_PORT="$port" \
  QQ_DSH_SESSION_ID="$primary_id" \
  "$workbench" --dump-config >"$work/dump.yml" 2>"$work/dump.err"
node - "$work/dump.yml" <<'NODE'
const { readFileSync } = require("node:fs");
const dump = readFileSync(process.argv[2], "utf8");
if (!/- id: compaction-basic[\s\S]*auto: false/.test(dump)) {
  throw new Error("composed profile did not pin compaction-basic auto: false");
}
if (!/- id: qq-workflows[\s\S]*name: '@hypermemetic-ai\/qq-workflows'/.test(dump)) {
  throw new Error("composed profile is missing qq-workflows");
}
NODE

notebook="$work/.qq-workflows-notebooks/$primary_id.json"
for _ in {1..100}; do
  [[ -f $notebook ]] && break
  sleep 0.05
done
[[ -f $notebook ]] || {
  echo "test-qq-workflows-boot: architect notebook was not created on attach" >&2
  exit 1
}
node - "$notebook" <<'NODE'
const notebook = require(process.argv[2]);
if (notebook.schema !== "qq.workflows-notebook/v1") throw new Error("bad notebook schema");
if (!notebook.cards?.some((card) => card.open)) throw new Error("no open card");
NODE
mode=$(stat -c '%a' "$notebook")
[[ $mode == 600 ]]

encoded=$(node -e 'process.stdout.write(new URLSearchParams({prompt: process.argv[1]}).toString())' \
  'Reply with exactly workflows-boot and nothing else.')
curl -fsS --max-time 30 \
  -H "Origin: $origin" \
  -H 'HX-Request: true' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data "$encoded" \
  "$origin/qq/session/$primary_id/prompt" >"$work/prompt.html"
grep -Fq 'workflows-boot' "$work/prompt.html"

node - "$work/llm-requests.jsonl" <<'NODE'
const { readFileSync } = require("node:fs");
const requests = readFileSync(process.argv[2], "utf8").trim().split("\n").map(JSON.parse);
const turn = requests.find(({ body }) => body.messages?.some(
  ({ role, content }) => role === "user" && JSON.stringify(content).includes("workflows-boot"),
));
if (!turn) throw new Error("missing architect talking turn");
const names = turn.body.tools?.map((tool) => tool.function?.name ?? tool.name) ?? [];
for (const name of ["notes_list", "notes_expand", "session_search", "invoke"]) {
  if (!names.includes(name)) throw new Error(`missing ${name} tool; have ${names.join(",")}`);
}
if (names.includes("run_workflow")) throw new Error("run_workflow dispatcher must not register");
NODE

printf 'test-qq-workflows-boot: pass\n'
