#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d "$HOME/qq-openwiki-main-test.XXXXXX")"
cleanup() {
  chmod -R u+w -- "$TMP" 2>/dev/null || true
  rm -rf -- "$TMP"
}
trap cleanup EXIT

wait_for_file() {
  local path="$1"
  for _ in $(seq 1 500); do
    [[ -e "$path" ]] && return 0
    sleep 0.01
  done
  echo "timed out waiting for $path" >&2
  return 1
}

REPO="$TMP/repo"
REMOTE="$TMP/remote.git"
DELEGATE="$TMP/delegate"
FAKE="$TMP/fake-openwiki"
mkdir -p -- "$REPO/.github/workflows"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.name qq-test
git -C "$REPO" config user.email qq-test.invalid
git -C "$REPO" config commit.gpgsign false
printf 'source\n' >"$REPO/source.txt"
printf 'operator instructions\n' >"$REPO/AGENTS.md"
printf 'operator claude\n' >"$REPO/CLAUDE.md"
printf 'operator workflow\n' >"$REPO/.github/workflows/openwiki-update.yml"
git -C "$REPO" add .
git -C "$REPO" commit -q -m initial
git init -q --bare "$REMOTE"
git -C "$REPO" remote add origin "$REMOTE"
git -C "$REPO" push -q -u origin main
INITIAL="$(git -C "$REPO" rev-parse HEAD)"
INITIAL_TREE="$(git -C "$REPO" rev-parse 'HEAD^{tree}')"
git -C "$REPO" worktree add -q -b qq/test-delegate "$DELEGATE" main
COMMON_DIR="$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)"

cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -z "${QQ_OPENWIKI_MAIN_ROOT+x}" ]]
[[ "$PWD" != "$QQ_TEST_MAIN" ]]
[[ "$(git rev-parse --git-dir)" == .git ]]
[[ -z "$(git remote)" ]]
[[ "$(git worktree list --porcelain | grep -c '^worktree ')" == 1 ]]
[[ -z "$(git status --short --untracked-files=all)" ]]
[[ "$(<source.txt)" == source ]]
printf '%s\n' "$PWD" >"$QQ_TEST_CLONE_PATH"
printf '%s\n' "$*" >"$QQ_TEST_ARGS"
printf 'writer source change\n' >source.txt
printf 'writer agents\n' >AGENTS.md
printf 'writer claude\n' >CLAUDE.md
mkdir -p .github/workflows openwiki/guides
printf 'writer workflow\n' >.github/workflows/openwiki-update.yml
printf 'version one\n' >openwiki/index.md
printf 'start here\n' >openwiki/guides/start.md
printf '{"status":"complete"}\n' >openwiki/.last-update.json
git add -A
touch "$QQ_TEST_READY"
while [[ ! -e "$QQ_TEST_RELEASE" ]]; do sleep 0.01; done
touch "$QQ_TEST_GENERATED"
SH
chmod +x "$FAKE"

# Generation runs in an independent clone. The live checkout and linked
# delegate stay usable, and the qq land lock is held only for merge/push.
READY="$TMP/ready"
RELEASE="$TMP/release"
GENERATED="$TMP/generated"
CLONE_PATH="$TMP/clone-path"
QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_REPO_KEY=qq \
QQ_OPENWIKI_BIN="$FAKE" \
QQ_TEST_MAIN="$REPO" \
QQ_TEST_ARGS="$TMP/args" \
QQ_TEST_CLONE_PATH="$CLONE_PATH" \
QQ_TEST_READY="$READY" \
QQ_TEST_RELEASE="$RELEASE" \
QQ_TEST_GENERATED="$GENERATED" \
  "$ROOT/bin/qq-openwiki-refresh" >"$TMP/first.out" 2>"$TMP/first.err" &
refresh_pid=$!
wait_for_file "$READY"
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$INITIAL" ]]
[[ "$(git -C "$REPO" rev-parse 'HEAD^{tree}')" == "$INITIAL_TREE" ]]
[[ -z "$(git -C "$REPO" status --porcelain --untracked-files=all)" ]]
[[ "$(<"$REPO/AGENTS.md")" == "operator instructions" ]]
[[ "$(<"$REPO/CLAUDE.md")" == "operator claude" ]]
[[ "$(<"$REPO/.github/workflows/openwiki-update.yml")" == "operator workflow" ]]
[[ "$(git -C "$REPO" worktree list --porcelain | grep -c '^worktree ')" == 2 ]]
printf 'delegate still working\n' >"$DELEGATE/inflight.txt"
[[ "$(<"$DELEGATE/inflight.txt")" == "delegate still working" ]]
exec 8>"$COMMON_DIR/qq-land.lock"
flock -n 8
touch "$RELEASE"
wait_for_file "$GENERATED"
sleep 0.05
kill -0 "$refresh_pid"
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$INITIAL" ]]
flock -u 8
wait "$refresh_pid"

FIRST_MERGE="$(git -C "$REPO" rev-parse HEAD)"
FIRST_WRITER="$(git -C "$REPO" rev-parse HEAD^2)"
[[ "$FIRST_MERGE" != "$INITIAL" ]]
[[ "$(git -C "$REPO" rev-parse HEAD^1)" == "$INITIAL" ]]
[[ "$(git -C "$REPO" rev-parse "$FIRST_WRITER^")" == "$INITIAL" ]]
[[ "$(git -C "$REPO" rev-list --parents -1 HEAD | wc -w)" == 3 ]]
[[ "$(git -C "$REPO" rev-list --parents -1 HEAD^2 | wc -w)" == 2 ]]
printf '%s\n' openwiki/.last-update.json openwiki/guides/start.md openwiki/index.md >"$TMP/expected-writer-paths"
git -C "$REPO" diff-tree --no-commit-id --name-only -r HEAD^2^ HEAD^2 >"$TMP/writer-paths"
cmp -s "$TMP/expected-writer-paths" "$TMP/writer-paths"
[[ "$(git -C "$REPO" show HEAD^2:AGENTS.md)" == "operator instructions" ]]
[[ "$(git -C "$REPO" show HEAD^2:CLAUDE.md)" == "operator claude" ]]
[[ "$(git -C "$REPO" show HEAD^2:.github/workflows/openwiki-update.yml)" == "operator workflow" ]]
[[ "$(git -C "$REPO" show HEAD^2:source.txt)" == source ]]
[[ "$(<"$REPO/openwiki/index.md")" == "version one" ]]
[[ "$(<"$REPO/openwiki/guides/start.md")" == "start here" ]]
[[ "$(stat -c %a "$REPO/openwiki")" == 555 ]]
[[ "$(stat -c %a "$REPO/openwiki/guides")" == 555 ]]
[[ "$(stat -c %a "$REPO/openwiki/index.md")" == 444 ]]
[[ "$(stat -c %a "$REPO/openwiki/guides/start.md")" == 444 ]]
[[ "$(<"$REPO/AGENTS.md")" == "operator instructions" ]]
[[ "$(<"$REPO/CLAUDE.md")" == "operator claude" ]]
[[ "$(<"$REPO/.github/workflows/openwiki-update.yml")" == "operator workflow" ]]
[[ "$(<"$REPO/source.txt")" == source ]]
[[ -z "$(git -C "$REPO" status --porcelain --untracked-files=all)" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$FIRST_MERGE" ]]
[[ "$(git -C "$REPO" worktree list --porcelain | grep -c '^worktree ')" == 2 ]]
[[ "$(<"$DELEGATE/inflight.txt")" == "delegate still working" ]]
[[ ! -e "$(<"$CLONE_PATH")" ]]
[[ "$(<"$TMP/args")" == "code --init --print Keep this wiki short and practical." ]]
if git -C "$REPO" show-ref --verify --quiet refs/heads/openwiki \
  || git --git-dir="$REMOTE" show-ref --verify --quiet refs/heads/openwiki; then
  echo "refresh created an orphan OpenWiki branch" >&2
  exit 1
fi

# Identical generated output is a complete no-op, even when upstream rewrites
# all of its root setup files inside the clone.
cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -z "${QQ_OPENWIKI_MAIN_ROOT+x}" ]]
[[ -d .git ]]
[[ -z "$(git remote)" ]]
[[ "$(<openwiki/index.md)" == "version one" ]]
printf '%s\n' "$*" >"$QQ_TEST_ARGS"
printf 'again\n' >AGENTS.md
printf 'again\n' >CLAUDE.md
mkdir -p .github/workflows
printf 'again\n' >.github/workflows/openwiki-update.yml
SH
chmod +x "$FAKE"
chmod 0755 "$REPO/openwiki" "$REPO/openwiki/guides"
chmod 0644 "$REPO/openwiki/.last-update.json" "$REPO/openwiki/index.md" "$REPO/openwiki/guides/start.md"
QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_REPO_KEY=qq \
QQ_OPENWIKI_BIN="$FAKE" \
QQ_TEST_ARGS="$TMP/args" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null
[[ "$(<"$TMP/args")" == "code --update --print Keep this wiki short and practical." ]]
[[ "$(stat -c %a "$REPO/openwiki")" == 555 ]]
[[ "$(stat -c %a "$REPO/openwiki/guides")" == 555 ]]
[[ "$(stat -c %a "$REPO/openwiki/index.md")" == 444 ]]
[[ "$(stat -c %a "$REPO/openwiki/guides/start.md")" == 444 ]]
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$FIRST_MERGE" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$FIRST_MERGE" ]]
[[ "$(<"$REPO/AGENTS.md")" == "operator instructions" ]]

# A dirty main is rejected before generation, without stashing or restoring a
# pre-existing operator edit.
printf 'pre-existing dirty operator agents\n' >"$REPO/AGENTS.md"
printf 'untracked operator file\n' >"$REPO/operator.txt"
DIRTY_STATUS="$(git -C "$REPO" status --porcelain --untracked-files=all)"
rm -f "$TMP/ran"
cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
touch "$QQ_TEST_RAN"
SH
chmod +x "$FAKE"
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  QQ_OPENWIKI_REPO_KEY=qq \
  QQ_OPENWIKI_BIN="$FAKE" \
  QQ_TEST_RAN="$TMP/ran" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null 2>&1; then
  echo "dirty main unexpectedly published" >&2
  exit 1
fi
[[ ! -e "$TMP/ran" ]]
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$FIRST_MERGE" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$FIRST_MERGE" ]]
[[ "$(git -C "$REPO" status --porcelain --untracked-files=all)" == "$DIRTY_STATUS" ]]
[[ "$(<"$REPO/AGENTS.md")" == "pre-existing dirty operator agents" ]]
[[ "$(<"$REPO/operator.txt")" == "untracked operator file" ]]
git -C "$REPO" restore -- AGENTS.md
rm "$REPO/operator.txt"

# An operator process that edits live main during generation wins. Publication
# notices the dirty checkout and leaves both the edit and refs untouched.
rm -f "$READY" "$RELEASE" "$CLONE_PATH"
cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'clone rewrite\n' >AGENTS.md
printf 'clone rewrite\n' >CLAUDE.md
mkdir -p .github/workflows
printf 'clone rewrite\n' >.github/workflows/openwiki-update.yml
printf 'version two\n' >openwiki/index.md
printf '%s\n' "$PWD" >"$QQ_TEST_CLONE_PATH"
touch "$QQ_TEST_READY"
while [[ ! -e "$QQ_TEST_RELEASE" ]]; do sleep 0.01; done
SH
chmod +x "$FAKE"
QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_REPO_KEY=qq \
QQ_OPENWIKI_BIN="$FAKE" \
QQ_TEST_CLONE_PATH="$CLONE_PATH" \
QQ_TEST_READY="$READY" \
QQ_TEST_RELEASE="$RELEASE" \
  "$ROOT/bin/qq-openwiki-refresh" >"$TMP/midrun.out" 2>"$TMP/midrun.err" &
refresh_pid=$!
wait_for_file "$READY"
(printf 'mid-run operator agents\n' >"$REPO/AGENTS.md") &
operator_pid=$!
wait "$operator_pid"
touch "$RELEASE"
if wait "$refresh_pid"; then
  echo "mid-run dirty main unexpectedly published" >&2
  exit 1
fi
[[ "$(<"$REPO/AGENTS.md")" == "mid-run operator agents" ]]
[[ "$(<"$REPO/openwiki/index.md")" == "version one" ]]
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$FIRST_MERGE" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$FIRST_MERGE" ]]
[[ ! -e "$(<"$CLONE_PATH")" ]]
git -C "$REPO" restore -- AGENTS.md

# The publisher independently rejects a writer commit containing any path
# outside openwiki/** before it can mutate main.
MALICIOUS="$TMP/malicious"
git clone -q --local --single-branch --branch main "$REPO" "$MALICIOUS"
git -C "$MALICIOUS" config user.name qq-test
git -C "$MALICIOUS" config user.email qq-test.invalid
printf 'malicious source\n' >"$MALICIOUS/source.txt"
printf 'malicious wiki\n' >"$MALICIOUS/openwiki/index.md"
git -C "$MALICIOUS" add source.txt openwiki/index.md
git -C "$MALICIOUS" commit -q -m malicious
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  "$ROOT/bin/qq-openwiki-publish" qq "$MALICIOUS" HEAD >/dev/null 2>&1; then
  echo "publisher accepted a non-OpenWiki writer path" >&2
  exit 1
fi
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$FIRST_MERGE" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$FIRST_MERGE" ]]

# Writer files must retain Git's non-executable mode so freezing them does not
# create a mode-only dirty diff on filesystems that honor core.fileMode.
EXECUTABLE_WRITER="$TMP/executable-writer"
git clone -q --local --single-branch --branch main "$REPO" "$EXECUTABLE_WRITER"
git -C "$EXECUTABLE_WRITER" config user.name qq-test
git -C "$EXECUTABLE_WRITER" config user.email qq-test.invalid
printf 'executable writer\n' >"$EXECUTABLE_WRITER/openwiki/index.md"
chmod 0755 "$EXECUTABLE_WRITER/openwiki/index.md"
git -C "$EXECUTABLE_WRITER" add openwiki/index.md
git -C "$EXECUTABLE_WRITER" commit -q -m "Executable writer"
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  "$ROOT/bin/qq-openwiki-publish" qq "$EXECUTABLE_WRITER" HEAD >/dev/null 2>&1; then
  echo "publisher accepted an executable generated file" >&2
  exit 1
fi
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$FIRST_MERGE" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$FIRST_MERGE" ]]

# Once the publisher thaws under the landing lock, a racing live edit can make
# merge fail. Cleanup must preserve that edit while restoring read-only modes.
CLEANUP_WRITER="$TMP/cleanup-writer"
MATERIALIZE_WRAPPER="$TMP/materialize-wrapper"
MATERIALIZE_LOG="$TMP/materialize.log"
git clone -q --local --single-branch --branch main "$REPO" "$CLEANUP_WRITER"
git -C "$CLEANUP_WRITER" config user.name qq-test
git -C "$CLEANUP_WRITER" config user.email qq-test.invalid
printf 'cleanup writer\n' >"$CLEANUP_WRITER/openwiki/index.md"
git -C "$CLEANUP_WRITER" add openwiki/index.md
git -C "$CLEANUP_WRITER" commit -q -m "Cleanup probe"
cat >"$MATERIALIZE_WRAPPER" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" >>"$QQ_TEST_MATERIALIZE_LOG"
if [[ "$1" == thaw ]] && flock -n "$QQ_TEST_LAND_LOCK" true; then
  echo "publisher thawed outside the landing lock" >&2
  exit 1
fi
"$QQ_TEST_REAL_MATERIALIZE" "$@"
if [[ "$1" == thaw ]]; then
  printf 'live race\n' >"$2/openwiki/index.md"
fi
SH
chmod +x "$MATERIALIZE_WRAPPER"
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  QQ_OPENWIKI_MATERIALIZE_BIN="$MATERIALIZE_WRAPPER" \
  QQ_TEST_MATERIALIZE_LOG="$MATERIALIZE_LOG" \
  QQ_TEST_REAL_MATERIALIZE="$ROOT/bin/qq-openwiki-materialize" \
  QQ_TEST_LAND_LOCK="$COMMON_DIR/qq-land.lock" \
  "$ROOT/bin/qq-openwiki-publish" qq "$CLEANUP_WRITER" HEAD >/dev/null 2>&1; then
  echo "publisher ignored a racing edit after thaw" >&2
  exit 1
fi
printf '%s\n' thaw freeze >"$TMP/expected-materialize.log"
cmp -s "$TMP/expected-materialize.log" "$MATERIALIZE_LOG"
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$FIRST_MERGE" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$FIRST_MERGE" ]]
[[ "$(<"$REPO/openwiki/index.md")" == "live race" ]]
[[ "$(stat -c %a "$REPO/openwiki")" == 555 ]]
[[ "$(stat -c %a "$REPO/openwiki/index.md")" == 444 ]]
"$ROOT/bin/qq-openwiki-materialize" thaw "$REPO"
git -C "$REPO" restore -- openwiki/index.md
"$ROOT/bin/qq-openwiki-materialize" freeze "$REPO"
[[ -z "$(git -C "$REPO" status --porcelain --untracked-files=all)" ]]

# A clean main advance may happen while generation runs, but a conflicting
# writer is rejected before the live repository imports or merges it.
rm -f "$READY" "$RELEASE"
cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'writer conflict\n' >openwiki/index.md
touch "$QQ_TEST_READY"
while [[ ! -e "$QQ_TEST_RELEASE" ]]; do sleep 0.01; done
SH
chmod +x "$FAKE"
QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_REPO_KEY=qq \
QQ_OPENWIKI_BIN="$FAKE" \
QQ_TEST_READY="$READY" \
QQ_TEST_RELEASE="$RELEASE" \
  "$ROOT/bin/qq-openwiki-refresh" >"$TMP/conflict.out" 2>"$TMP/conflict.err" &
refresh_pid=$!
wait_for_file "$READY"
"$ROOT/bin/qq-openwiki-materialize" thaw "$REPO"
printf 'main conflict\n' >"$REPO/openwiki/index.md"
git -C "$REPO" add openwiki/index.md
git -C "$REPO" commit -q -m "Competing main update"
"$ROOT/bin/qq-openwiki-materialize" freeze "$REPO"
CONFLICT_MAIN="$(git -C "$REPO" rev-parse HEAD)"
CONFLICT_TREE="$(git -C "$REPO" rev-parse 'HEAD^{tree}')"
touch "$RELEASE"
if wait "$refresh_pid"; then
  echo "conflicting writer unexpectedly published" >&2
  exit 1
fi
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$CONFLICT_MAIN" ]]
[[ "$(git -C "$REPO" rev-parse 'HEAD^{tree}')" == "$CONFLICT_TREE" ]]
[[ -z "$(git -C "$REPO" status --porcelain --untracked-files=all)" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$FIRST_MERGE" ]]
grep -Fq 'no longer merges cleanly' "$TMP/conflict.err"

# Failed generation and non-qq routing never publish.
"$ROOT/bin/qq-openwiki-materialize" thaw "$REPO"
git -C "$REPO" reset -q --hard "$FIRST_MERGE"
"$ROOT/bin/qq-openwiki-materialize" freeze "$REPO"
cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'partial\n' >openwiki/index.md
exit 23
SH
chmod +x "$FAKE"
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  QQ_OPENWIKI_REPO_KEY=qq \
  QQ_OPENWIKI_BIN="$FAKE" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null 2>&1; then
  echo "failed generation unexpectedly published" >&2
  exit 1
fi
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$FIRST_MERGE" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$FIRST_MERGE" ]]
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  QQ_OPENWIKI_REPO_KEY=discuss \
  QQ_OPENWIKI_BIN="$FAKE" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null 2>&1; then
  echo "non-qq repository unexpectedly used main publication" >&2
  exit 1
fi

# Checked-in instructions only point to optional generated context; T-53 does
# not require or carry generated output in its source commit.
grep -Fq 'The generated `openwiki/` evidence index, when present, is optional just-in-time context.' "$ROOT/AGENTS.md"
if grep -Eiq 'timer|publish|merge|branch|must|do not' "$ROOT/AGENTS.md"; then
  echo "AGENTS contains OpenWiki process or policy text" >&2
  exit 1
fi
grep -Fq 'Description=Refresh qq OpenWiki on main' "$ROOT/systemd/user/qq-openwiki.service"
grep -Fq 'ExecStart=%h/projects/qq/bin/qq-openwiki-dispatch' "$ROOT/systemd/user/qq-openwiki.service"
if grep -Fq 'QQ_OPENWIKI_OUTPUT_ROOT=' "$ROOT/systemd/user/qq-openwiki.service"; then
  echo "service still declares machine-local publication state" >&2
  exit 1
fi
if grep -Eq '(^|/)(sudo|setpriv)( |$)|^User=' "$ROOT/systemd/user/qq-openwiki.service"; then
  echo "user refresher unexpectedly requires a privileged identity" >&2
  exit 1
fi
if grep -Fq 'worktree add' "$ROOT/bin/qq-openwiki-refresh"; then
  echo "qq refresh still registers a linked worktree" >&2
  exit 1
fi

printf 'test-openwiki-refresh: pass\n'
