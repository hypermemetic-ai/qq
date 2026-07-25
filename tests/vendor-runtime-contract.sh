#!/usr/bin/env bash
# Shared black-box qualification contract for an exact pi-subagents checkout.
#
# Usage: tests/vendor-runtime-contract.sh /absolute/path/to/pi-subagents
#
# This is an on-demand promotion Check, not part of tests/test-*.sh: CI does
# not have either exact Git checkout. The vendor integration/E2E boundary
# covers foreground/background completion, structured-output recovery and
# negatives, lifecycle/status/wait/stop/resume, output isolation, timeout and
# signal handling, and session/artifact behavior. The qq boundary then covers
# same-Repository dispatch validation, Landstrip policy identity, descendant
# cleanup, persisted-session observation, and the canonical-seat environment.
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
runtime_input="${1:-}"

fail() {
  printf 'vendor-runtime-contract: FAIL: %s\n' "$1" >&2
  exit 1
}

[[ "$runtime_input" == /* ]] \
  || fail 'pass one absolute pi-subagents checkout path'
runtime="$(realpath -e -- "$runtime_input")" \
  || fail "cannot resolve runtime checkout: $runtime_input"
[[ -f "$runtime/package.json" && -f "$runtime/index.ts" ]] \
  || fail "not a pi-subagents checkout: $runtime"
package_name="$(node -e 'process.stdout.write(require(process.argv[1]).name ?? "")' "$runtime/package.json")"
[[ "$package_name" == pi-subagents ]] \
  || fail "package name is not pi-subagents: $runtime"
[[ -d "$runtime/node_modules" ]] \
  || fail "runtime dependencies are absent; prepare the checkout before this Check"

contract_tmp="$(mktemp -d "${TMPDIR:-/tmp}/qq-vendor-contract.XXXXXX")"
trap 'rm -rf "$contract_tmp"' EXIT
mkdir -p \
  "$contract_tmp/home" \
  "$contract_tmp/tmp" \
  "$contract_tmp/xdg-config" \
  "$contract_tmp/xdg-cache" \
  "$contract_tmp/xdg-data"

clean_env=(
  env
  -u PI_SUBAGENT_PI_BINARY
  -u PI_SUBAGENT_EXTRA_AGENT_DIRS
  -u PI_SUBAGENT_TRUSTED_AGENT_PATHS
  -u PI_SUBAGENT_PARENT_SESSION
  -u PI_CODING_AGENT_DIR
  -u QQ_DISPATCH_RUNTIME_ROOT
  -u PI_SUBAGENT_STRUCTURED_OUTPUT_CAPTURE
  -u PI_SUBAGENT_STRUCTURED_OUTPUT_SCHEMA
  HOME="$contract_tmp/home"
  TMPDIR="$contract_tmp/tmp"
  XDG_CONFIG_HOME="$contract_tmp/xdg-config"
  XDG_CACHE_HOME="$contract_tmp/xdg-cache"
  XDG_DATA_HOME="$contract_tmp/xdg-data"
)

(
  cd "$runtime"
  "${clean_env[@]}" node --experimental-transform-types \
    --import ./test/support/register-loader.mjs --test \
    test/integration/async-execution.test.ts \
    test/integration/async-status.test.ts \
    test/integration/detect-error.test.ts \
    test/integration/error-handling.test.ts \
    test/integration/intercom-result-delivery.test.ts \
    test/integration/result-watcher.test.ts \
    test/integration/single-execution.test.ts
  "${clean_env[@]}" npm run test:e2e
)

bash "$TESTS_DIR/test-qq-dispatch.sh"
bash "$TESTS_DIR/test-qq-delegate-enforcement.sh"
bash "$TESTS_DIR/test-qq-observe-seam-signals.sh"
bash "$TESTS_DIR/test-qq-subagent-env.sh"

printf 'vendor-runtime-contract: pass (%s)\n' "$runtime"
