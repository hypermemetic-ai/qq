#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d "$HOME/qq-openwiki-dispatch-test.XXXXXX")"
cleanup() { rm -rf -- "$TMP"; }
trap cleanup EXIT

PROJECTS="$TMP/projects"
REGISTRY="$TMP/repositories"
STATE="$TMP/state"
FAKE="$TMP/fake-refresh"
mkdir -p "$PROJECTS" "$STATE"
for repo in qq discuss qq-dictation deciq; do
  mkdir -p "$PROJECTS/$repo"
  git -C "$PROJECTS/$repo" init -q -b main
  git -C "$PROJECTS/$repo" config user.name qq-test
  git -C "$PROJECTS/$repo" config user.email qq-test.invalid
  git -C "$PROJECTS/$repo" commit -q --allow-empty -m initial
done
cat >"$REGISTRY" <<'EOF'
qq
discuss
qq-dictation
EOF

cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
exec 9>"$QQ_TEST_STATE/lock"
flock 9
count=0
[[ -f "$QQ_TEST_STATE/count" ]] && count="$(<"$QQ_TEST_STATE/count")"
count=$((count + 1))
printf '%s\n' "$count" >"$QQ_TEST_STATE/count"
max=0
[[ -f "$QQ_TEST_STATE/max" ]] && max="$(<"$QQ_TEST_STATE/max")"
if (( count > max )); then printf '%s\n' "$count" >"$QQ_TEST_STATE/max"; fi
printf '%s\n' "$QQ_OPENWIKI_REPO_KEY" >>"$QQ_TEST_STATE/started"
flock -u 9
sleep 0.2
exec 9>"$QQ_TEST_STATE/lock"
flock 9
count="$(<"$QQ_TEST_STATE/count")"
printf '%s\n' "$((count - 1))" >"$QQ_TEST_STATE/count"
printf '%s\n' "$QQ_OPENWIKI_REPO_KEY" >>"$QQ_TEST_STATE/finished"
flock -u 9
[[ "$QQ_OPENWIKI_REPO_KEY" != "fail" ]]
SH
chmod +x "$FAKE"

QQ_OPENWIKI_REGISTRY="$REGISTRY" \
QQ_OPENWIKI_PROJECTS_ROOT="$PROJECTS" \
QQ_OPENWIKI_REFRESH_BIN="$FAKE" \
QQ_OPENWIKI_MAX_PARALLEL=3 \
QQ_TEST_STATE="$STATE" \
  "$ROOT/bin/qq-openwiki-dispatch" >/dev/null

[[ "$(<"$STATE/max")" == "3" ]]
printf '%s\n' qq discuss qq-dictation | sort >"$TMP/expected"
sort "$STATE/started" >"$TMP/started"
sort "$STATE/finished" >"$TMP/finished"
cmp -s "$TMP/expected" "$TMP/started"
cmp -s "$TMP/expected" "$TMP/finished"
if grep -Fxq deciq "$STATE/started"; then
  echo "dispatcher unexpectedly ran frozen DecIQ" >&2
  exit 1
fi

mkdir -p "$PROJECTS/fail"
git -C "$PROJECTS/fail" init -q -b main
git -C "$PROJECTS/fail" config user.name qq-test
git -C "$PROJECTS/fail" config user.email qq-test.invalid
git -C "$PROJECTS/fail" commit -q --allow-empty -m initial
cat >"$REGISTRY" <<'EOF'
qq
fail
qq-dictation
EOF
rm -f "$STATE/count" "$STATE/max" "$STATE/started" "$STATE/finished"
if QQ_OPENWIKI_REGISTRY="$REGISTRY" \
  QQ_OPENWIKI_PROJECTS_ROOT="$PROJECTS" \
  QQ_OPENWIKI_REFRESH_BIN="$FAKE" \
  QQ_OPENWIKI_MAX_PARALLEL=3 \
  QQ_TEST_STATE="$STATE" \
  "$ROOT/bin/qq-openwiki-dispatch" >/dev/null 2>&1; then
  echo "dispatcher ignored a repository failure" >&2
  exit 1
fi
[[ "$(wc -l <"$STATE/finished")" == "3" ]]

DEFAULT_REGISTRY="$ROOT/config/openwiki-repositories"
grep -Fxq qq "$DEFAULT_REGISTRY"
grep -Fxq discuss "$DEFAULT_REGISTRY"
grep -Fxq qq-dictation "$DEFAULT_REGISTRY"
if grep -Eiq 'deciq' <(grep -v '^[[:space:]]*#' "$DEFAULT_REGISTRY"); then
  echo "live OpenWiki registry includes frozen DecIQ" >&2
  exit 1
fi

echo "test-openwiki-dispatch: pass"
