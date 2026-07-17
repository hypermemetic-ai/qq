#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-file-navigation"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
NAVIGATION="$(cd "$TESTS_DIR/.." && pwd -P)/cockpit/shell/file-navigation.bash"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin" "$tmp/no-herdr-bin" "$tmp/qq-home"
mkdir -p "$tmp/proj-deciq" "$tmp/proj-qq"

cat >"$tmp/bin/herdr" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-} ${2:-}" in
  "workspace list")
    printf '%s\n' "$FAKE_WORKSPACES_JSON"
    ;;
  *)
    printf 'unexpected fake herdr command: %s\n' "$*" >&2
    exit 2
    ;;
esac
SH
chmod +x "$tmp/bin/herdr"

export PATH="$tmp/bin:$PATH"
export QQ_HOME="$tmp/qq-home"
# shellcheck source=cockpit/shell/file-navigation.bash
source "$NAVIGATION"

function y() {
    printf '%s\n' "${1:-}"
}

function br() {
    printf '%s\n' "${1:-}"
}

# The focused workspace's worktree wins over both QQ_HOME and other worktrees.
export FAKE_WORKSPACES_JSON="{\"result\":{\"workspaces\":[{\"focused\":false,\"label\":\"qq\",\"worktree\":{\"checkout_path\":\"$tmp/proj-qq\"}},{\"focused\":true,\"label\":\"deciq\",\"worktree\":{\"checkout_path\":\"$tmp/proj-deciq\"}}]}}"
assert_equal "$tmp/proj-deciq" "$(qq_space_dir)"
assert_equal "$tmp/proj-deciq" "$(qqy)"
assert_equal "$tmp/proj-deciq" "$(qqbr)"

# A focused workspace without a worktree falls back to QQ_HOME.
export FAKE_WORKSPACES_JSON='{"result":{"workspaces":[{"focused":true,"label":"deciq-logic"}]}}'
if output="$(qq_space_dir)"; then
  fail "qq_space_dir succeeded without a focused worktree: $output"
fi
assert_equal "$QQ_HOME" "$(qqy)"

# A focused worktree path must name an existing directory.
export FAKE_WORKSPACES_JSON="{\"result\":{\"workspaces\":[{\"focused\":true,\"worktree\":{\"checkout_path\":\"$tmp/missing-project\"}}]}}"
if output="$(qq_space_dir)"; then
  fail "qq_space_dir accepted a nonexistent directory: $output"
fi
assert_equal "$QQ_HOME" "$(qqy)"

# Outside Herdr, file navigation retains the QQ_HOME fallback.
if output="$(PATH="$tmp/no-herdr-bin" qq_space_dir)"; then
  fail "qq_space_dir succeeded without herdr on PATH: $output"
fi
assert_equal "$QQ_HOME" "$(PATH="$tmp/no-herdr-bin" qqy)"

printf 'test-file-navigation: pass\n'
