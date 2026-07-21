#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-file-navigation"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
NAVIGATION="$(cd "$TESTS_DIR/.." && pwd -P)/cockpit/shell/file-navigation.bash"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin" "$tmp/herdr-only-bin" "$tmp/no-tools-bin"
mkdir -p "$tmp/home/picked project" "$tmp/qq-home/nested" "$tmp/proj-deciq" "$tmp/proj-qq"

cat >"$tmp/bin/herdr" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-} ${2:-}" in
  "workspace list")
    printf '%s\n' "$FAKE_WORKSPACES_JSON"
    exit "${FAKE_HERDR_EXIT:-0}"
    ;;
  *)
    printf 'unexpected fake herdr command: %s\n' "$*" >&2
    exit 2
    ;;
esac
SH
chmod +x "$tmp/bin/herdr"
ln -s "$tmp/bin/herdr" "$tmp/herdr-only-bin/herdr"

cat >"$tmp/bin/find" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

[ "$1" = "$HOME" ] && [ "${2:-}" = "-type" ] || {
  printf 'unexpected find arguments: %s\n' "$*" >&2
  exit 2
}
i=0
while [ "$i" -lt 3000 ]; do
  printf '%s\n' "$HOME/candidate-$i"
  i=$((i+1))
done
printf '%s\n' "$FAKE_FZF_PICK"
SH
chmod +x "$tmp/bin/find"

# The fake selector streams like a real fzf: it emits the pick, reads one
# candidate line (a /dev/null candidate feed fails loudly), then exits —
# leaving the producer to SIGPIPE, which under ambient pipefail used to
# discard the valid selection silently.
cat >"$tmp/bin/fzf" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

[ "${1:-}" = "--query=$FAKE_FZF_QUERY" ] || {
  printf 'unexpected fzf arguments: %s\n' "$*" >&2
  exit 2
}
printf '%s\n' "$FAKE_FZF_PICK"
IFS= read -r _ || {
  printf 'fzf received no candidates\n' >&2
  exit 2
}
SH
chmod +x "$tmp/bin/fzf"

export HOME="$tmp/home"
export PATH="$tmp/bin:$PATH"
export QQ_HOME="$tmp/qq-home"
# shellcheck source=cockpit/shell/file-navigation.bash
source "$NAVIGATION"

# The focused workspace's worktree wins over both QQ_HOME and other worktrees.
export FAKE_WORKSPACES_JSON="{\"result\":{\"workspaces\":[{\"focused\":false,\"worktree\":{\"checkout_path\":\"$tmp/proj-qq\"}},{\"focused\":true,\"worktree\":{\"checkout_path\":\"$tmp/proj-deciq\"}}]}}"
assert_equal "$tmp/proj-deciq" "$(qq_space_dir)"
assert_equal "$tmp/proj-deciq" "$(qqcd; pwd -P)"

# qqroot keeps its direct QQ_HOME behavior and clear missing-directory error.
assert_equal "$QQ_HOME" "$(qqroot; pwd -P)"
if output="$(QQ_HOME="$tmp/missing-home" qqroot 2>&1)"; then
  fail "qqroot accepted a missing QQ_HOME: $output"
fi
assert_contains "$output" "QQ_HOME does not exist: $tmp/missing-home"

# A failing Herdr call cannot contribute plausible JSON.
export FAKE_HERDR_EXIT=1
if output="$(qq_space_dir)"; then
  fail "qq_space_dir accepted output from a failing herdr: $output"
fi
assert_equal "$QQ_HOME" "$(qqcd; pwd -P)"
unset FAKE_HERDR_EXIT

# Missing focused worktrees and nonexistent checkout paths both fail.
export FAKE_WORKSPACES_JSON='{"result":{"workspaces":[{"focused":true}]}}'
if output="$(qq_space_dir)"; then
  fail "qq_space_dir succeeded without a focused worktree: $output"
fi
assert_equal "$QQ_HOME" "$(qqcd; pwd -P)"

export FAKE_WORKSPACES_JSON="{\"result\":{\"workspaces\":[{\"focused\":true,\"worktree\":{\"checkout_path\":\"$tmp/missing-project\"}}]}}"
if output="$(qq_space_dir)"; then
  fail "qq_space_dir accepted a nonexistent directory: $output"
fi

# Missing Herdr or jq independently preserves the QQ_HOME fallback.
if output="$(PATH="$tmp/no-tools-bin" qq_space_dir)"; then
  fail "qq_space_dir succeeded without herdr on PATH: $output"
fi
assert_equal "$QQ_HOME" "$(PATH="$tmp/no-tools-bin" qqcd; pwd -P)"
if output="$(PATH="$tmp/herdr-only-bin" qq_space_dir)"; then
  fail "qq_space_dir succeeded without jq on PATH: $output"
fi
assert_equal "$QQ_HOME" "$(PATH="$tmp/herdr-only-bin" qqcd; pwd -P)"

# Pattern mode refuses a missing fzf instead of silently choosing a fallback.
if output="$(PATH="$tmp/no-tools-bin" qqcd project 2>&1)"; then
  fail "qqcd accepted pattern mode without fzf: $output"
fi
assert_contains "$output" "qqcd requires fzf"

# Pattern mode passes the query through fzf and keeps a valid selection
# under this script's ambient pipefail with a streaming (early-exit)
# selector — the regression the candidate-file staging prevents.
export FAKE_FZF_QUERY=project
export FAKE_FZF_PICK="$tmp/home/picked project"
assert_equal "$FAKE_FZF_PICK" "$(qqcd "$FAKE_FZF_QUERY"; pwd -P)"

# Dispatch adapter env: the confined-delegate PI_SUBAGENT_* pair is set
# in-process by .pi/extensions/qq-subagent-env.ts (tested in
# test-qq-subagent-env.sh); the shell surface intentionally does not export
# them, so other repositories' sessions keep the vanilla dispatcher.
if env -u PI_SUBAGENT_PI_BINARY -u PI_SUBAGENT_EXTRA_AGENT_DIRS \
  bash -c 'source "$1"; [ -n "${PI_SUBAGENT_PI_BINARY:-}" ] || [ -n "${PI_SUBAGENT_EXTRA_AGENT_DIRS:-}" ]' _ "$NAVIGATION"; then
  fail "file-navigation.bash exports PI_SUBAGENT_* (that moved to .pi/extensions/qq-subagent-env.ts)"
fi

printf 'test-file-navigation: pass\n'
