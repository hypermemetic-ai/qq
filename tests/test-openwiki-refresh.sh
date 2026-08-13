#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d "$HOME/qq-openwiki-test.XXXXXX")"
cleanup() { rm -rf -- "$TMP"; }
trap cleanup EXIT

REPO="$TMP/repo"
WORKTREE="$TMP/worktree"
FAKE="$TMP/fake-openwiki"
mkdir -p -- "$REPO/openwiki"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.name qq-test
git -C "$REPO" config user.email qq-test.invalid
git -C "$REPO" config commit.gpgsign false
printf 'source\n' >"$REPO/source.txt"
printf 'operator instructions\n' >"$REPO/AGENTS.md"
printf 'old wiki\n' >"$REPO/openwiki/index.md"
git -C "$REPO" add .
git -C "$REPO" commit -q -m initial

cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
command -v node >/dev/null
printf 'new wiki\n' >openwiki/index.md
printf 'temporary\n' >CLAUDE.md
printf 'rewritten instructions\n' >AGENTS.md
mkdir -p .github/workflows
printf 'temporary\n' >.github/workflows/openwiki-update.yml
SH
chmod +x "$FAKE"

QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_WORKTREE="$WORKTREE" \
QQ_OPENWIKI_BRANCH="qq/test-openwiki" \
QQ_OPENWIKI_BIN="$FAKE" \
XDG_STATE_HOME="$TMP/state" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null

[[ "$(git -C "$REPO" branch --show-current)" == "main" ]]
[[ -z "$(git -C "$REPO" status --porcelain --untracked-files=all)" ]]
[[ "$(<"$REPO/openwiki/index.md")" == "new wiki" ]]
[[ "$(<"$REPO/AGENTS.md")" == "operator instructions" ]]
[[ ! -e "$REPO/CLAUDE.md" ]]
[[ ! -e "$REPO/.github" ]]
[[ ! -e "$WORKTREE" ]]
if git -C "$REPO" show-ref --verify --quiet refs/heads/qq/test-openwiki; then
  echo "refresh branch was not removed" >&2
  exit 1
fi
[[ "$(git -C "$REPO" rev-list --count HEAD)" == "3" ]]
[[ "$(git -C "$REPO" log -1 --format=%P | wc -w)" == "2" ]]
[[ "$(git -C "$REPO" diff-tree --no-commit-id --name-only -r HEAD^2)" == "openwiki/index.md" ]]

BEFORE="$(git -C "$REPO" rev-parse HEAD)"
cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
command -v node >/dev/null
SH
chmod +x "$FAKE"
QQ_OPENWIKI_MAIN_ROOT="$REPO" \
QQ_OPENWIKI_WORKTREE="$WORKTREE" \
QQ_OPENWIKI_BRANCH="qq/test-openwiki" \
QQ_OPENWIKI_BIN="$FAKE" \
XDG_STATE_HOME="$TMP/state" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$BEFORE" ]]

printf 'dirty\n' >>"$REPO/source.txt"
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  QQ_OPENWIKI_WORKTREE="$WORKTREE" \
  QQ_OPENWIKI_BRANCH="qq/test-openwiki" \
  QQ_OPENWIKI_BIN="$FAKE" \
  XDG_STATE_HOME="$TMP/state" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null 2>&1; then
  echo "dirty main unexpectedly accepted" >&2
  exit 1
fi
git -C "$REPO" restore -- source.txt

cat >"$FAKE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'outside generated tree\n' >source.txt
SH
chmod +x "$FAKE"
if QQ_OPENWIKI_MAIN_ROOT="$REPO" \
  QQ_OPENWIKI_WORKTREE="$WORKTREE" \
  QQ_OPENWIKI_BRANCH="qq/test-openwiki" \
  QQ_OPENWIKI_BIN="$FAKE" \
  XDG_STATE_HOME="$TMP/state" \
  "$ROOT/bin/qq-openwiki-refresh" >/dev/null 2>&1; then
  echo "non-OpenWiki change unexpectedly accepted" >&2
  exit 1
fi
[[ -z "$(git -C "$REPO" status --porcelain --untracked-files=all)" ]]
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$BEFORE" ]]
[[ ! -e "$WORKTREE" ]]

SERVICE="$ROOT/systemd/user/qq-openwiki.service"
grep -Fq 'ExecStart=%h/projects/qq/bin/qq-openwiki-refresh' "$SERVICE"
grep -Fq 'Environment="PATH=%h/.local/bin:' "$SERVICE"
if grep -Fq 'ExecStopPost=' "$SERVICE"; then
  echo "service still mutates the main checkout after refresh" >&2
  exit 1
fi

echo "test-openwiki-refresh: pass"
