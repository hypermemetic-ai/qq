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
[ -f "$INTENT" ] || fail "missing profile intent: $INTENT"
jq -e '
  (keys == ["architect", "change_owner", "compactor", "coordinator", "implementer", "observer", "researcher", "reviewer", "runner"])
  and (all(.[]; (keys | sort) == ["effort", "model", "provider", "serviceClass"] and .serviceClass == "provider-default"))
  and ([.architect, .compactor, .implementer, .observer, .reviewer] | all(
    . == {provider:"openai-codex", model:"gpt-5.6-sol", effort:"xhigh", serviceClass:"provider-default"}
  ))
  and (.change_owner == {provider:"kimi-coding", model:"k3", effort:"max", serviceClass:"provider-default"})
  and ([.coordinator, .researcher] | all(
    . == {provider:"qwen-token-plan", model:"qwen3.8-max", effort:"xhigh", serviceClass:"provider-default"}
  ))
  and (.runner == {provider:"deepseek", model:"deepseek-v4-flash", effort:"max", serviceClass:"provider-default"})
' "$POLICY" >/dev/null || fail 'effective role policy does not match the approved map and temporary no-Kimi exception'

jq -e '
  keys == ["canonical_k3_profile", "canonical_k3_roles", "openwiki_maintainer_profile_owner", "schema", "temporary_exceptions", "version"]
  and .schema == "qq.execution-profile-intent/v1" and .version == 1
  and .canonical_k3_roles == ["architect", "change_owner", "reviewer"]
  and .canonical_k3_profile == {provider:"kimi-coding", model:"k3", effort:"max", serviceClass:"provider-default"}
  and .openwiki_maintainer_profile_owner == "T-196"
  and (.temporary_exceptions | keys == ["architect", "reviewer"])
  and (all(.temporary_exceptions[];
    . == {effective_provider:"openai-codex", effective_model:"gpt-5.6-sol", effective_effort:"xhigh", effective_service_class:"provider-default", reason:"kimi-quota-unavailable", restore_only_after:"explicit-operator-confirmation"}
  ))
' "$INTENT" >/dev/null || fail 'canonical K3 intent and temporary effective exceptions are not deterministic'

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
