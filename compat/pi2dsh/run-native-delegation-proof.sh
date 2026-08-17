#!/usr/bin/env bash
set -euo pipefail

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
root=$(git -C "$here" rev-parse --show-toplevel)
toolchain="$here/toolchain"
dsh_native="$root/dsh-native-launch"
proof_plugin="$here/native-delegation-proof"

relay_install=${QQ_RELAY_INSTALL_ROOT:-}
if [[ $relay_install != /* || ! -f $relay_install/client.mjs ]]; then
  echo 'QQ_RELAY_INSTALL_ROOT must name the private installed qq-relay artifact' >&2
  exit 1
fi

before_status=$(git -C "$root" status --porcelain=v1 --untracked-files=all)
before_main=$(git -C "$root" rev-parse main)
work=$(mktemp -d "${TMPDIR:-/tmp}/qq-dsh-native-delegation.XXXXXX")
main="$work/repository"
llm_pid=
cleanup() {
  rc=$?
  if [[ -n $llm_pid ]]; then
    kill "$llm_pid" 2>/dev/null || true
    wait "$llm_pid" 2>/dev/null || true
  fi
  if [[ -f $work/state-path.txt ]]; then
    state_path=$(<"$work/state-path.txt")
    if [[ -f $state_path ]]; then
      readarray -t owned < <(node - "$state_path" <<'NODE'
const state = require(process.argv[2]);
console.log(state.worktree);
console.log(state.branch);
NODE
)
      if [[ -n ${owned[0]:-} && -d ${owned[0]} ]]; then
        "$root/bin/qq-openwiki-materialize" thaw "${owned[0]}" >/dev/null 2>&1 || true
        git -C "$main" worktree remove --force "${owned[0]}" >/dev/null 2>&1 || true
      fi
      if [[ -n ${owned[1]:-} ]]; then git -C "$main" branch -D "${owned[1]}" >/dev/null 2>&1 || true; fi
    fi
  fi
  rm -rf -- "$work"
  exit "$rc"
}
trap cleanup EXIT

npm ci --prefix "$toolchain" --no-audit --no-fund >"$work/npm-install.log" 2>&1 || {
  cat "$work/npm-install.log" >&2
  exit 1
}
dsh=$(realpath "$toolchain/node_modules/.bin/dsh")

mkdir -p "$work/home" "$work/config/qq" "$work/state" "$work/runtime" "$work/worktrees"
chmod 700 "$work/home" "$work/config" "$work/config/qq" "$work/state" "$work/runtime" "$work/worktrees"
cat >"$work/config/qq/execution-profiles.json" <<'JSON'
{
  "schema": "qq.execution-profiles/v1",
  "contextWindowCeiling": 200000,
  "roles": {
    "runner": {
      "default": "dsh-runner",
      "profiles": {
        "dsh-runner": { "provider": "deepseek-official", "model": "deepseek-v4-flash", "effort": "high" }
      }
    },
    "architect": {
      "default": "dsh-architect",
      "profiles": {
        "dsh-architect": { "provider": "deepseek-official", "model": "deepseek-v4-flash", "effort": "high" }
      }
    }
  },
  "scribe": { "provider": "deepseek-official", "model": "deepseek-v4-flash", "effort": "high" },
  "qa": { "provider": "deepseek-official", "model": "deepseek-v4-flash", "effort": "high" },
  "openwiki": { "provider": "deepseek-official", "model": "deepseek-v4-flash", "effort": "high" }
}
JSON
chmod 600 "$work/config/qq/execution-profiles.json"

git init -q -b main "$main"
git -C "$main" config user.name qq-proof
git -C "$main" config user.email qq-proof.invalid
printf 'native delegation proof\n' >"$main/README.md"
git -C "$main" add README.md
git -C "$main" commit -q -m initial
main_ref=$(git -C "$main" rev-parse HEAD)
main_status=$(git -C "$main" status --porcelain=v1 --untracked-files=all)

export DSH_HOME="$work/dsh-home"
"$dsh" plugin --profile qq-native-delegation-proof add "$dsh_native" >"$work/add-native.log" 2>&1 || {
  cat "$work/add-native.log" >&2
  exit 1
}
"$dsh" plugin --profile qq-native-delegation-proof add "$proof_plugin" >"$work/add-proof.log" 2>&1 || {
  cat "$work/add-proof.log" >&2
  exit 1
}

node "$here/llm-stub.mjs" "$work/llm-endpoint.txt" "$work/llm-requests.jsonl" &
llm_pid=$!
for _ in {1..100}; do
  [[ -s $work/llm-endpoint.txt ]] && break
  kill -0 "$llm_pid" 2>/dev/null || break
  sleep 0.05
done
if [[ ! -s $work/llm-endpoint.txt ]]; then
  echo 'native DSH delegation proof: localhost model stub did not start' >&2
  exit 1
fi
llm_endpoint=$(<"$work/llm-endpoint.txt")
architect="session-$(node -e 'process.stdout.write(crypto.randomUUID())')"

run_phase() {
  local phase=$1
  local state_path=${2:-}
  (
    cd "$main"
    env -i \
      PATH="$PATH" \
      HOME="$work/home" \
      XDG_CONFIG_HOME="$work/config" \
      XDG_STATE_HOME="$work/state" \
      XDG_RUNTIME_DIR="$work/runtime" \
      DSH_HOME="$DSH_HOME" \
      DSH_TELEMETRY_MODE=DISABLED \
      CHOKIDAR_USEPOLLING=1 \
      DEEPSEEK_API_KEY=qq-dsh-native-local-probe \
      DEEPSEEK_BASE_URL="$llm_endpoint" \
      QQ_RELAY_INSTALL_ROOT="$relay_install" \
      QQ_WORKTREE_ROOT="$work/worktrees" \
      QQ_DSH_NATIVE_PHASE="$phase" \
      QQ_DSH_NATIVE_ARCHITECT="$architect" \
      QQ_DSH_NATIVE_STATE_PATH="$state_path" \
      "$dsh" --profile qq-native-delegation-proof
  ) >"$work/$phase.stdout.log" 2>"$work/$phase.stderr.log" || {
    cat "$work/$phase.stdout.log" >&2
    cat "$work/$phase.stderr.log" >&2
    exit 1
  }
  node - "$work/$phase.stdout.log" "$work/$phase.json" <<'NODE'
const fs = require('node:fs');
const [source, output] = process.argv.slice(2);
const prefix = 'QQ_DSH_NATIVE_DELEGATION_PROOF ';
const lines = fs.readFileSync(source, 'utf8').split('\n').filter((line) => line.startsWith(prefix));
if (lines.length !== 1) throw new Error(`expected one native delegation proof in ${source}, got ${lines.length}`);
fs.writeFileSync(output, `${JSON.stringify(JSON.parse(lines[0].slice(prefix.length)), null, 2)}\n`, { mode: 0o600 });
NODE
}

run_phase start
state_path=$(find "$work/state/qq/runs/proof" -name handoff.json -type f -print -quit)
if [[ -z $state_path || $state_path != /* ]]; then
  echo 'native DSH delegation proof did not leave one private handoff' >&2
  exit 1
fi
printf '%s\n' "$state_path" >"$work/state-path.txt"
if [[ -e $(dirname "$state_path")/bootstrap.json ]]; then
  echo 'native DSH delegation proof left its consumed bootstrap request' >&2
  exit 1
fi
run_phase fresh "$state_path"

node - "$work/start.json" "$work/fresh.json" "$state_path" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const [startPath, freshPath, statePath] = process.argv.slice(2);
const start = JSON.parse(fs.readFileSync(startPath, 'utf8'));
const fresh = JSON.parse(fs.readFileSync(freshPath, 'utf8'));
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
assert.equal(start.schema, 'qq.dsh-native-delegation-proof/v1');
assert.equal(fresh.schema, start.schema);
assert.equal(start.phase, 'start');
assert.equal(fresh.phase, 'fresh');
assert.equal(start.architect_session, fresh.architect_session);
assert.equal(start.bootstrap_parent_session, fresh.bootstrap_parent_session);
assert.equal(start.runner_session, fresh.runner_session);
assert.equal(start.accepted_message_id, fresh.accepted_message_id);
assert.equal(start.status, 'running');
assert.equal(fresh.status, 'running');
assert.equal(start.isolated_worktree, true);
assert.equal(start.done_requested, false);
assert.equal(fresh.bootstrap_injections, 1);
assert.equal(fresh.parent_resumed, true);
assert.equal(fresh.child_cold, true);
assert.equal(fresh.context_reconstructed, true);
assert.equal(state.runtime, 'dsh');
assert.equal(state.pane, undefined);
assert.equal(state.bootstrapParentSession, start.bootstrap_parent_session);
assert.equal(state.runnerSession, start.runner_session);
NODE

if [[ $(git -C "$main" rev-parse main) != "$main_ref" || $(git -C "$main" status --porcelain=v1 --untracked-files=all) != "$main_status" ]]; then
  echo 'native DSH delegation proof changed its disposable main checkout' >&2
  exit 1
fi
if [[ $(git -C "$root" rev-parse main) != "$before_main" || $(git -C "$root" status --porcelain=v1 --untracked-files=all) != "$before_status" ]]; then
  echo 'native DSH delegation proof changed qq main or its source worktree' >&2
  exit 1
fi

printf 'native DSH approved delegation proof passed: %s -> %s\n' \
  "$(node -p 'require(process.argv[1]).bootstrap_parent_session' "$work/start.json")" \
  "$(node -p 'require(process.argv[1]).runner_session' "$work/start.json")"
