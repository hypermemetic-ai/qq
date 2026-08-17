#!/usr/bin/env bash
set -euo pipefail

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
root=$(git -C "$here" rev-parse --show-toplevel)
toolchain="$here/toolchain"
dsh_native="$root/dsh-native-launch"
proof_plugin="$here/native-delegation-proof"
qa_proof_plugin="$here/native-qa-proof"

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
  if [[ ${QQ_DSH_NATIVE_KEEP:-0} == 1 ]]; then
    printf 'native DSH proof kept at %s\n' "$work" >&2
  else
    rm -rf -- "$work"
  fi
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
"$dsh" plugin --profile qq-native-qa-proof add "$qa_proof_plugin" >"$work/add-qa-proof.log" 2>&1 || {
  cat "$work/add-qa-proof.log" >&2
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
  local profile=qq-native-delegation-proof
  if [[ $phase == qa* ]]; then profile=qq-native-qa-proof; fi
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
      "$dsh" --profile "$profile"
  ) >"$work/$phase.stdout.log" 2>"$work/$phase.stderr.log" || {
    cat "$work/$phase.stdout.log" >&2
    cat "$work/$phase.stderr.log" >&2
    exit 1
  }
  node - "$work/$phase.stdout.log" "$work/$phase.json" "$phase" <<'NODE'
const fs = require('node:fs');
const [source, output, phase] = process.argv.slice(2);
const prefix = phase.startsWith('qa') ? 'QQ_DSH_NATIVE_QA_PROOF ' : 'QQ_DSH_NATIVE_DELEGATION_PROOF ';
const lines = fs.readFileSync(source, 'utf8').split('\n').filter((line) => line.startsWith(prefix));
if (lines.length !== 1) throw new Error(`expected one ${phase} proof in ${source}, got ${lines.length}`);
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
run_phase qa "$state_path"
run_phase qa-fresh "$state_path"

node - "$work/start.json" "$work/fresh.json" "$work/qa.json" "$work/qa-fresh.json" "$work/llm-requests.jsonl" "$state_path" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const [startPath, freshPath, qaPath, qaFreshPath, requestsPath, statePath] = process.argv.slice(2);
const start = JSON.parse(fs.readFileSync(startPath, 'utf8'));
const fresh = JSON.parse(fs.readFileSync(freshPath, 'utf8'));
const qa = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
const qaFresh = JSON.parse(fs.readFileSync(qaFreshPath, 'utf8'));
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
assert.equal(start.schema, 'qq.dsh-native-delegation-proof/v1');
assert.equal(fresh.schema, start.schema);
assert.equal(start.phase, 'start');
assert.equal(fresh.phase, 'fresh');
assert.equal(start.architect_session, fresh.architect_session);
assert.equal(start.bootstrap_parent_session, fresh.bootstrap_parent_session);
assert.equal(start.runner_session, fresh.runner_session);
assert.equal(start.accepted_message_id, fresh.accepted_message_id);
assert.equal(start.ref, fresh.ref);
assert.equal(start.status, 'submitted');
assert.equal(fresh.status, 'submitted');
assert.equal(start.look, 0);
assert.equal(fresh.look, 0);
assert.equal(start.isolated_worktree, true);
assert.equal(start.done_requested, true);
assert.equal(start.approval_recorded, true);
assert.equal(start.review_launched, false);
assert.equal(start.host_stopped, false);
assert.equal(start.child_live_after_submission, true);
assert.equal(fresh.awaiting, 'native-review');
assert.equal(fresh.bootstrap_injections, 1);
assert.equal(fresh.parent_resumed, true);
assert.equal(fresh.child_cold, true);
assert.equal(fresh.context_reconstructed, true);
assert.equal(fresh.clean_shared_ref_reconstructed, true);
assert.equal(state.runtime, 'dsh');
assert.equal(state.status, 'submitted');
assert.equal(state.look, 0);
assert.equal(state.ref, start.ref);
assert.equal(state.pane, undefined);
assert.equal(state.bootstrapParentSession, start.bootstrap_parent_session);
assert.equal(state.runnerSession, start.runner_session);
assert.equal(state.submission.runtime, 'dsh');
assert.equal(state.submission.awaiting, 'native-review');
assert.equal(state.submission.continuation.runnerSession, start.runner_session);
assert.equal(state.submission.continuation.worktree, state.worktree);
assert.equal(state.qa.provider, 'deepseek-official');
assert.equal(state.qa.model, 'deepseek-v4-flash');
assert.equal(state.qa.effort, 'high');
assert.equal(state.qaVerdict, undefined);

assert.equal(qa.schema, 'qq.dsh-native-qa-proof/v1');
assert.equal(qaFresh.schema, qa.schema);
assert.equal(qa.phase, 'qa');
assert.equal(qaFresh.phase, 'qa-fresh');
assert.equal(qa.run_id, state.id);
assert.equal(qaFresh.run_id, state.id);
assert.equal(qa.qa_session, qaFresh.qa_session);
assert.match(qa.qa_session, /^session-[a-f0-9-]{36}$/);
assert.equal(qa.ref, state.ref);
assert.deepEqual(qa.model_binding, {
  provider: state.qa.provider,
  model: state.qa.model,
  reasoningEffort: state.qa.effort,
});
assert.deepEqual(qaFresh.model_binding, qa.model_binding);
assert.deepEqual(qa.inherited_tools, ['read', 'bash', 'edit', 'write']);
assert.deepEqual(qa.visible_tools, ['bash', 'edit', 'qa_verdict', 'read', 'write']);
assert.deepEqual(qaFresh.visible_tools, qa.visible_tools);
assert.equal(qa.visible_tools.length, 5);
assert.equal(new Set(qa.visible_tools).size, 5);
assert.equal(qa.complete_prompt, true);
assert.equal(qaFresh.complete_prompt, true);
assert.equal(qa.prompt_digest, qaFresh.prompt_digest);
assert.equal(qa.verdict_digest, qaFresh.verdict_digest);
assert.equal(qa.verdict, 'pass');
assert.equal(qaFresh.verdict, qa.verdict);
assert.equal(qa.independent, true);
assert.equal(qa.handoff_unchanged, true);
assert.equal(qaFresh.cold_before_resume, true);
assert.equal(qaFresh.resumed_same_identity, true);
assert.equal(qaFresh.verdict_unchanged, true);
assert.equal(qaFresh.handoff_unchanged, true);
assert.ok(qa.request_bindings.length >= 1);
assert.ok(qa.request_bindings.every((binding) => JSON.stringify(binding) === JSON.stringify(qa.model_binding)));

const qaStatePath = `${statePath.slice(0, statePath.lastIndexOf('/'))}/native-qa.json`;
const verdictPath = `${statePath.slice(0, statePath.lastIndexOf('/'))}/native-qa-verdict.json`;
const qaState = JSON.parse(fs.readFileSync(qaStatePath, 'utf8'));
const verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
assert.equal(qaState.schema, 'qq.dsh-native-qa-state/v1');
assert.equal(qaState.owner, 'qq');
assert.equal(qaState.status, 'verdict-recorded');
assert.equal(qaState.qaSession, qa.qa_session);
assert.equal(qaState.prompt.complete, true);
assert.equal(qaState.prompt.digest, qa.prompt_digest);
assert.equal(verdict.schema, 'qq.qa-verdict/v1');
assert.equal(verdict.version, 1);
assert.equal(verdict.verdict, 'pass');
assert.equal(verdict.tests_modified, false);
assert.equal(qaState.runId, state.id);
assert.equal(qaState.qaSession, qa.qa_session);
assert.deepEqual(qaState.capabilities.visible.slice().sort(), qa.visible_tools);

const requests = fs.readFileSync(requestsPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const qaRequests = requests.map((entry) => entry.body).filter((body) =>
  body.tools?.some((tool) => tool?.function?.name === 'qa_verdict'));
assert.ok(qaRequests.length >= 2, 'QA did not complete a tool-call turn');
for (const request of qaRequests) {
  assert.equal(request.model, qa.model_binding.model);
  assert.deepEqual(request.tools.map((tool) => tool.function.name).sort(), qa.visible_tools);
  assert.equal(request.messages.find((message) => message.role === 'system')?.content, qaState.prompt.text);
}
assert.equal(qaRequests.filter((request) => request.messages.some((message) => message.role === 'tool' && String(message.tool_call_id).startsWith('call_qq_native_qa_'))).length, 1);
NODE

if [[ -e $work/state/qq/session-contexts/$(node -p 'require(process.argv[1]).qa_session' "$work/qa.json").json ]]; then
  echo 'native DSH QA proof added QA to the ordinary qq session-context roles' >&2
  exit 1
fi

if [[ $(git -C "$main" rev-parse main) != "$main_ref" || $(git -C "$main" status --porcelain=v1 --untracked-files=all) != "$main_status" ]]; then
  echo 'native DSH delegation proof changed its disposable main checkout' >&2
  exit 1
fi
if [[ $(git -C "$root" rev-parse main) != "$before_main" || $(git -C "$root" status --porcelain=v1 --untracked-files=all) != "$before_status" ]]; then
  echo 'native DSH delegation proof changed qq main or its source worktree' >&2
  exit 1
fi

printf 'native DSH delegation and independent QA proof passed: %s -> %s -> %s\n' \
  "$(node -p 'require(process.argv[1]).bootstrap_parent_session' "$work/start.json")" \
  "$(node -p 'require(process.argv[1]).runner_session' "$work/start.json")" \
  "$(node -p 'require(process.argv[1]).qa_session' "$work/qa.json")"
