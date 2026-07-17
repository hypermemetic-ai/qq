#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
EVIDENCE_DIR="$SCRIPT_DIR/evidence"
EVIDENCE="$EVIDENCE_DIR/$(date -u +%F)-c6-delivery-without-herdr.txt"
mkdir -p "$EVIDENCE_DIR"

masked_path=''
excluded_dirs=''
IFS=: read -r -a path_entries <<<"$PATH"
for path_entry in "${path_entries[@]}"; do
  if [ -z "$path_entry" ]; then
    path_entry='.'
  fi
  if [ -x "$path_entry/herdr" ]; then
    if [ -n "$excluded_dirs" ]; then
      excluded_dirs="$excluded_dirs,"
    fi
    excluded_dirs="$excluded_dirs$path_entry"
    continue
  fi
  if [ -n "$masked_path" ]; then
    masked_path="$masked_path:"
  fi
  masked_path="$masked_path$path_entry"
done

run_probe() (
  set -euo pipefail

  local found
  printf 'probe: C6 delivery-critical local Checks pass with Herdr absent\n'
  printf 'captured_utc: %s\n' "$(date -u +%FT%TZ)"
  printf 'excluded_path_directories: %s\n' "${excluded_dirs:-<none; Herdr was already absent>}"
  printf 'masked_path: %s\n' "$masked_path"

  if found="$(env PATH="$masked_path" bash --noprofile --norc -c 'command -v herdr' 2>/dev/null)"; then
    printf 'CRITICAL: Herdr is still resolvable on the masked PATH: %s\n' "$found"
    exit 1
  fi
  printf 'herdr_resolution: absent\n'
  printf 'check: for t in tests/test-*.sh; do bash "$t" || exit 1; done\n'

  env PATH="$masked_path" bash --noprofile --norc -c '
    set -euo pipefail
    cd "$1"
    for test_script in tests/test-*.sh; do
      bash "$test_script" || exit 1
    done
  ' probe-without-herdr "$ROOT"

  printf 'result: PASS — the complete shell Check suite passed while Herdr was absent\n'
)

set +e
run_probe 2>&1 | tee "$EVIDENCE"
pipeline_status=("${PIPESTATUS[@]}")
set -e
if [ "${pipeline_status[1]}" -ne 0 ]; then
  printf 'CRITICAL: could not write evidence file: %s\n' "$EVIDENCE" >&2
  exit "${pipeline_status[1]}"
fi
exit "${pipeline_status[0]}"
