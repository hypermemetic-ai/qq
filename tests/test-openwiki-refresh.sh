#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d "$HOME/qq-openwiki-publish-test.XXXXXX")"
cleanup() {
  chmod -R u+w -- "$TMP" 2>/dev/null || true
  rm -rf -- "$TMP"
}
trap cleanup EXIT

REPO="$TMP/repo"
FRESH="$TMP/fresh-worktree"
OUTPUT="$TMP/state/qq/openwiki"
FAKE="$TMP/fake-openwiki"
mkdir -p -- "$REPO" "$OUTPUT"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.name qq-test
git -C "$REPO" config user.email qq-test.invalid
git -C "$REPO" config commit.gpgsign false
printf 'source\n' >"$REPO/source.txt"
printf 'operator instructions\n' >"$REPO/AGENTS.md"
ln -s -- "$OUTPUT/qq/current" "$REPO/openwiki"
git -C "$REPO" add .
git -C "$REPO" commit -q -m initial
HEAD_BEFORE="$(git -C "$REPO" rev-parse HEAD)"

cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$(<source.txt)" == source ]]
[[ -f .git ]]
[[ -z "$(git status --short --untracked-files=all)" ]]
[[ ! -e openwiki ]]
printf '%s\n' "$*" >"$QQ_TEST_ARGS"
mkdir openwiki
printf 'version one\n' >openwiki/index.md
printf '{"status":"complete"}\n' >openwiki/.last-update.json
printf 'disposable\n' >CLAUDE.md
printf 'disposable rewrite\n' >AGENTS.md
SH
chmod +x "$FAKE"
QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_REPO_KEY=qq \
QQ_OPENWIKI_OUTPUT_ROOT="$OUTPUT" \
QQ_OPENWIKI_BIN="$FAKE" \
QQ_TEST_ARGS="$TMP/args" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null

[[ "$(<"$TMP/args")" == "code --init --print Keep this wiki short and practical." ]]
[[ -L "$OUTPUT/qq/current" ]]
[[ "$(<"$REPO/openwiki/index.md")" == "version one" ]]
[[ "$(<"$REPO/AGENTS.md")" == "operator instructions" ]]
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$HEAD_BEFORE" ]]
[[ -z "$(git -C "$REPO" status --porcelain --untracked-files=all)" ]]
[[ "$(git -C "$REPO" worktree list --porcelain | grep -c '^worktree ')" == 1 ]]
[[ "$(stat -Lc %a "$OUTPUT/qq/current")" == 555 ]]
[[ "$(stat -Lc %a "$OUTPUT/qq/current/index.md")" == 444 ]]
[[ -z "$(find "$OUTPUT/qq" -maxdepth 1 -name '.refresh.*' -print -quit)" ]]
[[ -z "$(find "$OUTPUT/qq/releases" -maxdepth 1 -name '.incoming.*' -print -quit)" ]]

before="$(sha256sum "$REPO/openwiki/index.md")"
if { printf 'tampered\n' >"$REPO/openwiki/index.md"; } 2>/dev/null; then
  echo "ordinary write through the OpenWiki locator unexpectedly succeeded" >&2
  exit 1
fi
if touch "$REPO/openwiki/unexpected.md" 2>/dev/null; then
  echo "ordinary file creation through the OpenWiki locator unexpectedly succeeded" >&2
  exit 1
fi
[[ "$(sha256sum "$REPO/openwiki/index.md")" == "$before" ]]

git -C "$REPO" worktree add -q --detach "$FRESH"
[[ "$(readlink -- "$FRESH/openwiki")" == "$OUTPUT/qq/current" ]]
[[ "$(<"$FRESH/openwiki/index.md")" == "version one" ]]
if { printf 'tampered\n' >"$FRESH/openwiki/index.md"; } 2>/dev/null; then
  echo "fresh worktree wrote through the OpenWiki locator" >&2
  exit 1
fi
git -C "$REPO" worktree remove --force -- "$FRESH"
if git -C "$REPO" worktree list --porcelain | grep -Fqx "worktree $FRESH"; then
  echo "fresh proof worktree was not removed" >&2
  exit 1
fi

first_release="$(readlink -- "$OUTPUT/qq/current")"
cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -f .git ]]
[[ -f openwiki/.last-update.json ]]
[[ -z "$(git status --short --untracked-files=all)" ]]
printf '%s\n' "$*" >"$QQ_TEST_ARGS"
printf 'version two\n' >openwiki/index.md
sleep 0.15
SH
chmod +x "$FAKE"
reader_stop="$TMP/reader-stop"
reader_error="$TMP/reader-error"
(
  while [[ ! -e "$reader_stop" ]]; do
    value="$(<"$REPO/openwiki/index.md")" || { printf 'unreadable\n' >"$reader_error"; exit 1; }
    case "$value" in 'version one'|'version two') ;; *) printf '%s\n' "$value" >"$reader_error"; exit 1 ;; esac
  done
) &
reader_pid=$!
QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_REPO_KEY=qq \
QQ_OPENWIKI_OUTPUT_ROOT="$OUTPUT" \
QQ_OPENWIKI_BIN="$FAKE" \
QQ_TEST_ARGS="$TMP/args" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null
touch "$reader_stop"
wait "$reader_pid"
[[ ! -e "$reader_error" ]]
[[ "$(<"$TMP/args")" == "code --update --print Keep this wiki short and practical." ]]
second_release="$(readlink -- "$OUTPUT/qq/current")"
[[ "$second_release" != "$first_release" ]]
[[ "$(<"$REPO/openwiki/index.md")" == "version two" ]]
[[ "$(<"$OUTPUT/qq/$first_release/index.md")" == "version one" ]]
[[ "$(stat -Lc %a "$REPO/openwiki")" == 555 ]]
[[ "$(stat -Lc %a "$REPO/openwiki/index.md")" == 444 ]]

cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'partial version\n' >openwiki/index.md
exit 23
SH
chmod +x "$FAKE"
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  QQ_OPENWIKI_REPO_KEY=qq \
  QQ_OPENWIKI_OUTPUT_ROOT="$OUTPUT" \
  QQ_OPENWIKI_BIN="$FAKE" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null 2>&1; then
  echo "failed generation unexpectedly published" >&2
  exit 1
fi
[[ "$(readlink -- "$OUTPUT/qq/current")" == "$second_release" ]]
[[ "$(<"$REPO/openwiki/index.md")" == "version two" ]]
[[ -z "$(find "$OUTPUT/qq" -maxdepth 1 -name '.refresh.*' -print -quit)" ]]
[[ -z "$(find "$OUTPUT/qq/releases" -maxdepth 1 -name '.incoming.*' -print -quit)" ]]
[[ -z "$(git -C "$REPO" status --porcelain --untracked-files=all)" ]]
[[ "$(git -C "$REPO" worktree list --porcelain | grep -c '^worktree ')" == 1 ]]

if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  QQ_OPENWIKI_REPO_KEY=discuss \
  QQ_OPENWIKI_OUTPUT_ROOT="$OUTPUT" \
  QQ_OPENWIKI_BIN="$FAKE" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null 2>&1; then
  echo "non-QQ repository unexpectedly used canonical publication" >&2
  exit 1
fi

grep -Fq 'ExecStart=%h/projects/qq/bin/qq-openwiki-dispatch' "$ROOT/systemd/user/qq-openwiki.service"
grep -Fq 'Environment=QQ_OPENWIKI_PUBLISHED_REPO_KEY=qq' "$ROOT/systemd/user/qq-openwiki.service"
grep -Fq 'Environment=QQ_OPENWIKI_OUTPUT_ROOT=%h/.local/state/qq/openwiki' "$ROOT/systemd/user/qq-openwiki.service"
if grep -Eq '(^|/)(sudo|setpriv)( |$)|^User=' "$ROOT/systemd/user/qq-openwiki.service"; then
  echo "user refresher unexpectedly requires a privileged identity" >&2
  exit 1
fi

echo "test-openwiki-refresh: pass"
