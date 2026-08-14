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
        "sol-max": {"provider":"openai-codex","model":"gpt-5.6-sol","effort":"max"},
        "grok-xhigh": {"provider":"xai","model":"grok-4.6","effort":"xhigh"},
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
plain_roles=$(printf '%s' "$output" | sed 's/\x1b\[[0-9;]*m//g')
[[ "$plain_roles" == *$'architect\n'*'gpt-5.6-sol'*'max'*$'\n'*'grok-4.6'*'high'*'default'*$'\n'*'grok-4.6'*'xhigh'* ]]
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

fresh_qwen=$(HOME="$TMP/home" QQ_TELEMETRY_PROFILES_FILE="$TMP/config/qq/execution-profiles.json" \
  bash -c 'source "$1"; QWEN_WALL_TEXT="quota exhausted"; QWEN_WALL_TS=1000000; qwen_render_rows 0.25 2000000000000 "" "" 100 0 0 "" 2000; printf "%s\n" "$QWEN_L1"' _ "$ROOT/bin/qq-telemetry")
[[ "$fresh_qwen" != *'EXHAUSTED'* ]]
stale_qwen=$(HOME="$TMP/home" QQ_TELEMETRY_PROFILES_FILE="$TMP/config/qq/execution-profiles.json" \
  bash -c 'source "$1"; QWEN_WALL_TEXT="quota exhausted"; QWEN_WALL_TS=1000000; qwen_render_rows 0.25 2000000000000 "" "" 100 0 1 "5m ago" 2000; printf "%s\n" "$QWEN_L1"' _ "$ROOT/bin/qq-telemetry")
[[ "$stale_qwen" != *'EXHAUSTED'* ]]
new_wall_qwen=$(HOME="$TMP/home" QQ_TELEMETRY_PROFILES_FILE="$TMP/config/qq/execution-profiles.json" \
  bash -c 'source "$1"; QWEN_WALL_TEXT="quota exhausted"; QWEN_WALL_TS=3000000; qwen_render_rows 0.25 2000000000000 "" "" 100 0 0 "" 2000; printf "%s\n" "$QWEN_L1"' _ "$ROOT/bin/qq-telemetry")
[[ "$new_wall_qwen" == *'EXHAUSTED'* ]]
full_qwen=$(HOME="$TMP/home" QQ_TELEMETRY_PROFILES_FILE="$TMP/config/qq/execution-profiles.json" \
  bash -c 'source "$1"; QWEN_WALL_TEXT=""; qwen_render_rows 1 2000000000000 "" "" 100 0 0; printf "%s\n" "$QWEN_L1"' _ "$ROOT/bin/qq-telemetry")
[[ "$full_qwen" == *'EXHAUSTED'* ]]
renewed_qwen=$(HOME="$TMP/home" QQ_TELEMETRY_PROFILES_FILE="$TMP/config/qq/execution-profiles.json" \
  bash -c 'source "$1"; QWEN_WALL_TEXT="quota exhausted"; QWEN_WALL_TS=1000000; qwen_render_rows 0 "" "" "" 40000 12000 0 "" 2000; printf "%s\n%s\n" "$QWEN_L1" "$QWEN_L2"' _ "$ROOT/bin/qq-telemetry")
renewed_plain=$(printf '%s' "$renewed_qwen" | sed 's/\x1b\[[0-9;]*m//g')
[[ "$renewed_plain" == *'7d'*'0 / 40,000'*'window not started'* ]]
[[ "$renewed_plain" == *'5h'*'0 / 12,000'*'window not started'* ]]
[[ "$renewed_plain" != *'EXHAUSTED'* ]]
renewed_summary=$(HOME="$TMP/home" bash -c 'source "$1"; GATEWAY_SPEC=pro; GATEWAY_WEEKLY=0.0; GATEWAY_RESET=""; GATEWAY_WEEKLY_CEILING=40000; GATEWAY_5H_CEILING=12000; print_gateway_summary' _ "$ROOT/bin/qq-telemetry-cookies")
[[ "$renewed_summary" == *'gateway round-trip: ok'* ]]
[[ "$renewed_summary" == *'weekly reset: window not started'* ]]

mkdir -p "$TMP/home/.pi/agent" "$TMP/fake-bin"
cat >"$TMP/home/.pi/agent/auth.json" <<'JSON'
{"xai":{"type":"oauth","access":"stale","refresh":"refresh","expires":1}}
JSON
cat >"$TMP/fake-bin/pi" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$PI_LOG"
SH
chmod 700 "$TMP/fake-bin/pi"
PI_LOG="$TMP/pi.log" PATH="$TMP/fake-bin:$PATH" HOME="$TMP/home" \
  QQ_TELEMETRY_PROFILES_FILE="$TMP/config/qq/execution-profiles.json" \
  bash -c 'source "$1"; refresh_xai_auth' _ "$ROOT/bin/qq-telemetry"
[[ "$(cat "$TMP/pi.log")" == 'auth check --provider xai' ]]

signal_tmp="$TMP/signal-cleanup"
mkdir "$signal_tmp"
set +e
HOME="$TMP/home" QQ_TELEMETRY_PROFILES_FILE="$TMP/config/qq/execution-profiles.json" \
  bash -c 'source "$1"; rm -rf -- "$TELEMETRY_TMP"; TELEMETRY_TMP="$2"; kill -TERM $$; sleep 1' \
  _ "$ROOT/bin/qq-telemetry" "$signal_tmp"
signal_status=$?
set -e
[[ "$signal_status" -eq 143 ]]
[[ ! -e "$signal_tmp" ]]

jq '.contextWindowCeiling = 262144' "$TMP/config/qq/execution-profiles.json" >"$TMP/bad.json"
if HOME="$TMP/home" QQ_TELEMETRY_PROFILES_FILE="$TMP/bad.json" bash -c 'source "$1"; validate_profiles_file' _ "$ROOT/bin/qq-telemetry"; then
  echo 'telemetry accepted a wrong context ceiling' >&2
  exit 1
fi

echo 'test-telemetry: pass'
