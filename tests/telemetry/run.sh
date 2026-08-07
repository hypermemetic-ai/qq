#!/usr/bin/env bash
set -u

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
# shellcheck source=bin/lib/telemetry-lib.sh
source "$ROOT/bin/lib/telemetry-lib.sh"

failures=0
TEST_TMP=$(mktemp -d "${TMPDIR:-/tmp}/qq-telemetry-tests.XXXXXX") || exit 1
trap 'rm -rf -- "$TEST_TMP"' EXIT HUP INT TERM

fail() {
  printf 'not ok - %s: %s\n' "$1" "$2"
  failures=$((failures + 1))
}

pass() {
  printf 'ok - %s\n' "$1"
}

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    pass "$name"
  else
    fail "$name" "expected [$expected], got [$actual]"
  fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    pass "$name"
  else
    fail "$name" "missing expected text [$needle]"
  fi
}

assert_not_contains() {
  local name="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    fail "$name" "found forbidden text [$needle]"
  else
    pass "$name"
  fi
}

repeat() {
  local glyph="$1" count="$2" result='' i
  for ((i=0; i<count; i++)); do result+="$glyph"; done
  printf '%s' "$result"
}

test_bar_rendering() {
  local rendered expected
  BAR_CELLS=16
  rendered=$(bar 0.5)
  expected="$(repeat '█' 8)$(repeat '░' 8)"
  assert_eq 'bar fraction' "$expected" "$rendered"
  assert_eq 'bar character width' '16' "${#rendered}"
  if printf '%s' "$rendered" | iconv -f UTF-8 -t UTF-8 >/dev/null 2>&1; then
    pass 'bar UTF-8 integrity'
  else
    fail 'bar UTF-8 integrity' 'iconv rejected the output'
  fi
  assert_eq 'bar clamps below zero' "$(repeat '░' 16)" "$(bar -4)"
  assert_eq 'bar clamps above one' "$(repeat '█' 16)" "$(bar 9)"
}

test_fmt_num() {
  assert_eq 'fmt_num thousands' '1,234' "$(fmt_num 1234)"
  assert_eq 'fmt_num millions' '12,345,678' "$(fmt_num 12345678)"
  assert_eq 'fmt_num short' '42' "$(fmt_num 42)"
}

test_tier_ceiling() {
  local fixture weekly five_hour
  fixture='{"data":{"DataV2":{"data":{"data":{"pro":{"weekly":40000.9,"five_hour":5000.2},"free":{"weekly":100}}}}}}'
  weekly=$(tier_ceiling "$fixture" pro weekly) || weekly='error'
  five_hour=$(tier_ceiling "$fixture" pro five_hour) || five_hour='error'
  assert_eq 'tier ceiling weekly' '40000' "$weekly"
  assert_eq 'tier ceiling five_hour' '5000' "$five_hour"
}

test_projection() {
  assert_eq 'calibrated projection formula' '1250' \
    "$(calibrated_projection 1000 0.5 1500 1000)"
  assert_eq 'calibrated projection integer' '102' \
    "$(calibrated_projection 100 0.5 105 100)"
  assert_eq 'calibrated projection floor zero' '0' \
    "$(calibrated_projection 10 2 0 100)"
}

test_wall_matcher() {
  local insufficient exhausted unrelated no_error
  insufficient='{"message":{"stopReason":"error","errorMessage":"insufficient_quota; reset later"}}'
  exhausted='{"message":{"stopReason":"error","errorMessage":"Quota has been exhausted. Try later."}}'
  unrelated='{"message":{"stopReason":"error","errorMessage":"network timeout"}}'
  no_error='{"message":{"stopReason":"stop","errorMessage":"insufficient_quota"}}'
  if wall_event_matcher "$insufficient"; then pass 'wall matcher insufficient_quota'; else fail 'wall matcher insufficient_quota' 'did not match'; fi
  if wall_event_matcher "$exhausted"; then pass 'wall matcher exhausted phrase'; else fail 'wall matcher exhausted phrase' 'did not match'; fi
  if wall_event_matcher "$unrelated"; then fail 'wall matcher unrelated' 'unexpected match'; else pass 'wall matcher unrelated'; fi
  if wall_event_matcher "$no_error"; then fail 'wall matcher stopReason' 'unexpected match'; else pass 'wall matcher stopReason'; fi
}

test_qwen_attempt_cadence() {
  local case_dir="$TEST_TMP/cadence" output
  mkdir -p "$case_dir/home/.local/state/qq/telemetry"
  : >"$case_dir/home/.local/state/qq/telemetry/qwen.cookies"
  output=$(HOME="$case_dir/home" ROOT="$ROOT" bash -c '
    source "$ROOT/bin/qq-telemetry"
    QWEN_MTR_TS=$(now_epoch)
    attempts=0
    qwen_gateway_fetch() { attempts=$((attempts + 1)); return 1; }
    now=$(now_epoch)
    qwen_update "$now"
    qwen_update "$now"
    normal_attempts=$attempts
    if [[ "$QWEN_SOURCE" == *"official gateway unreachable"* ]]; then unreachable=1; else unreachable=0; fi
    FORCE_QWEN=1
    qwen_update "$now"
    if [ "$QWEN_GW_ATTEMPT_TS" = "$now" ]; then tracked=1; else tracked=0; fi
    printf "%s|%s|%s|%s|%s" "$normal_attempts" "$attempts" "$QWEN_GW_TS" "$tracked" "$unreachable"
  ')
  assert_eq 'Qwen failed gateway attempts are cadence-capped' '1|2|0|1|1' "$output"
}

test_seats_reload_each_tick() {
  local case_dir="$TEST_TMP/seats" output
  mkdir -p "$case_dir/home"
  printf '%s\n' '{"alpha":{"provider":"deepseek","model":"model-a"}}' >"$case_dir/profiles.json"
  printf '%s\n' '{"beta":{"provider":"deepseek","model":"model-b"}}' >"$case_dir/profiles-next.json"
  output=$(HOME="$case_dir/home" ROOT="$ROOT" \
    QQ_TELEMETRY_PROFILES_FILE="$case_dir/profiles.json" NEXT_PROFILES="$case_dir/profiles-next.json" \
    bash -c '
      source "$ROOT/bin/qq-telemetry"
      QWEN_MTR_TS=$(now_epoch)
      fetch_all
      printf "%s\n" "$DS_SEATS"
      cp -- "$NEXT_PROFILES" "$PROFILES_FILE"
      fetch_all
      printf "%s\n" "$DS_SEATS"
    ')
  assert_eq 'seat assignments reload on every fetch tick' \
    $'seats: alpha (model-a)\nseats: beta (model-b)' "$output"
}

test_meter_provider_and_wall_canonicalization() {
  local case_dir="$TEST_TMP/meter" home session output rc sum wall_text combined nowms
  case_dir="$TEST_TMP/meter"
  home="$case_dir/home"
  session="$home/.pi/agent/sessions/case/session.jsonl"
  mkdir -p "$(dirname -- "$session")"
  nowms=$(( $(date +%s) * 1000 ))
  cat >"$session" <<EOF
{"message":{"provider":"qwen-token-plan","stopReason":"stop","timestamp":$nowms,"usage":{"totalTokens":7}}}
{"message":{"provider":"openai","stopReason":"stop","timestamp":$nowms,"usage":{"totalTokens":123},"metadata":{"provider":"qwen-token-plan"}}}
{"message":{"provider":"qwen-token-plan","stopReason":"error","timestamp":$((nowms + 1)),"errorMessage":"insufficient_quota JSESSIONID=SYNTHETIC_COOKIE_SENTINEL_TEST_ONLY"}}
{"message":{"provider":"qwen-token-plan","stopReason":"error","timestamp":$((nowms + 2)),"errorMessage":"Quota has been exhausted; SYNTHETIC_COOKIE_SENTINEL_TEST_ONLY"}}
EOF
  HOME="$home" QQ_TELEMETRY_PROFILES_FILE="$case_dir/missing-profiles.json" \
    "$ROOT/bin/qq-telemetry" --once >"$case_dir/output" 2>"$case_dir/stderr"
  rc=$?
  output=$(cat "$case_dir/output")
  sum=$(jq -r '[to_entries[].value.sum7d // 0] | add // 0' \
    "$home/.local/state/qq/telemetry/meter-cache.json")
  wall_text=$(jq -r '[to_entries[].value.walls[]?.text] | join("|")' \
    "$home/.local/state/qq/telemetry/meter-cache.json")
  combined="$output$(cat "$home/.local/state/qq/telemetry/meter-cache.json")"
  assert_eq 'meter fixture panel exits zero' '0' "$rc"
  assert_eq 'meter counts only actual Qwen provider messages' '7' "$sum"
  assert_contains 'meter renders filtered Qwen total' '7 tokens on this machine' "$output"
  assert_eq 'wall events map to fixed phrases' 'insufficient quota|quota exhausted' "$wall_text"
  assert_contains 'wall line renders only fixed text' 'wall: quota exhausted' "$output"
  assert_not_contains 'wall output and cache omit vendor sentinel' 'SYNTHETIC_COOKIE_SENTINEL_TEST_ONLY' "$combined"
}

test_cached_wall_canonicalization() {
  local case_dir="$TEST_TMP/cached-wall" home session cache nowms mtime size output combined
  home="$case_dir/home"
  session="$home/.pi/agent/sessions/case/session.jsonl"
  cache="$home/.local/state/qq/telemetry/meter-cache.json"
  mkdir -p "$(dirname -- "$session")" "$(dirname -- "$cache")"
  printf 'unchanged session fixture\n' >"$session"
  nowms=$(( $(date +%s) * 1000 ))
  mtime=$(stat -c '%Y' -- "$session")
  size=$(stat -c '%s' -- "$session")
  jq -n --arg path "$session" --argjson mtime "$mtime" --argjson size "$size" --argjson timestamp "$nowms" '
    {($path): {
      mtime: $mtime,
      size: $size,
      sum7d: 0,
      sum5h: 0,
      events: [],
      walls: [{timestamp: $timestamp, text: "insufficient_quota JSESSIONID=SYNTHETIC_COOKIE_SENTINEL_CACHED"}]
    }}
  ' >"$cache"
  HOME="$home" QQ_TELEMETRY_PROFILES_FILE="$case_dir/missing-profiles.json" \
    "$ROOT/bin/qq-telemetry" --once >"$case_dir/output" 2>"$case_dir/stderr"
  output=$(cat "$case_dir/output")
  combined="$output$(cat "$cache")"
  assert_contains 'cached wall maps to fixed phrase' 'wall: insufficient quota' "$output"
  assert_eq 'cached wall is rewritten canonically' 'insufficient quota' \
    "$(jq -r '[to_entries[].value.walls[]?.text] | last' "$cache")"
  assert_not_contains 'cached vendor sentinel cannot resurface' 'SYNTHETIC_COOKIE_SENTINEL_CACHED' "$combined"
}

test_no_tty_sleep_and_interactive_pty() {
  local case_dir="$TEST_TMP/tty" home rc renders tty_errors pty_rc pty_renders
  home="$case_dir/home"
  mkdir -p "$home"
  set +e
  {
    HOME="$home" QQ_TELEMETRY_PROFILES_FILE="$case_dir/missing-profiles.json" TELEMETRY_REFRESH=2 \
      timeout --signal=KILL 0.5 "$ROOT/bin/qq-telemetry" </dev/null \
      >"$case_dir/no-tty-output" 2>"$case_dir/no-tty-stderr"
    rc=$?
  } 2>"$case_dir/no-tty-launcher-stderr"
  set -u
  renders=$(grep -c 'TELEMETRY — provider usage' "$case_dir/no-tty-output" || true)
  tty_errors=$(grep -c '/dev/tty' "$case_dir/no-tty-stderr" || true)
  assert_eq 'non-TTY loop remains asleep until timeout' '1' "$renders"
  assert_eq 'non-TTY loop does not read /dev/tty' '0' "$tty_errors"
  if [ "$rc" -eq 137 ]; then pass 'non-TTY loop timeout reached'; else fail 'non-TTY loop timeout reached' "unexpected exit $rc"; fi

  set +e
  printf 'q' | HOME="$home" QQ_TELEMETRY_PROFILES_FILE="$case_dir/missing-profiles.json" TELEMETRY_REFRESH=10 \
    timeout 3 script -q -e -c "$ROOT/bin/qq-telemetry" /dev/null \
    >"$case_dir/pty-output" 2>"$case_dir/pty-stderr"
  pty_rc=$?
  set -u
  pty_renders=$(grep -c 'TELEMETRY — provider usage' "$case_dir/pty-output" || true)
  assert_eq 'interactive PTY accepts q without waiting for cadence' '0' "$pty_rc"
  assert_eq 'interactive PTY renders once before q' '1' "$pty_renders"
}

make_fake_cookie_case() {
  local case_dir="$1"
  mkdir -p "$case_dir/home/profile" "$case_dir/fakepkg" "$case_dir/venv/bin"
  : >"$case_dir/home/profile/cookies.sqlite"
  cat >"$case_dir/fakepkg/browser_cookie3.py" <<'PY'
class Cookie:
    domain = ".qwencloud.com"
    path = "/"
    name = "synthetic_cookie"
    value = "SYNTHETIC_COOKIE_SENTINEL_TEST_ONLY"
    secure = True
    expires = 0


def firefox(cookie_file, domain_name):
    return [Cookie()]
PY
  cat >"$case_dir/venv/bin/python" <<EOF
#!/usr/bin/env bash
PYTHONPATH="$case_dir/fakepkg" exec python3 "\$@"
EOF
  chmod +x "$case_dir/venv/bin/python"
}

run_fake_cookie_write() {
  local case_dir="$1"
  HOME="$case_dir/home" CASE_DIR="$case_dir" ROOT="$ROOT" bash -c '
    source "$ROOT/bin/qq-telemetry-cookies"
    VENV_DIR="$CASE_DIR/venv"
    browser_cookie_helper write "$HOME/profile"
  '
}

test_cookie_destination_guard() {
  local case_dir="$TEST_TMP/cookie-redirect" rc output
  make_fake_cookie_case "$case_dir"
  mkdir -p "$case_dir/home/.local/state/qq" "$case_dir/victim"
  ln -s "$case_dir/victim" "$case_dir/home/.local/state/qq/telemetry"
  set +e
  run_fake_cookie_write "$case_dir" >"$case_dir/output" 2>&1
  rc=$?
  set -u
  output=$(cat "$case_dir/output")
  if [ "$rc" -ne 0 ]; then pass 'cookie helper refuses symlinked state parent'; else fail 'cookie helper refuses symlinked state parent' 'write unexpectedly succeeded'; fi
  if [ ! -e "$case_dir/victim/qwen.cookies" ]; then pass 'cookie parent guard prevents redirected write'; else fail 'cookie parent guard prevents redirected write' 'victim file was created'; fi
  assert_contains 'cookie parent guard reports refusal' 'Refusing a symlink telemetry state directory.' "$output"
  assert_not_contains 'cookie parent refusal prints no synthetic value' 'SYNTHETIC_COOKIE_SENTINEL_TEST_ONLY' "$output"
}

test_cookie_clobber_refusal() {
  local case_dir="$TEST_TMP/cookie-clobber" snapshot before after rc output
  make_fake_cookie_case "$case_dir"
  mkdir -p "$case_dir/home/.local/state/qq/telemetry"
  snapshot="$case_dir/home/.local/state/qq/telemetry/qwen.cookies"
  printf 'UNRELATED_USER_FILE_SENTINEL\n' >"$snapshot"
  before=$(sha256sum "$snapshot" | awk '{print $1}')
  set +e
  run_fake_cookie_write "$case_dir" >"$case_dir/output" 2>&1
  rc=$?
  set -u
  after=$(sha256sum "$snapshot" | awk '{print $1}')
  output=$(cat "$case_dir/output")
  if [ "$rc" -ne 0 ]; then pass 'cookie helper refuses non-snapshot file'; else fail 'cookie helper refuses non-snapshot file' 'write unexpectedly succeeded'; fi
  assert_eq 'cookie clobber refusal leaves file unchanged' "$before" "$after"
  assert_contains 'cookie clobber guard reports refusal' 'Refusing to overwrite a non-telemetry snapshot file.' "$output"
  assert_not_contains 'cookie clobber refusal prints no synthetic value' 'SYNTHETIC_COOKIE_SENTINEL_TEST_ONLY' "$output"
}

test_cookie_existing_snapshot_write() {
  local case_dir="$TEST_TMP/cookie-snapshot" snapshot rc headers mode output
  make_fake_cookie_case "$case_dir"
  mkdir -p "$case_dir/home/.local/state/qq/telemetry"
  snapshot="$case_dir/home/.local/state/qq/telemetry/qwen.cookies"
  cat >"$snapshot" <<'EOF'
# Netscape HTTP Cookie File
# qwencloud.com rows for qq telemetry; values intentionally never displayed
EOF
  set +e
  run_fake_cookie_write "$case_dir" >"$case_dir/output" 2>&1
  rc=$?
  set -u
  headers=$(sed -n '1,2p' "$snapshot")
  mode=$(stat -c '%a' -- "$snapshot")
  output=$(cat "$case_dir/output")
  assert_eq 'cookie helper accepts identified snapshot' '0' "$rc"
  assert_eq 'cookie snapshot retains controlled headers' \
    $'# Netscape HTTP Cookie File\n# qwencloud.com rows for qq telemetry; values intentionally never displayed' "$headers"
  assert_eq 'cookie snapshot write enforces mode 600' '600' "$mode"
  assert_not_contains 'cookie snapshot success prints no synthetic value' 'SYNTHETIC_COOKIE_SENTINEL_TEST_ONLY' "$output"
}

test_bar_rendering
test_fmt_num
test_tier_ceiling
test_projection
test_wall_matcher
test_qwen_attempt_cadence
test_seats_reload_each_tick
test_meter_provider_and_wall_canonicalization
test_cached_wall_canonicalization
test_no_tty_sleep_and_interactive_pty
test_cookie_destination_guard
test_cookie_clobber_refusal
test_cookie_existing_snapshot_write

if [ "$failures" -gt 0 ]; then
  printf '%d telemetry test(s) failed\n' "$failures"
  exit 1
fi
printf 'all telemetry tests passed\n'
