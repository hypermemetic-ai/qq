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
PUBLISH_FAKE="$TMP/published-refresh"
LEGACY_FAKE="$TMP/legacy-refresh"
mkdir -p "$PROJECTS" "$STATE"
for repo in qq qq-newspaper herdr discuss qq-dictation deciq; do
  mkdir -p "$PROJECTS/$repo"
  git -C "$PROJECTS/$repo" init -q -b main
  git -C "$PROJECTS/$repo" config user.name qq-test
  git -C "$PROJECTS/$repo" config user.email qq-test.invalid
  git -C "$PROJECTS/$repo" commit -q --allow-empty -m initial
done
cat >"$REGISTRY" <<'EOF'
qq
qq-newspaper
herdr
discuss
qq-dictation
EOF

cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
mode="$(basename -- "$0")"
case "$mode" in
  published-refresh) [[ "$QQ_OPENWIKI_REPO_KEY" == qq ]] ;;
  legacy-refresh) [[ "$QQ_OPENWIKI_REPO_KEY" != qq ]] ;;
  *) exit 2 ;;
esac
exec 9>"$QQ_TEST_STATE/lock"
flock 9
count=0
[[ -f "$QQ_TEST_STATE/count" ]] && count="$(<"$QQ_TEST_STATE/count")"
count=$((count + 1))
printf '%s\n' "$count" >"$QQ_TEST_STATE/count"
max=0
[[ -f "$QQ_TEST_STATE/max" ]] && max="$(<"$QQ_TEST_STATE/max")"
if (( count > max )); then printf '%s\n' "$count" >"$QQ_TEST_STATE/max"; fi
printf '%s:%s\n' "${mode%-refresh}" "$QQ_OPENWIKI_REPO_KEY" >>"$QQ_TEST_STATE/started"
flock -u 9
sleep 0.2
exec 9>"$QQ_TEST_STATE/lock"
flock 9
count="$(<"$QQ_TEST_STATE/count")"
printf '%s\n' "$((count - 1))" >"$QQ_TEST_STATE/count"
printf '%s:%s\n' "${mode%-refresh}" "$QQ_OPENWIKI_REPO_KEY" >>"$QQ_TEST_STATE/finished"
flock -u 9
[[ "$QQ_OPENWIKI_REPO_KEY" != fail ]]
SH
chmod +x "$FAKE"
ln -s "$FAKE" "$PUBLISH_FAKE"
ln -s "$FAKE" "$LEGACY_FAKE"

QQ_OPENWIKI_REGISTRY="$REGISTRY" \
QQ_OPENWIKI_PROJECTS_ROOT="$PROJECTS" \
QQ_OPENWIKI_REFRESH_BIN="$PUBLISH_FAKE" \
QQ_OPENWIKI_LEGACY_REFRESH_BIN="$LEGACY_FAKE" \
QQ_OPENWIKI_MAX_PARALLEL=3 \
QQ_TEST_STATE="$STATE" \
  "$ROOT/bin/qq-openwiki-dispatch" >/dev/null

[[ "$(<"$STATE/max")" == 3 ]]
printf '%s\n' published:qq legacy:qq-newspaper legacy:herdr legacy:discuss legacy:qq-dictation | sort >"$TMP/expected"
sort "$STATE/started" >"$TMP/started"
sort "$STATE/finished" >"$TMP/finished"
cmp -s "$TMP/expected" "$TMP/started"
cmp -s "$TMP/expected" "$TMP/finished"
if grep -Fq deciq "$STATE/started"; then
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
  QQ_OPENWIKI_REFRESH_BIN="$PUBLISH_FAKE" \
  QQ_OPENWIKI_LEGACY_REFRESH_BIN="$LEGACY_FAKE" \
  QQ_OPENWIKI_MAX_PARALLEL=3 \
  QQ_TEST_STATE="$STATE" \
  "$ROOT/bin/qq-openwiki-dispatch" >/dev/null 2>&1; then
  echo "dispatcher ignored a legacy repository failure" >&2
  exit 1
fi
[[ "$(wc -l <"$STATE/finished")" == 3 ]]
grep -Fxq published:qq "$STATE/finished"
grep -Fxq legacy:fail "$STATE/finished"
grep -Fxq legacy:qq-dictation "$STATE/finished"

# The service dispatches qq publication before later legacy jobs. A tracked
# absolute setup symlink in a legacy repository must not let those jobs write
# back into live qq, including while their linked worktrees are cleaned up.
BOUNDARY_PUBLISH="$TMP/boundary-publish"
BOUNDARY_WRITER="$TMP/boundary-writer"
BOUNDARY_MARKER="$TMP/boundary-published"
BOUNDARY_TRACE="$TMP/boundary-legacy-jobs"
BOUNDARY_WORKTREE="$TMP/boundary-worktree"
printf 'live qq sentinel\n' >"$PROJECTS/qq/AGENTS.md"
git -C "$PROJECTS/qq" add AGENTS.md
git -C "$PROJECTS/qq" commit -q -m 'Add live sentinel'
ln -s "$PROJECTS/qq/AGENTS.md" "$PROJECTS/qq-dictation/AGENTS.md"
git -C "$PROJECTS/qq-dictation" add AGENTS.md
git -C "$PROJECTS/qq-dictation" commit -q -m 'Add external instructions link'
cat >"$BOUNDARY_PUBLISH" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$QQ_OPENWIKI_REPO_KEY" == qq ]]
printf 'published\n' >"$QQ_TEST_BOUNDARY_MARKER"
SH
cat >"$BOUNDARY_WRITER" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -e "$QQ_TEST_BOUNDARY_MARKER" ]]
[[ "$PWD" != "$QQ_OPENWIKI_MAIN_ROOT" ]]
printf 'legacy setup rewrite\n' >AGENTS.md
printf '%s\n' "$QQ_OPENWIKI_REPO_KEY" >>"$QQ_TEST_BOUNDARY_TRACE"
SH
chmod +x "$BOUNDARY_PUBLISH" "$BOUNDARY_WRITER"
cat >"$REGISTRY" <<'EOF'
qq
qq-newspaper
qq-dictation
EOF
QQ_OPENWIKI_REGISTRY="$REGISTRY" \
QQ_OPENWIKI_PROJECTS_ROOT="$PROJECTS" \
QQ_OPENWIKI_REFRESH_BIN="$BOUNDARY_PUBLISH" \
QQ_OPENWIKI_LEGACY_REFRESH_BIN="$ROOT/bin/qq-openwiki-refresh-legacy" \
QQ_OPENWIKI_MAX_PARALLEL=1 \
QQ_OPENWIKI_BIN="$BOUNDARY_WRITER" \
QQ_OPENWIKI_WORKTREE="$BOUNDARY_WORKTREE" \
QQ_OPENWIKI_BRANCH=qq/test-dispatch-boundary \
QQ_TEST_BOUNDARY_MARKER="$BOUNDARY_MARKER" \
QQ_TEST_BOUNDARY_TRACE="$BOUNDARY_TRACE" \
  "$ROOT/bin/qq-openwiki-dispatch" >/dev/null
printf '%s\n' qq-newspaper qq-dictation >"$TMP/expected-boundary-jobs"
cmp -s "$TMP/expected-boundary-jobs" "$BOUNDARY_TRACE"
[[ "$(<"$PROJECTS/qq/AGENTS.md")" == 'live qq sentinel' ]]
[[ "$(readlink -- "$PROJECTS/qq-dictation/AGENTS.md")" == "$PROJECTS/qq/AGENTS.md" ]]
[[ ! -e "$PROJECTS/qq-newspaper/AGENTS.md" ]]
[[ ! -e "$BOUNDARY_WORKTREE" ]]
for repo in qq-newspaper qq-dictation; do
  if git -C "$PROJECTS/$repo" show-ref --verify --quiet refs/heads/qq/test-dispatch-boundary; then
    echo "legacy refresh branch survived dispatch cleanup for $repo" >&2
    exit 1
  fi
  [[ -z "$(git -C "$PROJECTS/$repo" status --porcelain --untracked-files=all)" ]]
done
[[ -z "$(git -C "$PROJECTS/qq" status --porcelain --untracked-files=all)" ]]

DEFAULT_REGISTRY="$ROOT/config/openwiki-repositories"
grep -Fxq qq "$DEFAULT_REGISTRY"
grep -Fxq qq-newspaper "$DEFAULT_REGISTRY"
grep -Fxq herdr "$DEFAULT_REGISTRY"
grep -Fxq discuss "$DEFAULT_REGISTRY"
grep -Fxq qq-dictation "$DEFAULT_REGISTRY"
[[ "$(grep -Evc '^[[:space:]]*(#|$)' "$DEFAULT_REGISTRY")" == 5 ]]
if grep -Eiq 'deciq' <(grep -v '^[[:space:]]*#' "$DEFAULT_REGISTRY"); then
  echo "live OpenWiki registry includes frozen DecIQ" >&2
  exit 1
fi
grep -Fq 'bin/qq-openwiki-refresh-legacy' "$ROOT/bin/qq-openwiki-dispatch"
grep -Fq 'bin/qq-openwiki-refresh' "$ROOT/bin/qq-openwiki-dispatch"

echo "test-openwiki-dispatch: pass"
