#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
pilot_root="$(cd -- "$script_dir/.." && pwd -P)"
worktree="$(cd -- "$pilot_root/.." && pwd -P)"

repository_root="$(git -C "$worktree" rev-parse --show-toplevel)"
repository_root="$(realpath -e -- "$repository_root")"
[[ "$repository_root" == "$worktree" ]] || {
  printf 'pilot check runner is not inside its assigned worktree\n' >&2
  exit 64
}

runtime_root="$(mktemp -d /tmp/qq-t94-pilot.XXXXXX)"
cleanup() {
  if [[ "${QQ_PILOT_KEEP_RUNTIME:-0}" == "1" ]]; then
    printf 'pilot runtime retained: %s\n' "$runtime_root" >&2
    return
  fi
  case "$runtime_root" in
    /tmp/qq-t94-pilot.*) rm -rf -- "$runtime_root" ;;
    *) printf 'refusing to clean unexpected runtime path: %s\n' "$runtime_root" >&2 ;;
  esac
}
trap cleanup EXIT

mock_pi="$runtime_root/mock-pi"
gcc -std=c11 -O2 -Wall -Wextra -Werror -static \
  -o "$mock_pi" "$pilot_root/probes/mock-pi.c"
file "$mock_pi" | grep -q 'statically linked'

mkdir -p "$runtime_root/parent-pi-config" "$runtime_root/tmp"
pi_cli="$(readlink -f -- "$(command -v pi)")"
pi_package_root="$(cd -- "$(dirname -- "$pi_cli")/.." && pwd -P)"
export TMPDIR="$runtime_root/tmp"
export NODE_PATH="$pi_package_root/node_modules${NODE_PATH:+:$NODE_PATH}"
export PI_CODING_AGENT_DIR="$runtime_root/parent-pi-config"
export PI_CODING_AGENT_SESSION_DIR="$runtime_root/parent-sessions"
export PI_SUBAGENT_EXTRA_AGENT_DIRS="$pilot_root/manifests/agents"
export PI_SUBAGENT_PI_BINARY="$pilot_root/bin/pi-landstrip-wrapper"
export QQ_PILOT_PI_BINARY="$mock_pi"
export QQ_PILOT_MOCK_PI="$mock_pi"
export QQ_PILOT_RUNTIME_ROOT="$runtime_root"
export QQ_PILOT_TIMEOUT=30s
export PI_OFFLINE=1

exec node "$worktree/.pi/npm/node_modules/jiti/lib/jiti-cli.mjs" \
  "$script_dir/pilot-checks.ts" "$runtime_root"
