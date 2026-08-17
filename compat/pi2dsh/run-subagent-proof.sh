#!/usr/bin/env bash
set -euo pipefail

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
root=$(git -C "$here" rev-parse --show-toplevel)
pins="$here/pins.json"
toolchain="$here/toolchain"

before_status=$(git -C "$root" status --porcelain=v1 --untracked-files=all)
before_main=$(git -C "$root" rev-parse main)
work=$(mktemp -d "${TMPDIR:-/tmp}/qq-dsh-child-proof.XXXXXX")
disposable="$work/worktree"
llm_pid=
cleanup() {
  rc=$?
  if [[ -n $llm_pid ]]; then
    kill "$llm_pid" 2>/dev/null || true
    wait "$llm_pid" 2>/dev/null || true
  fi
  if [[ -n $disposable && -d $disposable ]]; then
    git -C "$root" worktree remove --force "$disposable" 2>/dev/null || true
    git -C "$root" worktree prune 2>/dev/null || true
  fi
  rm -rf -- "$work"
  exit "$rc"
}
trap cleanup EXIT

npm ci --prefix "$toolchain" --no-audit --no-fund >"$work/npm-install.log" 2>&1 || {
  cat "$work/npm-install.log" >&2
  exit 1
}

node - "$pins" "$toolchain" <<'NODE'
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const [pinsPath, tools] = process.argv.slice(2);
const pins = JSON.parse(fs.readFileSync(pinsPath, "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(tools, "package-lock.json"), "utf8"));
for (const pin of [pins.dsh, pins.dsh.continuableService, pins.dsh.spawnProvider]) {
  const installed = JSON.parse(fs.readFileSync(
    path.join(tools, "node_modules", ...pin.package.split("/"), "package.json"),
    "utf8",
  ));
  const locked = lock.packages[`node_modules/${pin.package}`];
  assert.equal(installed.version, pin.version, `${pin.package} installed version`);
  assert.equal(locked.version, pin.version, `${pin.package} locked version`);
  assert.equal(locked.integrity, pin.integrity, `${pin.package} integrity`);
}
NODE

dsh=$(realpath "$toolchain/node_modules/.bin/dsh")
mkdir -p "$work/dsh-home" "$work/home" "$work/config" "$work/state" "$work/runtime"
export DSH_HOME="$work/dsh-home"
"$dsh" plugin --profile qq-subagent-proof add "$here/subagent-proof" \
  >"$work/profile-add.log" 2>&1 || {
    cat "$work/profile-add.log" >&2
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
  echo "DSH child proof: localhost model stub did not start" >&2
  exit 1
fi
llm_endpoint=$(<"$work/llm-endpoint.txt")

git -C "$root" worktree add --detach "$disposable" HEAD >"$work/worktree-add.log"
disposable=$(realpath "$disposable")
parent_id="session-$(node -e 'process.stdout.write(crypto.randomUUID())')"

run_phase() {
  local phase=$1
  local child_id=${2:-}
  local stdout="$work/$phase.stdout.log"
  local stderr="$work/$phase.stderr.log"
  (
    cd "$disposable"
    env -i \
      PATH="$PATH" \
      HOME="$work/home" \
      XDG_CONFIG_HOME="$work/config" \
      XDG_STATE_HOME="$work/state" \
      XDG_RUNTIME_DIR="$work/runtime" \
      DSH_HOME="$DSH_HOME" \
      DSH_TELEMETRY_MODE=DISABLED \
      DEEPSEEK_API_KEY=qq-dsh-child-local-probe \
      DEEPSEEK_BASE_URL="$llm_endpoint" \
      QQ_DSH_SUBAGENT_PHASE="$phase" \
      QQ_DSH_SUBAGENT_PARENT_ID="$parent_id" \
      QQ_DSH_SUBAGENT_CHILD_ID="$child_id" \
      QQ_DSH_SUBAGENT_CONTEXT_MODULE="$root/bin/lib/session-context.mjs" \
      QQ_DSH_SUBAGENT_RUN_STATE="$work/runner-handoff.json" \
      "$dsh" --profile qq-subagent-proof
  ) >"$stdout" 2>"$stderr" || {
    cat "$stdout" >&2
    cat "$stderr" >&2
    exit 1
  }
  node - "$stdout" "$work/$phase.json" <<'NODE'
const fs = require("node:fs");
const [logPath, outputPath] = process.argv.slice(2);
const prefix = "QQ_DSH_SUBAGENT_PROOF ";
const matches = fs.readFileSync(logPath, "utf8").split("\n").filter((line) => line.startsWith(prefix));
if (matches.length !== 1) throw new Error(`expected one proof record in ${logPath}, got ${matches.length}`);
const proof = JSON.parse(matches[0].slice(prefix.length));
fs.writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
NODE
}

run_phase start
child_id=$(node -e 'process.stdout.write(require(process.argv[1]).child_session_id)' "$work/start.json")
run_phase followup "$child_id"

# Remove the disposable workspace before recording success. The child and direct
# parent were both created from this path, but neither owns its lifecycle.
git -C "$root" worktree remove --force "$disposable"
git -C "$root" worktree prune
disposable=

if [[ $(git -C "$root" rev-parse main) != "$before_main" ]]; then
  echo "DSH child proof changed main" >&2
  exit 1
fi
after_status=$(git -C "$root" status --porcelain=v1 --untracked-files=all)
if [[ $after_status != "$before_status" ]]; then
  echo "DSH child proof changed the source worktree" >&2
  diff -u <(printf '%s\n' "$before_status") <(printf '%s\n' "$after_status") >&2 || true
  exit 1
fi

node - "$pins" "$work/start.json" "$work/followup.json" "$work/dsh-subagent-proof.json" <<'NODE'
const assert = require("node:assert/strict");
const fs = require("node:fs");
const [pinsPath, startPath, followupPath, outputPath] = process.argv.slice(2);
const pins = JSON.parse(fs.readFileSync(pinsPath, "utf8"));
const start = JSON.parse(fs.readFileSync(startPath, "utf8"));
const followup = JSON.parse(fs.readFileSync(followupPath, "utf8"));
assert.equal(start.schema, "qq.dsh-child-prompt-proof/v1");
assert.equal(followup.schema, start.schema);
assert.equal(start.qq_context_schema, "qq.session-context/v1");
assert.equal(followup.qq_context_schema, start.qq_context_schema);
assert.equal(start.phase, "start");
assert.equal(followup.phase, "followup");
assert.equal(start.parent_resumed, false);
assert.equal(followup.parent_resumed, true);
assert.equal(followup.parent_session_id, start.parent_session_id);
assert.equal(followup.child_session_id, start.child_session_id);
assert.notEqual(followup.accepted_message_id, start.accepted_message_id);
assert.notEqual(followup.host_pid, start.host_pid, "follow-up reused the first host process");
assert.equal(start.prompt_kind, "bootstrap");
assert.equal(followup.prompt_kind, "cold-followup");
assert.equal(start.child_was_live_after_acceptance, true);
assert.equal(followup.child_was_live_after_acceptance, true);
assert.equal(start.cold_persistence_read, true);
assert.equal(followup.cold_persistence_read, true);
assert.equal(followup.child_was_cold_before_followup, true);
assert.equal(followup.bootstrap_still_durable, true);
assert.equal(start.alternate_messaging_layer, false);
assert.equal(followup.alternate_messaging_layer, false);
assert.equal(start.provider_name, "spawn");
assert.equal(followup.provider_name, "spawn");
assert.equal(start.durable_parent_session_id, start.parent_session_id);
assert.equal(followup.durable_parent_session_id, start.parent_session_id);
assert.equal(start.durable_child_cwd, followup.durable_child_cwd);
assert.ok(start.durable_child_cwd.startsWith("/"));
assert.equal(start.context_isolation, true);
assert.equal(followup.context_isolation, true);
assert.equal(start.context_survived_continuation, false);
assert.equal(followup.context_survived_continuation, true);
assert.equal(start.parent_context.sessionId, start.parent_session_id);
assert.equal(followup.parent_context.sessionId, start.parent_session_id);
assert.equal(start.child_context.sessionId, start.child_session_id);
assert.equal(followup.child_context.sessionId, start.child_session_id);
assert.equal(start.parent_context.role, "architect");
assert.equal(followup.parent_context.role, "architect");
assert.equal(start.parent_context.profile, "dsh-architect-proof");
assert.equal(followup.parent_context.profile, "dsh-architect-proof");
assert.equal(start.parent_context.runState, null);
assert.equal(followup.parent_context.runState, null);
assert.equal(start.child_context.role, "runner");
assert.equal(followup.child_context.role, "runner");
assert.equal(start.child_context.profile, "dsh-runner-proof");
assert.equal(followup.child_context.profile, "dsh-runner-proof");
assert.ok(start.child_context.runState.startsWith("/"));
assert.equal(followup.child_context.runState, start.child_context.runState);
assert.equal(start.parent_context.source, "dsh-session");
assert.equal(followup.parent_context.source, "dsh-session");
assert.equal(start.child_context.source, "dsh-session");
assert.equal(followup.child_context.source, "dsh-session");
const evidence = {
  schema: "qq.dsh-child-prompt-live-evidence/v1",
  pins: {
    dsh: pins.dsh.version,
    continuable_service: pins.dsh.continuableService.version,
    spawn_provider: pins.dsh.spawnProvider.version,
  },
  first_host: start,
  fresh_host: followup,
  isolation: {
    disposable_worktree_removed: true,
    main_ref_unchanged: true,
    inherited_environment_cleared: true,
    external_model_network: false,
    production_delegate_path_changed: false,
    qq_context_key: "canonical DSH session identity",
    qq_context_process_global_map: false,
    architect_runner_context_isolated: true,
    runner_context_restored_on_cold_continuation: true,
  },
};
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
NODE

if [[ -n ${QQ_DSH_SUBAGENT_OUTPUT:-} ]]; then
  output=$(realpath -m "$QQ_DSH_SUBAGENT_OUTPUT")
  mkdir -p "$output"
  cp "$work/dsh-subagent-proof.json" "$work/start.stdout.log" "$work/start.stderr.log" \
    "$work/followup.stdout.log" "$work/followup.stderr.log" \
    "$work/llm-requests.jsonl" "$output/"
  printf 'DSH child proof evidence copied to %s\n' "$output"
fi

printf 'native DSH child prompt proof passed: %s -> %s\n' "$parent_id" "$child_id"
