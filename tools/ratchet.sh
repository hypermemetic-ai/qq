#!/usr/bin/env bash
set -euo pipefail

export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
STATE_FILE="$SCRIPT_DIR/ratchet-baselines.conf"

fail() {
  printf 'ratchet: %s\n' "$*" >&2
  exit 2
}

usage() {
  printf 'usage: %s check|update\n' "$0" >&2
  exit 2
}

require_unsigned() {
  local name="$1"
  local value="$2"

  [[ "$value" =~ ^[0-9]+$ ]] || fail "$name must be an unsigned integer"
}

require_match_config() {
  local name="$1"
  local scope="$2"
  local match_kind="$3"
  local pattern="$4"

  [ -n "$scope" ] || fail "$name scope is empty"
  [ -n "$pattern" ] || fail "$name pattern is empty"
  case "$match_kind" in
    fixed | extended-regex) ;;
    *) fail "$name has unsupported match kind: $match_kind" ;;
  esac
}

measure_prose_words() {
  local relative_pattern
  local path
  local count
  local total=0
  local -a matches

  for relative_pattern in "${prose_words_paths[@]}"; do
    matches=()
    while IFS= read -r path; do
      matches+=("$path")
    done < <(compgen -G "$ROOT/$relative_pattern" || true)

    [ "${#matches[@]}" -gt 0 ] || \
      fail "prose_words scope matched no files: $relative_pattern"

    for path in "${matches[@]}"; do
      [ -f "$path" ] || fail "prose_words scope is not a file: $path"
      count="$(wc -w <"$path")"
      total=$((total + count))
    done
  done

  printf '%s\n' "$total"
}

count_occurrences() {
  local name="$1"
  local scope="$2"
  local match_kind="$3"
  local pattern="$4"
  local scope_path="$ROOT/${scope%/}"
  local output
  local grep_status
  local count

  [ -d "$scope_path" ] || fail "$name scope is not a directory: $scope"

  # --binary-files=text: a scoped file carrying a NUL byte is otherwise
  # treated as binary, its -o matches suppressed from stdout while grep still
  # exits 0 — silently undercounting the idiom and passing a stale budget.
  set +e
  case "$match_kind" in
    fixed)
      output="$(grep --binary-files=text -rhoF -- "$pattern" "$scope_path")"
      grep_status=$?
      ;;
    extended-regex)
      output="$(grep --binary-files=text -rhoE -- "$pattern" "$scope_path")"
      grep_status=$?
      ;;
  esac
  set -e

  case "$grep_status" in
    0)
      count="$(printf '%s\n' "$output" | wc -l)"
      ;;
    1)
      count=0
      ;;
    *)
      fail "$name measurement failed while searching $scope"
      ;;
  esac

  printf '%s\n' "$count"
}

rewrite_budgets() {
  local prose_words="$1"
  local codex_exec="$2"
  local runtime_specific_flags="$3"
  local shell_parser_idioms="$4"
  local temporary

  temporary="$(mktemp "$STATE_FILE.tmp.XXXXXX")"
  if ! awk \
    -v prose_words="$prose_words" \
    -v codex_exec="$codex_exec" \
    -v runtime_specific_flags="$runtime_specific_flags" \
    -v shell_parser_idioms="$shell_parser_idioms" '
      BEGIN {
        prose_seen = codex_seen = runtime_seen = parser_seen = 0
      }
      /^prose_words_budget=/ {
        print "prose_words_budget=" prose_words
        prose_seen++
        next
      }
      /^codex_exec_budget=/ {
        print "codex_exec_budget=" codex_exec
        codex_seen++
        next
      }
      /^runtime_specific_flags_budget=/ {
        print "runtime_specific_flags_budget=" runtime_specific_flags
        runtime_seen++
        next
      }
      /^shell_parser_idioms_budget=/ {
        print "shell_parser_idioms_budget=" shell_parser_idioms
        parser_seen++
        next
      }
      { print }
      END {
        if (prose_seen != 1 || codex_seen != 1 ||
            runtime_seen != 1 || parser_seen != 1) {
          exit 65
        }
      }
    ' "$STATE_FILE" >"$temporary"; then
    rm -f "$temporary"
    fail "could not rewrite the four budget values in $STATE_FILE"
  fi

  chmod 0644 "$temporary"
  mv "$temporary" "$STATE_FILE"
}

[ "$#" -eq 1 ] || usage
mode="$1"
case "$mode" in
  check | update) ;;
  *) usage ;;
esac

[ -f "$STATE_FILE" ] || fail "missing budget state: $STATE_FILE"
# shellcheck source=tools/ratchet-baselines.conf
source "$STATE_FILE"

case "$(declare -p prose_words_paths 2>/dev/null || true)" in
  'declare -a '*) ;;
  *) fail "prose_words_paths must be an indexed array in $STATE_FILE" ;;
esac
[ "${#prose_words_paths[@]}" -gt 0 ] || \
  fail "prose_words_paths is empty in $STATE_FILE"
require_unsigned prose_words_budget "${prose_words_budget:-}"
require_unsigned codex_exec_budget "${codex_exec_budget:-}"
require_unsigned runtime_specific_flags_budget \
  "${runtime_specific_flags_budget:-}"
require_unsigned shell_parser_idioms_budget \
  "${shell_parser_idioms_budget:-}"
require_match_config codex_exec \
  "${codex_exec_scope:-}" \
  "${codex_exec_match_kind:-}" \
  "${codex_exec_pattern:-}"
require_match_config runtime_specific_flags \
  "${runtime_specific_flags_scope:-}" \
  "${runtime_specific_flags_match_kind:-}" \
  "${runtime_specific_flags_pattern:-}"
require_match_config shell_parser_idioms \
  "${shell_parser_idioms_scope:-}" \
  "${shell_parser_idioms_match_kind:-}" \
  "${shell_parser_idioms_pattern:-}"

names=(
  prose_words
  codex_exec
  runtime_specific_flags
  shell_parser_idioms
)
budgets=(
  "$prose_words_budget"
  "$codex_exec_budget"
  "$runtime_specific_flags_budget"
  "$shell_parser_idioms_budget"
)
measurements=(
  "$(measure_prose_words)"
  "$(count_occurrences codex_exec \
    "$codex_exec_scope" \
    "$codex_exec_match_kind" \
    "$codex_exec_pattern")"
  "$(count_occurrences runtime_specific_flags \
    "$runtime_specific_flags_scope" \
    "$runtime_specific_flags_match_kind" \
    "$runtime_specific_flags_pattern")"
  "$(count_occurrences shell_parser_idioms \
    "$shell_parser_idioms_scope" \
    "$shell_parser_idioms_match_kind" \
    "$shell_parser_idioms_pattern")"
)

status=0
changed=0
for index in "${!names[@]}"; do
  name="${names[$index]}"
  budget="${budgets[$index]}"
  measured="${measurements[$index]}"
  require_unsigned "$name measurement" "$measured"

  if [ "$measured" -gt "$budget" ]; then
    printf 'ratchet: %s exceeds budget: measured=%s budget=%s. Reduce the count to %s or less; a raise requires an operator-approved commit.\n' \
      "$name" "$measured" "$budget" "$budget" >&2
    status=1
  elif [ "$measured" -lt "$budget" ]; then
    changed=1
    if [ "$mode" = check ]; then
      printf 'ratchet: %s has a stale budget after an improvement: measured=%s budget=%s. Run tools/ratchet.sh update and commit the lowered budget.\n' \
        "$name" "$measured" "$budget" >&2
      status=1
    fi
  fi
done

if [ "$status" -ne 0 ]; then
  if [ "$mode" = update ]; then
    printf 'ratchet: refusing update because update never raises budgets.\n' >&2
  else
    printf 'ratchet: check failed.\n' >&2
  fi
  exit 1
fi

if [ "$mode" = check ]; then
  printf 'ratchet: all measured counts match their budgets.\n'
  exit 0
fi

if [ "$changed" -eq 0 ]; then
  printf 'ratchet: budgets already match measured counts.\n'
  exit 0
fi

rewrite_budgets \
  "${measurements[0]}" \
  "${measurements[1]}" \
  "${measurements[2]}" \
  "${measurements[3]}"

for index in "${!names[@]}"; do
  if [ "${measurements[$index]}" -lt "${budgets[$index]}" ]; then
    printf 'ratchet: lowered %s: %s -> %s\n' \
      "${names[$index]}" "${budgets[$index]}" "${measurements[$index]}"
  fi
done
