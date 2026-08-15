#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d "$HOME/qq-openwiki-branch-test.XXXXXX")"
cleanup() { rm -rf -- "$TMP"; }
trap cleanup EXIT

REPO="$TMP/repo"
REMOTE="$TMP/remote.git"
FAKE="$TMP/fake-openwiki"
mkdir -p -- "$REPO"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.name qq-test
git -C "$REPO" config user.email qq-test.invalid
git -C "$REPO" config commit.gpgsign false
printf 'source\n' >"$REPO/source.txt"
printf 'operator instructions\n' >"$REPO/AGENTS.md"
git -C "$REPO" add .
git -C "$REPO" commit -q -m initial
git init -q --bare "$REMOTE"
git -C "$REPO" remote add origin "$REMOTE"
git -C "$REPO" push -q -u origin main
MAIN_BEFORE="$(git -C "$REPO" rev-parse main)"
MAIN_TREE_BEFORE="$(git -C "$REPO" rev-parse 'main^{tree}')"

cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$(<source.txt)" == source ]]
[[ -f .git ]]
[[ -z "$(git status --short --untracked-files=all)" ]]
[[ ! -e openwiki ]]
printf '%s\n' "$*" >"$QQ_TEST_ARGS"
mkdir -p openwiki/guides
printf 'version one\n' >openwiki/index.md
printf 'start here\n' >openwiki/guides/start.md
printf '{"status":"complete"}\n' >openwiki/.last-update.json
printf 'disposable\n' >CLAUDE.md
printf 'disposable rewrite\n' >AGENTS.md
SH
chmod +x "$FAKE"

# An initial publication remains an explicit, operator-controlled action.
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  QQ_OPENWIKI_REPO_KEY=qq \
  QQ_OPENWIKI_BIN="$FAKE" \
  QQ_TEST_ARGS="$TMP/args" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null 2>&1; then
  echo "default refresh unexpectedly created the publication branch" >&2
  exit 1
fi
[[ ! -e "$TMP/args" ]]
if git -C "$REPO" show-ref --verify --quiet refs/heads/openwiki; then
  echo "default refresh created openwiki" >&2
  exit 1
fi

# Dirty source state must neither block publication nor enter its commit.
printf 'dirty source\n' >>"$REPO/source.txt"
printf 'untracked source\n' >"$REPO/untracked.txt"
QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_REPO_KEY=qq \
QQ_OPENWIKI_BIN="$FAKE" \
QQ_OPENWIKI_ACTION=init \
QQ_TEST_ARGS="$TMP/args" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null

[[ "$(<"$TMP/args")" == "code --init --print Keep this wiki short and practical." ]]
[[ "$(git -C "$REPO" rev-parse main)" == "$MAIN_BEFORE" ]]
[[ "$(git -C "$REPO" rev-parse 'main^{tree}')" == "$MAIN_TREE_BEFORE" ]]
[[ "$(<"$REPO/AGENTS.md")" == "operator instructions" ]]
grep -Fxq 'dirty source' "$REPO/source.txt"
[[ "$(<"$REPO/untracked.txt")" == "untracked source" ]]
[[ ! -e "$REPO/openwiki" ]]
[[ "$(git -C "$REPO" branch --show-current)" == main ]]
[[ "$(git -C "$REPO" worktree list --porcelain | grep -c '^worktree ')" == 1 ]]
[[ "$(git -C "$REPO" rev-list --parents -1 openwiki | wc -w)" == 1 ]]
[[ "$(git -C "$REPO" rev-parse openwiki)" == "$(git --git-dir="$REMOTE" rev-parse refs/heads/openwiki)" ]]
if git -C "$REPO" merge-base --is-ancestor openwiki main; then
  echo "orphan OpenWiki publication is reachable from main" >&2
  exit 1
fi
printf '%s\n' .last-update.json guides/start.md index.md >"$TMP/expected-tree"
git -C "$REPO" ls-tree -r --name-only openwiki >"$TMP/actual-tree"
cmp -s "$TMP/expected-tree" "$TMP/actual-tree"
[[ "$(git -C "$REPO" show openwiki:index.md)" == "version one" ]]
if git -C "$REPO" cat-file -e openwiki:openwiki 2>/dev/null; then
  echo "publication contains a nested openwiki directory" >&2
  exit 1
fi

# Identical generation is a no-op, including at the temporary remote.
FIRST_PUBLICATION="$(git -C "$REPO" rev-parse openwiki)"
cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -f openwiki/.last-update.json ]]
[[ "$(<openwiki/index.md)" == "version one" ]]
[[ -z "$(git status --short --untracked-files=all)" ]]
printf '%s\n' "$*" >"$QQ_TEST_ARGS"
SH
chmod +x "$FAKE"
QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_REPO_KEY=qq \
QQ_OPENWIKI_BIN="$FAKE" \
QQ_TEST_ARGS="$TMP/args" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null
[[ "$(<"$TMP/args")" == "code --update --print Keep this wiki short and practical." ]]
[[ "$(git -C "$REPO" rev-parse openwiki)" == "$FIRST_PUBLICATION" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/openwiki)" == "$FIRST_PUBLICATION" ]]

# A fresh repository user can read and continue the remote publication.
CLONE="$TMP/clone"
git clone -q --branch main "$REMOTE" "$CLONE"
git -C "$CLONE" config user.name qq-test
git -C "$CLONE" config user.email qq-test.invalid
QQ_OPENWIKI_MAIN_ROOT="$CLONE" \
QQ_OPENWIKI_REPO_KEY=qq \
QQ_OPENWIKI_BIN="$FAKE" \
QQ_TEST_ARGS="$TMP/clone-args" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null
[[ "$(<"$TMP/clone-args")" == "code --update --print Keep this wiki short and practical." ]]
[[ "$(git -C "$CLONE" rev-parse openwiki)" == "$FIRST_PUBLICATION" ]]
[[ "$(git -C "$CLONE" show openwiki:index.md)" == "version one" ]]

# A changed wiki advances only the orphan publication branch.
cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -f openwiki/.last-update.json ]]
printf 'version two\n' >openwiki/index.md
printf 'generator touched source\n' >source.txt
SH
chmod +x "$FAKE"
QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_REPO_KEY=qq \
QQ_OPENWIKI_BIN="$FAKE" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null
SECOND_PUBLICATION="$(git -C "$REPO" rev-parse openwiki)"
[[ "$SECOND_PUBLICATION" != "$FIRST_PUBLICATION" ]]
[[ "$(git -C "$REPO" rev-parse openwiki^)" == "$FIRST_PUBLICATION" ]]
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/openwiki)" == "$SECOND_PUBLICATION" ]]
[[ "$(git -C "$REPO" show openwiki:index.md)" == "version two" ]]
[[ "$(git -C "$REPO" rev-parse main)" == "$MAIN_BEFORE" ]]
[[ "$(git -C "$REPO" rev-parse 'main^{tree}')" == "$MAIN_TREE_BEFORE" ]]
grep -Fxq 'dirty source' "$REPO/source.txt"
[[ -z "$(git -C "$REPO" log --format=%H main -- openwiki)" ]]

# Failed generation and non-qq dispatch cannot alter publication.
cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'partial version\n' >openwiki/index.md
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
[[ "$(git -C "$REPO" rev-parse openwiki)" == "$SECOND_PUBLICATION" ]]
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  QQ_OPENWIKI_REPO_KEY=discuss \
  QQ_OPENWIKI_BIN="$FAKE" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null 2>&1; then
  echo "non-qq repository unexpectedly used branch publication" >&2
  exit 1
fi

# Main itself has no generated tree or machine-specific locator.
if git -C "$ROOT" ls-files --error-unmatch openwiki >/dev/null 2>&1 || [[ -e "$ROOT/openwiki" ]]; then
  echo "main still contains an OpenWiki tree or locator" >&2
  exit 1
fi
grep -Fq 'branch `openwiki`' "$ROOT/AGENTS.md"
grep -Fq 'must not be hand-edited' "$ROOT/AGENTS.md"
grep -Fq 'ExecStart=%h/projects/qq/bin/qq-openwiki-dispatch' "$ROOT/systemd/user/qq-openwiki.service"
if grep -Fq 'QQ_OPENWIKI_OUTPUT_ROOT=' "$ROOT/systemd/user/qq-openwiki.service"; then
  echo "service still declares machine-local publication state" >&2
  exit 1
fi
if grep -Eq '(^|/)(sudo|setpriv)( |$)|^User=' "$ROOT/systemd/user/qq-openwiki.service"; then
  echo "user refresher unexpectedly requires a privileged identity" >&2
  exit 1
fi

echo "test-openwiki-refresh: pass"
