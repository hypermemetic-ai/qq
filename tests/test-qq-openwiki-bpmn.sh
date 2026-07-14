#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-openwiki-bpmn"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
WRAPPER="$ROOT/bin/qq-openwiki-bpmn"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAKE_BIN="$TMP/bin"
REPO="$TMP/repo"
mkdir -p "$FAKE_BIN" "$REPO/openwiki/processes"

cat >"$FAKE_BIN/node" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
: >"$FAKE_NODE_LOG"
index=1
for argument in "$@"; do
  printf '%s' "$argument" >"$FAKE_NODE_LOG.$index"
  index=$((index + 1))
done
printf '%s' "$#" >"$FAKE_NODE_LOG.count"
SH
chmod +x "$FAKE_BIN/node"

git -C "$REPO" init -q -b main
printf '{}\n' >"$REPO/openwiki/processes/order_lifecycle.json"
printf '{}\n' >"$REPO/openwiki/processes/not-json.txt"
mkdir -p "$REPO/openwiki/processes/nested"
printf '{}\n' >"$REPO/openwiki/processes/nested/hidden.json"
printf '{}\n' >"$TMP/outside.json"
ln -s "$TMP/outside.json" "$REPO/openwiki/processes/escaped.json"

export PATH="$FAKE_BIN:$PATH"
export FAKE_NODE_LOG="$TMP/node.log"

(
  cd "$REPO"
  "$WRAPPER" openwiki/processes/order_lifecycle.json
)
[ "$(<"$FAKE_NODE_LOG.count")" = 3 ] || fail "publish invocation had the wrong argument count"
[ "$(<"$FAKE_NODE_LOG.1")" = "$ROOT/tools/bpmn-pipeline/bin/qq-bpmn.mjs" ] \
  || fail "wrapper did not resolve the bundled pipeline"
[ "$(<"$FAKE_NODE_LOG.2")" = wiki ] || fail "wrapper did not select wiki publishing"
[ "$(<"$FAKE_NODE_LOG.3")" = "$REPO/openwiki/processes/order_lifecycle.json" ] \
  || fail "wrapper did not canonicalize the process spec"

(
  cd "$REPO"
  "$WRAPPER" --check "$REPO/openwiki/processes/order_lifecycle.json"
)
[ "$(<"$FAKE_NODE_LOG.count")" = 4 ] || fail "check invocation had the wrong argument count"
[ "$(<"$FAKE_NODE_LOG.4")" = --check ] || fail "wrapper did not preserve check mode"

(
  cd "$REPO"
  PATH=/usr/bin:/bin QQ_NODE_BIN="$FAKE_BIN/node" \
    "$WRAPPER" openwiki/processes/order_lifecycle.json
)
[ "$(<"$FAKE_NODE_LOG.2")" = wiki ] \
  || fail "absolute inherited Node path did not survive a restricted PATH"

if (
  cd "$REPO"
  QQ_NODE_BIN=node "$WRAPPER" openwiki/processes/order_lifecycle.json \
    >"$TMP/relative-node.out" 2>"$TMP/relative-node.err"
); then
  fail "relative inherited Node path was accepted"
fi
grep -q 'QQ_NODE_BIN must be an absolute executable file' "$TMP/relative-node.err"

for rejected in \
  openwiki/processes/nested/hidden.json \
  openwiki/processes/escaped.json \
  openwiki/processes/not-json.txt
do
  if (cd "$REPO" && "$WRAPPER" "$rejected" >"$TMP/rejected.out" 2>"$TMP/rejected.err"); then
    fail "unsafe process spec was accepted: $rejected"
  fi
done

if (cd "$TMP" && "$WRAPPER" "$REPO/openwiki/processes/order_lifecycle.json" >"$TMP/outside.out" 2>"$TMP/outside.err"); then
  fail "process spec was accepted outside its owning Git worktree"
fi
grep -q 'not inside a Git worktree' "$TMP/outside.err"

printf 'PASS: qq-openwiki BPMN wrapper\n'
