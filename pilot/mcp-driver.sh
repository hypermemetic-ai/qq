#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' \
    'usage: pilot/mcp-driver.sh list | call <tool-name> [json-arguments]' >&2
  exit 2
}

case "${1:-}" in
  list)
    [ "$#" -eq 1 ] || usage
    command=list
    tool_name=""
    tool_arguments='{}'
    ;;
  call)
    if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
      usage
    fi
    command=call
    tool_name="$2"
    tool_arguments="${3-}"
    if [ "$#" -eq 2 ]; then
      tool_arguments='{}'
    fi
    ;;
  *) usage ;;
esac

timeout_seconds="${QQ_MCP_TIMEOUT_SECONDS:-120}"
[[ "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] || {
  printf 'QQ_MCP_TIMEOUT_SECONDS must be a positive integer\n' >&2
  exit 2
}

if ! tool_arguments="$(jq -ce 'select(type == "object")' <<<"$tool_arguments")"; then
  printf 'tool arguments must be a JSON object\n' >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cli="$script_dir/vendor/node_modules/opencode-codebase-index/dist/cli.js"
[ -f "$cli" ] || {
  printf 'challenger CLI is missing: %s\n' "$cli" >&2
  exit 1
}

initialize="$(
  jq -cn '{
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {name: "qq-t108-pilot", version: "1"}
    }
  }'
)"
initialized='{"jsonrpc":"2.0","method":"notifications/initialized"}'
if [ "$command" = list ]; then
  request='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
else
  request="$(jq -cn \
    --arg name "$tool_name" \
    --argjson arguments "$tool_arguments" \
    '{jsonrpc: "2.0", id: 2, method: "tools/call", params: {name: $name, arguments: $arguments}}')"
fi

coproc MCP_SERVER { node "$cli"; }
server_pid="$MCP_SERVER_PID"
server_output_fd="${MCP_SERVER[0]}"
server_input_fd="${MCP_SERVER[1]}"

# shellcheck disable=SC2317  # Invoked indirectly by traps.
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

printf '%s\n%s\n%s\n' "$initialize" "$initialized" "$request" >&"$server_input_fd"
exec {server_input_fd}>&-

while IFS= read -r -t "$timeout_seconds" line <&"$server_output_fd"; do
  if jq -e '.id == 2' >/dev/null 2>&1 <<<"$line"; then
    jq . <<<"$line"
    if jq -e '.error != null or .result.isError == true' >/dev/null 2>&1 <<<"$line"; then
      exit 1
    fi
    exit 0
  fi
done

printf 'MCP request failed or timed out after %ss\n' "$timeout_seconds" >&2
exit 1
