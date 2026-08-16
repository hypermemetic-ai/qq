#!/usr/bin/env bash
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
pins="$here/pins.json"
get_pin() {
  node -e 'const p=require(process.argv[1]); let v=p; for (const key of process.argv[2].split(".")) v=v[key]; process.stdout.write(String(v))' "$pins" "$1"
}

qq_revision=$(get_pin qq.revision)
pi2dsh_version=$(get_pin pi2dsh.version)
dsh_version=$(get_pin dsh.version)

relay_state_home=${QQ_PI2DSH_RELAY_STATE_HOME:-}
if [[ $relay_state_home != /* || ! -d $relay_state_home ]]; then
  printf 'QQ_PI2DSH_RELAY_STATE_HOME must name the absolute private state root supplied by tests/test-agent-messages-live.sh\n' >&2
  exit 1
fi
relay_socket="$relay_state_home/qq-relay/qq-relay.sock"
if [[ ! -S $relay_socket ]]; then
  printf 'installed qq-relay service socket is unavailable at %s\n' "$relay_socket" >&2
  exit 1
fi
relay_install_root=${QQ_RELAY_INSTALL_ROOT:-}
if [[ $relay_install_root != /* || ! -f $relay_install_root/client.mjs ]]; then
  printf 'QQ_RELAY_INSTALL_ROOT must name the private installed qq-relay artifact\n' >&2
  exit 1
fi

git -C "$root" cat-file -e "$qq_revision^{commit}"
if ! git -C "$root" diff --quiet "$qq_revision" -- extensions; then
  printf 'qq Pi extension bundle differs from pinned revision %s; refresh the evidence and pin first\n' "$qq_revision" >&2
  exit 1
fi

scratch=$(mktemp -d "${TMPDIR:-/tmp}/qq-pi2dsh.XXXXXX")
keep=${QQ_PI2DSH_KEEP:-0}
llm_pid=
dsh_pid=
cleanup() {
  rc=$?
  if [[ -n $dsh_pid ]]; then
    kill "$dsh_pid" 2>/dev/null || true
    wait "$dsh_pid" 2>/dev/null || true
  fi
  if [[ -n $llm_pid ]]; then
    kill "$llm_pid" 2>/dev/null || true
    wait "$llm_pid" 2>/dev/null || true
  fi
  if [[ $keep == 1 ]]; then
    printf 'qq pi2dsh harness kept at %s\n' "$scratch" >&2
  else
    rm -rf "$scratch"
  fi
  exit "$rc"
}
trap cleanup EXIT
mkdir -p "$scratch/tools" "$scratch/home" "$scratch/config/qq" "$scratch/state" "$scratch/runtime"
install -m 0600 "$here/execution-profiles.json" "$scratch/config/qq/execution-profiles.json"

cp "$here/toolchain/package.json" "$here/toolchain/package-lock.json" "$scratch/tools/"
npm ci --prefix "$scratch/tools" --no-audit --no-fund >"$scratch/npm-install.log" 2>&1 || {
  cat "$scratch/npm-install.log" >&2
  exit 1
}

node - "$pins" "$scratch/tools" <<'NODE'
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const [pinsPath, tools] = process.argv.slice(2);
const pins = JSON.parse(fs.readFileSync(pinsPath, "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(tools, "package-lock.json"), "utf8"));
const toolchain = JSON.parse(fs.readFileSync(path.join(tools, "package.json"), "utf8"));
for (const key of ["pi2dsh", "dsh"]) {
  const pin = pins[key];
  const installed = JSON.parse(fs.readFileSync(path.join(tools, "node_modules", ...pin.package.split("/"), "package.json"), "utf8"));
  assert.equal(toolchain.dependencies[pin.package], pin.version, `${key} toolchain pin`);
  assert.equal(installed.version, pin.version, `${key} version`);
  const entry = lock.packages[`node_modules/${pin.package}`];
  assert.equal(entry.integrity, pin.integrity, `${key} package integrity`);
}
assert.equal(toolchain.dependencies.typescript, pins.typescript.version, "TypeScript toolchain pin");
NODE
published_pi2dsh_revision=$(npm view "pi2dsh@$pi2dsh_version" gitHead)
if [[ $published_pi2dsh_revision != $(get_pin pi2dsh.revision) ]]; then
  printf 'published pi2dsh gitHead does not match the pinned revision\n' >&2
  exit 1
fi

pi2dsh="$scratch/tools/node_modules/.bin/pi2dsh"
dsh="$scratch/tools/node_modules/.bin/dsh"
"$pi2dsh" matrix --json >"$scratch/matrix.json"
"$pi2dsh" inspect "$root" --json >"$scratch/inspection.json"

export DSH_HOME="$scratch/dsh-home"
"$dsh" plugin --profile headless add "$scratch/tools/node_modules/pi2dsh" >"$scratch/dsh-add-engine.log" 2>&1 || {
  cat "$scratch/dsh-add-engine.log" >&2
  exit 1
}
"$dsh" plugin --profile headless add "$root" >"$scratch/dsh-add-qq.log" 2>&1 || {
  cat "$scratch/dsh-add-qq.log" >&2
  exit 1
}

node "$here/llm-stub.mjs" "$scratch/llm-endpoint.txt" "$scratch/llm-requests.jsonl" &
llm_pid=$!
for _ in {1..100}; do
  [[ -s $scratch/llm-endpoint.txt ]] && break
  kill -0 "$llm_pid" 2>/dev/null || break
  sleep 0.05
done
if [[ ! -s $scratch/llm-endpoint.txt ]]; then
  printf 'localhost LLM stub failed to start\n' >&2
  exit 1
fi
llm_endpoint=$(<"$scratch/llm-endpoint.txt")

(
  cd "$root"
  env -u XAI_API_KEY -u OPENAI_API_KEY -u ANTHROPIC_API_KEY \
    HOME="$scratch/home" XDG_CONFIG_HOME="$scratch/config" XDG_STATE_HOME="$relay_state_home" \
    XDG_RUNTIME_DIR="$scratch/runtime" DSH_HOME="$DSH_HOME" QQ_AGENT_ROLE=runner \
    DEEPSEEK_API_KEY=qq-pi2dsh-local-probe DEEPSEEK_BASE_URL="$llm_endpoint" \
    QQ_RELAY_INSTALL_ROOT="$relay_install_root" \
    "$dsh" --profile headless --patch "$here/qq.patch.yml" "qq compatibility mount probe"
) >"$scratch/dsh.stdout.log" 2>"$scratch/dsh.stderr.log" &
dsh_pid=$!

dsh_session=
for _ in {1..400}; do
  shopt -s nullglob
  dsh_sessions=("$DSH_HOME"/sessions/*/session-*)
  shopt -u nullglob
  if [[ ${#dsh_sessions[@]} -gt 1 ]]; then
    printf 'expected one DSH headless session; got %s\n' "${#dsh_sessions[@]}" >&2
    exit 1
  fi
  if [[ ${#dsh_sessions[@]} -eq 1 ]]; then
    dsh_session=${dsh_sessions[0]}
    break
  fi
  kill -0 "$dsh_pid" 2>/dev/null || break
  sleep 0.02
done
if [[ -z $dsh_session ]]; then
  printf 'DSH did not create its isolated headless session\n' >&2
  cat "$scratch/dsh.stdout.log" >&2
  cat "$scratch/dsh.stderr.log" >&2
  exit 1
fi
dsh_session_id=$(basename "$dsh_session")
printf '%s\n' "$dsh_session_id" >"$scratch/dsh-session-id.txt"
node "$here/relay-probe.mjs" \
  "$root" "$relay_socket" "$dsh_session_id" "$scratch/relay-proof.json" || {
    cat "$scratch/dsh.stdout.log" >&2
    cat "$scratch/dsh.stderr.log" >&2
    exit 1
  }

set +e
wait "$dsh_pid"
runtime_code=$?
set -e
dsh_pid=
if [[ $runtime_code -ne 0 ]]; then
  printf 'expected the localhost-backed DSH probe to stop with exit 0; got %s\n' "$runtime_code" >&2
  cat "$scratch/dsh.stdout.log" >&2
  cat "$scratch/dsh.stderr.log" >&2
  exit 1
fi

dsh_session_log="$dsh_session/session.jsonl"
if [[ ! -f $dsh_session_log ]]; then
  printf 'expected the isolated plaintext DSH session artifact at %s\n' "$dsh_session_log" >&2
  exit 1
fi

node "$here/verify.mjs" \
  "$scratch/matrix.json" "$scratch/inspection.json" \
  "$scratch/dsh.stdout.log" "$scratch/dsh.stderr.log" \
  "$scratch/relay-proof.json" "$scratch/dsh-session-id.txt" "$dsh_session_log"

if [[ -n ${QQ_PI2DSH_OUTPUT:-} ]]; then
  output=$(realpath -m "$QQ_PI2DSH_OUTPUT")
  mkdir -p "$output"
  cp "$scratch/matrix.json" "$scratch/inspection.json" \
    "$scratch/dsh.stdout.log" "$scratch/dsh.stderr.log" \
    "$scratch/relay-proof.json" "$scratch/dsh-session-id.txt" "$dsh_session_log" \
    "$scratch/llm-requests.jsonl" "$scratch/tools/package-lock.json" "$output/"
  printf 'evidence copied to %s\n' "$output"
fi
printf 'qq pi2dsh harness passed: qq %s, pi2dsh %s, DSH %s\n' \
  "$qq_revision" "$pi2dsh_version" "$dsh_version"
