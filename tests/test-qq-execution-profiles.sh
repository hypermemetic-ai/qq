#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-execution-profiles"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
POLICY="$ROOT/delegation/policies/execution-profiles.json"
INTENT="$ROOT/delegation/policies/execution-profile-intent.json"

[ -f "$POLICY" ] || fail "missing policy: $POLICY"
[ ! -e "$INTENT" ] || fail "retired execution-profile intent remains: $INTENT"
jq -e '
  (keys == ["architect", "change_owner", "compactor", "coordinator", "implementer", "observer", "researcher", "reviewer", "runner"])
  and (all(.[]; (keys | sort) == ["effort", "model", "provider", "serviceClass"] and .serviceClass == "provider-default"))
  and ([.architect, .change_owner, .compactor, .implementer, .observer, .researcher, .reviewer] | all(
    . == {provider:"openai-codex", model:"gpt-5.6-sol", effort:"xhigh", serviceClass:"provider-default"}
  ))
  and (.coordinator == {provider:"deepseek", model:"deepseek-v4-flash", effort:"max", serviceClass:"provider-default"})
  and (.runner == {provider:"deepseek", model:"deepseek-v4-flash", effort:"max", serviceClass:"provider-default"})
' "$POLICY" >/dev/null || fail 'sole execution-profile policy does not match the approved effective map'

for manifest in "$ROOT"/delegation/manifests/agents/*.md; do
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
