#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
ACTIVATOR="$ROOT/bin/qq-openwiki-activate"
USERSCRIPT="$ROOT/browser/openwiki-merge-activator.user.js"
INSTALLER="$ROOT/bin/install.sh"
REAL_GIT="$(command -v git)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected '$needle' in: $haystack"
}

make_repository() {
  local path="$1"
  local slug="$2"
  local linked="$3"

  mkdir -p "$path"
  "$REAL_GIT" -C "$path" init -q -b main
  "$REAL_GIT" -C "$path" config user.email test@example.com
  "$REAL_GIT" -C "$path" config user.name Test
  printf '%s\n' "$slug" >"$path/README.md"
  if [ "$linked" = true ]; then
    ln -s "$ROOT/AGENTS.md" "$path/AGENTS.md"
  else
    cp "$ROOT/AGENTS.md" "$path/AGENTS.md"
  fi
  "$REAL_GIT" -C "$path" add README.md AGENTS.md
  "$REAL_GIT" -C "$path" commit -q -m initial
  "$REAL_GIT" -C "$path" remote add origin "git@github.com:$slug.git"
}

make_openwiki_worktree() {
  local repository="$1"
  local path="$2"
  "$REAL_GIT" -C "$repository" worktree add -q -b openwiki/update "$path"
}

HOME_DIR="$TMP/home"
PROJECTS="$TMP/projects"
FAKE_BIN="$TMP/fake-bin"
mkdir -p "$HOME_DIR" "$PROJECTS" "$FAKE_BIN"

# QQ_PROJECT_ROOTS names search containers, not candidate repositories. A Git
# marker on the container must not hide valid descendant checkouts.
mkdir -p "$PROJECTS/.git"

make_repository "$PROJECTS/widget" "Acme/widget" true
make_openwiki_worktree "$PROJECTS/widget" "$TMP/worktrees/widget-openwiki"
make_repository "$PROJECTS/project" "other/project" true
"$REAL_GIT" -C "$PROJECTS/project" remote set-url origin https://github.com/other/project.git
make_openwiki_worktree "$PROJECTS/project" "$TMP/worktrees/project-openwiki"
make_repository "$PROJECTS/unlinked" "acme/unlinked" false

cat >"$FAKE_BIN/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_GH_LOG"
if [ "$1 $2" = "api user" ]; then
  printf '%s\n' operator
  exit 0
fi
if [ "$1 $2" != "pr view" ]; then
  exit 70
fi
state=MERGED
base=main
head=feature/useful-change
operator=operator
merged_at=2026-07-13T03:00:00Z
case "${FAKE_GH_SCENARIO:-merged}" in
  unmerged) state=OPEN; merged_at= ;;
  wrong_base) base=release ;;
  recursion) head=openwiki/update ;;
  wrong_operator) operator=someone-else ;;
esac
printf '{"state":"%s","mergedAt":"%s","mergeCommit":{"oid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"baseRefName":"%s","headRefName":"%s","url":"%s","mergedBy":{"login":"%s"}}\n' \
  "$state" "$merged_at" "$base" "$head" "$3" "$operator"
EOF

cat >"$FAKE_BIN/herdr" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_HERDR_LOG"
case "$1 $2" in
  "worktree open")
    printf '%s\n' '{"result":{"workspace":{"workspace_id":"w-openwiki"}}}'
    ;;
  "agent get")
    if [ "${FAKE_HERDR_MODE:-launch}" = wake ]; then
      printf '%s\n' '{"result":{"agent":{"workspace_id":"w-openwiki","pane_id":"term-maintainer","agent_session":{"agent":"codex"}}}}'
    elif [ "${FAKE_HERDR_MODE:-launch}" = wrong_agent ]; then
      printf '%s\n' '{"result":{"agent":{"workspace_id":"w-openwiki","pane_id":"term-maintainer","agent_session":{"agent":"claude"}}}}'
    else
      printf '%s\n' '{"error":{"code":"agent_not_found","message":"missing"}}'
      exit 1
    fi
    ;;
  "agent start")
    [ "${FAKE_HERDR_MODE:-launch}" != fail_start ] || exit 70
    ;;
  "pane run")
    ;;
  *)
    exit 70
    ;;
esac
EOF

cat >"$FAKE_BIN/codex" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$FAKE_BIN/gh" "$FAKE_BIN/herdr" "$FAKE_BIN/codex" "$ACTIVATOR"

export HOME="$HOME_DIR"
export QQ_PROJECT_ROOTS="$PROJECTS"
export QQ_GIT_BIN="$REAL_GIT"
export QQ_GH_BIN="$FAKE_BIN/gh"
export QQ_HERDR_BIN="$FAKE_BIN/herdr"
export QQ_CODEX_BIN="$FAKE_BIN/codex"
export QQ_OPENWIKI_ACTIVATE_ATTEMPTS=1
export QQ_OPENWIKI_ACTIVATE_INTERVAL=0
export FAKE_GH_LOG="$TMP/gh.log"
export FAKE_HERDR_LOG="$TMP/herdr.log"
: >"$FAKE_GH_LOG"
: >"$FAKE_HERDR_LOG"

if [ -x /home/linuxbrew/.linuxbrew/bin/herdr ] && [ -x /home/linuxbrew/.linuxbrew/bin/codex ]; then
  /usr/bin/python3 - "$ACTIVATOR" <<'PY'
import os
import runpy
import sys

namespace = runpy.run_path(sys.argv[1])
os.environ["PATH"] = "/usr/bin:/bin"
os.environ.pop("QQ_HERDR_BIN", None)
os.environ.pop("QQ_CODEX_BIN", None)
assert namespace["executable"]("QQ_HERDR_BIN", "herdr") == "/home/linuxbrew/.linuxbrew/bin/herdr"
codex = namespace["executable"]("QQ_CODEX_BIN", "codex")
assert codex == "/home/linuxbrew/.linuxbrew/bin/codex"
assert os.environ["PATH"].split(os.pathsep)[0] == "/home/linuxbrew/.linuxbrew/bin"
completed = namespace["subprocess"].run([codex, "--version"], capture_output=True, text=True)
assert completed.returncode == 0, completed.stderr
PY
fi

WIDGET_URL=https://github.com/acme/widget/pull/7
WIDGET_ACTIVATION='qq-openwiki://activate?pr=https%3A%2F%2Fgithub.com%2Facme%2Fwidget%2Fpull%2F7'

export QQ_OPENWIKI_ACTIVATE_STATE_DIR="$TMP/state-overlapping-roots"
export QQ_PROJECT_ROOTS="$PROJECTS:$PROJECTS/widget"
gh_before="$(wc -l <"$FAKE_GH_LOG")"
output="$($ACTIVATOR "$WIDGET_URL")"
assert_contains "$output" '"status": "ignored"'
gh_after="$(wc -l <"$FAKE_GH_LOG")"
[ "$gh_before" -eq "$gh_after" ] || fail "configured container reached GitHub verification"
export QQ_PROJECT_ROOTS="$PROJECTS"

export QQ_OPENWIKI_ACTIVATE_STATE_DIR="$TMP/state-launch"
output="$($ACTIVATOR "$WIDGET_ACTIVATION")"
assert_contains "$output" '"status": "dispatched"'
assert_contains "$output" '"action": "launched"'
assert_contains "$(<"$FAKE_HERDR_LOG")" 'agent start openwiki-acme-widget-'
assert_contains "$(<"$FAKE_HERDR_LOG")" 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

before="$(wc -l <"$FAKE_HERDR_LOG")"
output="$($ACTIVATOR https://github.com/ACME/WIDGET/pull/7)"
assert_contains "$output" '"reason": "already-dispatched"'
after="$(wc -l <"$FAKE_HERDR_LOG")"
[ "$before" -eq "$after" ] || fail "deduplicated activation dispatched again"

export QQ_OPENWIKI_ACTIVATE_STATE_DIR="$TMP/state-wake"
export FAKE_HERDR_MODE=wake
output="$($ACTIVATOR "$WIDGET_URL")"
assert_contains "$output" '"action": "woke"'
assert_contains "$(<"$FAKE_HERDR_LOG")" 'pane run term-maintainer'
unset FAKE_HERDR_MODE

export QQ_OPENWIKI_ACTIVATE_STATE_DIR="$TMP/state-wrong-agent"
export FAKE_HERDR_MODE=wrong_agent
if "$ACTIVATOR" "$WIDGET_URL" >"$TMP/wrong-agent.out" 2>"$TMP/wrong-agent.err"; then
  fail "non-Codex named agent was accepted"
fi
[ ! -e "$TMP/state-wrong-agent/acme--widget/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json" ] || fail "rejected agent poisoned deduplication state"
unset FAKE_HERDR_MODE

export QQ_OPENWIKI_ACTIVATE_STATE_DIR="$TMP/state-generic"
output="$($ACTIVATOR https://github.com/other/project/pull/19)"
assert_contains "$output" '"repository": "other/project"'
agent_names="$(awk '$1 == "agent" && $2 == "start" {print $3}' "$FAKE_HERDR_LOG" | sort -u)"
[ "$(wc -l <<<"$agent_names")" -eq 2 ] || fail "Repositories did not receive unique Herdr agent names"

export QQ_OPENWIKI_ACTIVATE_STATE_DIR="$TMP/state-ambiguous"
export FAKE_HERDR_MODE=fail_start
if "$ACTIVATOR" "$WIDGET_URL" >"$TMP/ambiguous.out" 2>"$TMP/ambiguous.err"; then
  fail "failed Herdr dispatch reported success"
fi
ambiguous_before="$(wc -l <"$FAKE_HERDR_LOG")"
output="$($ACTIVATOR "$WIDGET_URL")"
assert_contains "$output" '"reason": "already-dispatched"'
ambiguous_after="$(wc -l <"$FAKE_HERDR_LOG")"
[ "$ambiguous_before" -eq "$ambiguous_after" ] || fail "ambiguous dispatch was repeated"
unset FAKE_HERDR_MODE

for scenario in unmerged wrong_base recursion wrong_operator; do
  export FAKE_GH_SCENARIO="$scenario"
  export QQ_OPENWIKI_ACTIVATE_STATE_DIR="$TMP/state-$scenario"
  output="$($ACTIVATOR "$WIDGET_URL")"
  assert_contains "$output" '"status": "ignored"'
done
unset FAKE_GH_SCENARIO

export QQ_OPENWIKI_ACTIVATE_STATE_DIR="$TMP/state-unlinked"
gh_before="$(wc -l <"$FAKE_GH_LOG")"
output="$($ACTIVATOR https://github.com/acme/unlinked/pull/3)"
assert_contains "$output" '"status": "ignored"'
gh_after="$(wc -l <"$FAKE_GH_LOG")"
[ "$gh_before" -eq "$gh_after" ] || fail "unlinked Repository reached GitHub verification"

if "$ACTIVATOR" 'qq-openwiki://activate?repo=acme%2Fwidget' >"$TMP/malformed.out" 2>"$TMP/malformed.err"; then
  fail "malformed activation was accepted"
fi
assert_contains "$(<"$TMP/malformed.err")" 'exactly one pr parameter'

node - "$USERSCRIPT" <<'NODE'
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(process.argv[2], "utf8");
let clickListener;
let assigned = null;
let timeout = null;
const sandbox = {
  URL,
  document: {
    addEventListener(name, listener, capture) {
      if (name !== "click" || capture !== true) throw new Error("unexpected listener");
      clickListener = listener;
    },
  },
  location: {
    href: "https://github.com/SomeOrg/some-repo/pull/42/files?diff=split",
    assign(value) { assigned = value; },
  },
  setTimeout(callback, milliseconds) {
    timeout = milliseconds;
    callback();
  },
};
vm.runInNewContext(source, sandbox);
if (typeof clickListener !== "function") throw new Error("userscript did not register");
function click(label) {
  clickListener({target: {closest: selector => selector === "button" ? {textContent: label} : null}});
}
click("Merge pull request");
if (assigned !== null) throw new Error("initial merge action activated handler");
click("Confirm squash and merge");
const expected = "qq-openwiki://activate?pr=https%3A%2F%2Fgithub.com%2FSomeOrg%2Fsome-repo%2Fpull%2F42";
if (assigned !== expected) throw new Error(`unexpected activation: ${assigned}`);
if (timeout !== 750) throw new Error(`unexpected delay: ${timeout}`);
assigned = null;
click("Cancel");
if (assigned !== null) throw new Error("unrelated button activated handler");
NODE

INSTALL_HOME="$TMP/install-home"
INSTALL_DATA="$INSTALL_HOME/custom-data"
INSTALL_BIN="$TMP/install-bin"
INSTALL_LOG="$TMP/install.log"
mkdir -p "$INSTALL_HOME/.config" "$INSTALL_BIN"
printf '%s\n' 'keep=this-entry' >"$INSTALL_HOME/.config/mimeapps.list"
cat >"$INSTALL_BIN/xdg-mime" <<'EOF'
#!/usr/bin/env bash
printf 'xdg-mime %s\n' "$*" >>"$INSTALL_LOG"
EOF
cat >"$INSTALL_BIN/update-desktop-database" <<'EOF'
#!/usr/bin/env bash
printf 'update-desktop-database %s\n' "$*" >>"$INSTALL_LOG"
EOF
cat >"$INSTALL_BIN/npm" <<'EOF'
#!/usr/bin/env bash
printf 'npm %s\n' "$*" >>"$INSTALL_LOG"
EOF
chmod +x "$INSTALL_BIN/xdg-mime" "$INSTALL_BIN/update-desktop-database" "$INSTALL_BIN/npm"
export INSTALL_LOG
: >"$INSTALL_LOG"
HOME="$INSTALL_HOME" XDG_DATA_HOME="$INSTALL_DATA" PATH="$INSTALL_BIN:$PATH" bash "$INSTALLER" >"$TMP/install.out"
HOME="$INSTALL_HOME" XDG_DATA_HOME="$INSTALL_DATA" PATH="$INSTALL_BIN:$PATH" bash "$INSTALLER" >"$TMP/install-repeat.out"
desktop="$INSTALL_DATA/applications/qq-openwiki-activate.desktop"
[ -f "$desktop" ] || fail "installer did not create desktop entry"
desktop-file-validate "$desktop"
assert_contains "$(<"$desktop")" "Exec=\"$INSTALL_HOME/.local/bin/qq-openwiki-activate\" %u"
assert_contains "$(<"$desktop")" 'MimeType=x-scheme-handler/qq-openwiki;'
[ -L "$INSTALL_DATA/qq/openwiki-merge-activator.user.js" ] || fail "userscript link missing"
[ -L "$INSTALL_HOME/.local/bin/qq-openwiki-bpmn" ] || fail "OpenWiki BPMN command link missing"
[ ! -e "$INSTALL_HOME/.local/share/applications/qq-openwiki-activate.desktop" ] || fail "installer ignored XDG_DATA_HOME"
[ "$(<"$INSTALL_HOME/.config/mimeapps.list")" = 'keep=this-entry' ] || fail "unrelated MIME state changed"
assert_contains "$(<"$INSTALL_LOG")" 'xdg-mime default qq-openwiki-activate.desktop x-scheme-handler/qq-openwiki'
assert_contains "$(<"$INSTALL_LOG")" "npm ci --prefix $ROOT/skills/bpmn-plans/pipeline --no-audit --no-fund"

UNMANAGED_HOME="$TMP/unmanaged-home"
mkdir -p "$UNMANAGED_HOME/.local/share/applications"
printf '%s\n' unmanaged >"$UNMANAGED_HOME/.local/share/applications/qq-openwiki-activate.desktop"
if HOME="$UNMANAGED_HOME" PATH="$INSTALL_BIN:$PATH" bash "$INSTALLER" >"$TMP/unmanaged.out" 2>"$TMP/unmanaged.err"; then
  fail "installer replaced unmanaged desktop entry"
fi
[ "$(<"$UNMANAGED_HOME/.local/share/applications/qq-openwiki-activate.desktop")" = unmanaged ] || fail "unmanaged desktop entry changed"

printf 'PASS: qq-openwiki activation\n'
