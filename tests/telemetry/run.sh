#!/usr/bin/env bash
set -u

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
# shellcheck source=bin/lib/telemetry-lib.sh
source "$ROOT/bin/lib/telemetry-lib.sh"

failures=0

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

test_bar_rendering
test_fmt_num
test_tier_ceiling
test_projection
test_wall_matcher

if [ "$failures" -gt 0 ]; then
  printf '%d telemetry test(s) failed\n' "$failures"
  exit 1
fi
printf 'all telemetry tests passed\n'
