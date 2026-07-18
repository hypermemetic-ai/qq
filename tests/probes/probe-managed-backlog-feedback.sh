#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
EVIDENCE_DIR="$SCRIPT_DIR/evidence"
EVIDENCE="$EVIDENCE_DIR/$(date -u +%F)-c3-managed-backlog-feedback.txt"
mkdir -p "$EVIDENCE_DIR"

run_probe() (
  set -euo pipefail

  local hook="$ROOT/bin/qq-claude-backlog-hook"
  local target="$ROOT/backlog/tasks/t-80-probe.md"
  local tmp payload status stderr_lines
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/qq-c3-probe.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT

  if [ ! -x "$hook" ]; then
    printf 'CRITICAL: hook is not executable: %s\n' "$hook"
    exit 1
  fi

  payload="$(python3 -c '
import json
import sys

print(json.dumps({
    "tool_name": "Edit",
    "tool_input": {"file_path": sys.argv[1], "old_string": "before", "new_string": "after"},
}))
' "$target")"

  printf 'probe: C3 structured edits to managed Backlog markdown get local feedback\n'
  printf 'captured_utc: %s\n' "$(date -u +%FT%TZ)"
  printf 'hook: %s\n' "$hook"
  printf 'synthetic_event: PreToolUse Edit targeting %s\n' "$target"

  status=0
  printf '%s\n' "$payload" | "$hook" >"$tmp/stdout" 2>"$tmp/stderr" || status=$?

  printf 'exit_status: %s\n' "$status"
  if [ -s "$tmp/stdout" ]; then
    sed 's/^/stdout: /' "$tmp/stdout"
  else
    printf 'stdout: <empty>\n'
  fi
  if [ -s "$tmp/stderr" ]; then
    sed 's/^/stderr: /' "$tmp/stderr"
  else
    printf 'stderr: <empty>\n'
  fi

  if [ "$status" -ne 2 ]; then
    printf 'CRITICAL: expected the hook to deny the Edit event with exit 2\n'
    exit 1
  fi
  if [ -s "$tmp/stdout" ]; then
    printf 'CRITICAL: denial unexpectedly wrote to stdout\n'
    exit 1
  fi
  stderr_lines="$(wc -l <"$tmp/stderr")"
  if [ "$stderr_lines" -ne 1 ]; then
    printf 'CRITICAL: expected exactly one feedback line on stderr, got %s\n' "$stderr_lines"
    exit 1
  fi
  if ! grep -Fxq \
    'qq-claude-backlog-hook: managed Backlog markdown must be edited through the backlog CLI' \
    "$tmp/stderr"; then
    printf 'CRITICAL: denial did not carry the managed-Backlog feedback\n'
    exit 1
  fi

  printf 'result: PASS — the black-box hook denied the structured edit with local feedback\n'
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
