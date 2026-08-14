#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d "$HOME/qq-telemetry-test.XXXXXX")"
cleanup() { rm -rf -- "$TMP"; }
trap cleanup EXIT
chmod 700 "$TMP"
mkdir -p "$TMP/config/qq" "$TMP/home"
chmod 700 "$TMP/config/qq" "$TMP/home"
cat >"$TMP/config/qq/execution-profiles.json" <<'JSON'
{
  "schema": "qq.execution-profiles/v1",
  "contextWindowCeiling": 200000,
  "scribe": {"provider":"xai","model":"grok-4.6","effort":"high"},
  "qa": {"provider":"openai-codex","model":"gpt-5.6-sol","effort":"xhigh"},
  "roles": {
    "runner": {
      "default": "grok-high",
      "profiles": {
        "grok-high": {"provider":"xai","model":"grok-4.6","effort":"high"},
        "qwen-deepseek-max": {"provider":"qwen-token-plan","model":"deepseek-v4-flash-0731","effort":"max"},
        "sol-high": {"provider":"openai-codex","model":"gpt-5.6-sol","effort":"high"}
      }
    },
    "architect": {
      "default": "grok-high",
      "profiles": {
        "grok-high": {"provider":"xai","model":"grok-4.6","effort":"high"}
      }
    }
  }
}
JSON
chmod 600 "$TMP/config/qq/execution-profiles.json"

output=$(HOME="$TMP/home" QQ_TELEMETRY_PROFILES_FILE="$TMP/config/qq/execution-profiles.json" \
  bash -c 'source "$1"; validate_profiles_file; load_roles; printf "%s\n" "$ROLES_BODY"' _ "$ROOT/bin/qq-telemetry")
[[ "$output" == *'runner'* ]]
[[ "$output" == *'deepseek-v4-flash-0731'*'max'* ]]
[[ "$output" == *'gpt-5.6-sol'*'high'* ]]
[[ "$output" == *'grok-4.6'*'high'* ]]
[[ "$output" == *'grok-4.6'*'high'*'default'* ]]
[[ "$output" != *'gpt-5.6-luna'* ]]
[[ "$output" != *'qwen-deepseek-max'* ]]
[[ "$output" != *'qwen-token-plan/deepseek-v4-flash-0731'* ]]
[[ "$output" == *'architect'* ]]
[[ "$output" == *'scribe'* ]]
[[ "$output" == *'scribe (service)'* ]]
[[ "$output" == *'qa'* ]]
[[ "$output" == *'qa (service)'* ]]
[[ "$output" == *'gpt-5.6-sol'*'xhigh'* ]]
[[ "$output" != *'cap 200000'* ]]

frame=$(HOME="$TMP/home" QQ_TELEMETRY_PROFILES_FILE="$TMP/config/qq/execution-profiles.json" \
  bash -c 'source "$1"; validate_profiles_file; load_roles; GPT_WEEK="7d       unavailable"; GROK_WEEK="7d       unavailable"; QWEN_L1="7d       unavailable"; QWEN_L2=""; render_body' _ "$ROOT/bin/qq-telemetry")
[[ "$frame" == *'Codex'* ]]
[[ "$frame" == *'Grok'* ]]
[[ "$frame" == *'Qwen'* ]]
[[ "$frame" != *'no cookie session'* ]]
[[ "$frame" != *'cap 200000'* ]]
plain=$(printf '%s' "$frame" | sed 's/\x1b\[[0-9;]*m//g')
[[ "$plain" == *$'\n\n\n Execution profiles\n'* ]]

jq '.contextWindowCeiling = 262144' "$TMP/config/qq/execution-profiles.json" >"$TMP/bad.json"
if HOME="$TMP/home" QQ_TELEMETRY_PROFILES_FILE="$TMP/bad.json" bash -c 'source "$1"; validate_profiles_file' _ "$ROOT/bin/qq-telemetry"; then
  echo 'telemetry accepted a wrong context ceiling' >&2
  exit 1
fi

echo 'test-telemetry: pass'
