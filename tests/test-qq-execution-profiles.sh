#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-execution-profiles"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
POLICY="$ROOT/delegation/policies/execution-profiles.json"

[ -f "$POLICY" ] || fail "missing policy: $POLICY"
jq -e '
  (keys == ["architect", "implementer", "observer", "orchestrator", "researcher", "reviewer"])
  and ([.orchestrator, .reviewer] | all(
    . == {provider:"kimi-coding", model:"k3", effort:"max", serviceClass:"provider-default"}
  ))
  and ([.architect, .implementer, .observer, .researcher] | all(
    . == {provider:"openai-codex", model:"gpt-5.6-sol", effort:"xhigh", serviceClass:"priority"}
  ))
' "$POLICY" >/dev/null || fail 'six-role policy does not match the operator-set map'

for manifest in "$ROOT"/delegation/manifests/agents/{implementer,observer,researcher,reviewer}.md; do
  assert_file_not_matches "$manifest" '^(model|thinking):' 'canonical manifest retained compute authority'
done

for deleted in \
  "$ROOT/bin/qq-pi-runtime" \
  "$ROOT/bin/qq-pi-role" \
  "$ROOT/extensions/qq-execution-profiles.ts" \
  "$ROOT/patches/pi/v0.81.1" \
  "$ROOT/tests/qq_pi_runtime_test.py"; do
  [ ! -e "$deleted" ] || fail "obsolete Pi execution-profile machinery remains: $deleted"
done
assert_file_not_matches "$ROOT/extensions/index.ts" 'ExecutionProfiles|qq-execution-profiles' \
  'global extension mount retains the deleted profile resolver'
assert_file_not_matches "$ROOT/extensions/qq-footer.ts" 'executionProfile|ExecutionProfile|selected provider|selected model' \
  'footer retains execution-profile telemetry or display'

printf 'test-qq-execution-profiles: pass\n'
