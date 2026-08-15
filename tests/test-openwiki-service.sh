#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d "$HOME/qq-openwiki-service-test.XXXXXX")"
cleanup() { rm -rf -- "$TMP"; }
trap cleanup EXIT

CONFIG_HOME="$TMP/config"
POLICY="$CONFIG_HOME/qq/execution-profiles.json"
STATE="$TMP/dispatcher-env"
FAKE_DISPATCHER="$TMP/fake-dispatcher"
mkdir -p "$CONFIG_HOME/qq"
cat >"$FAKE_DISPATCHER" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n%s\n' "$OPENWIKI_PROVIDER" "$OPENWIKI_MODEL_ID" >"$QQ_TEST_STATE"
exit "${QQ_TEST_EXIT:-0}"
SH
chmod +x "$FAKE_DISPATCHER"

write_policy() {
  local provider="$1" effort="$2" model="${3:-gpt-5.6-sol}"
  cat >"$POLICY" <<JSON
{
  "schema": "qq.execution-profiles/v1",
  "contextWindowCeiling": 200000,
  "roles": {
    "runner": {
      "default": "default",
      "profiles": {
        "default": { "provider": "openai-codex", "model": "gpt-5.6-sol", "effort": "high" }
      }
    },
    "architect": {
      "default": "default",
      "profiles": {
        "default": { "provider": "openai-codex", "model": "gpt-5.6-sol", "effort": "high" }
      }
    }
  },
  "scribe": { "provider": "openai-codex", "model": "gpt-5.6-sol", "effort": "high" },
  "qa": { "provider": "openai-codex", "model": "gpt-5.6-sol", "effort": "xhigh" },
  "openwiki": { "provider": "$provider", "model": "$model", "effort": "$effort" }
}
JSON
  chmod 600 "$POLICY"
}

write_policy openai-codex medium gpt-5.6-service
XDG_CONFIG_HOME="$CONFIG_HOME" \
QQ_OPENWIKI_DISPATCH_BIN="$FAKE_DISPATCHER" \
QQ_TEST_STATE="$STATE" \
OPENWIKI_PROVIDER=ignored \
OPENWIKI_MODEL_ID=ignored \
  "$ROOT/bin/qq-openwiki-service"
mapfile -t selected <"$STATE"
[[ "${selected[*]}" == "openai-chatgpt gpt-5.6-service" ]]

rm -f "$STATE"
write_policy xai-auth medium
if XDG_CONFIG_HOME="$CONFIG_HOME" QQ_OPENWIKI_DISPATCH_BIN="$FAKE_DISPATCHER" QQ_TEST_STATE="$STATE" \
  "$ROOT/bin/qq-openwiki-service" 2>"$TMP/provider-error"; then
  echo "OpenWiki service launcher accepted an unsupported provider" >&2
  exit 1
fi
grep -Fq 'openwiki provider cannot be honored: xai-auth' "$TMP/provider-error"
[[ ! -e "$STATE" ]]

write_policy openai-codex high
if XDG_CONFIG_HOME="$CONFIG_HOME" QQ_OPENWIKI_DISPATCH_BIN="$FAKE_DISPATCHER" QQ_TEST_STATE="$STATE" \
  "$ROOT/bin/qq-openwiki-service" 2>"$TMP/effort-error"; then
  echo "OpenWiki service launcher accepted an unsupported effort" >&2
  exit 1
fi
grep -Fq 'openwiki effort cannot be honored: high; only medium is supported' "$TMP/effort-error"
[[ ! -e "$STATE" ]]

write_policy openai-codex medium
if XDG_CONFIG_HOME="$CONFIG_HOME" QQ_OPENWIKI_DISPATCH_BIN="$FAKE_DISPATCHER" QQ_TEST_STATE="$STATE" QQ_TEST_EXIT=7 \
  "$ROOT/bin/qq-openwiki-service"; then
  echo "OpenWiki service launcher ignored dispatcher failure" >&2
  exit 1
else
  [[ "$?" == 7 ]]
fi

SERVICE="$ROOT/systemd/user/qq-openwiki.service"
TIMER="$ROOT/systemd/user/qq-openwiki.timer"
grep -Fxq 'ExecStart=%h/projects/qq/bin/qq-openwiki-service' "$SERVICE"
if grep -Eq '^Environment=OPENWIKI_(PROVIDER|MODEL_ID)=' "$SERVICE"; then
  echo "OpenWiki service unit hardcodes the profile binding" >&2
  exit 1
fi
mapfile -t calendar < <(grep '^OnCalendar=' "$TIMER")
[[ "${#calendar[@]}" == 3 ]]
[[ "${calendar[0]}" == 'OnCalendar=*-*-* 04:00:00' ]]
[[ "${calendar[1]}" == 'OnCalendar=*-*-* 12:00:00' ]]
[[ "${calendar[2]}" == 'OnCalendar=*-*-* 20:00:00' ]]
grep -Fxq 'Persistent=false' "$TIMER"
if grep -q '^RandomizedDelaySec=' "$TIMER"; then
  echo "OpenWiki timer configures a random delay" >&2
  exit 1
fi

echo "test-openwiki-service: pass"
