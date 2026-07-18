#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-openwiki"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
QQ_OPENWIKI="$(cd "$TESTS_DIR/.." && pwd -P)/bin/qq-openwiki"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export XDG_RUNTIME_DIR="$tmp/runtime"

fake_bin="$tmp/bin"
repo="$tmp/repo"
mkdir -p "$fake_bin" "$repo"

cat >"$fake_bin/openwiki" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
: >"$FAKE_LOG"
index=1
for argument in "$@"; do
  printf '%s' "$argument" >"$FAKE_LOG.$index"
  index=$((index + 1))
done
printf '%s' "$#" >"$FAKE_LOG.count"
printf '%s\n' "$OPENWIKI_PROVIDER" >"$FAKE_PROVIDER_LOG"
if [ -n "${FAKE_STARTED:-}" ]; then
  : >"$FAKE_STARTED"
  sleep "${FAKE_SLEEP:-0}"
fi
mkdir -p .github/workflows openwiki
printf 'generated workflow\n' >.github/workflows/openwiki-update.yml
python3 - <<'PY'
from pathlib import Path

start = "<!-- OPENWIKI:START -->"
end = "<!-- OPENWIKI:END -->"
generated = f"""{start}

## OpenWiki

The scheduled OpenWiki GitHub Actions workflow refreshes this wiki.

{end}"""
for name in ("AGENTS.md", "CLAUDE.md"):
    path = Path(name)
    content = path.read_text() if path.exists() else ""
    if start in content and end in content:
        before, rest = content.split(start, 1)
        _, after = rest.split(end, 1)
        content = f"{before}{generated}{after}"
    else:
        content = f"{content.rstrip()}\n\n{generated}\n" if content.strip() else f"{generated}\n"
    path.write_text(content)
PY
printf 'updated\n' >>openwiki/quickstart.md
if [ -n "${FAKE_FAIL:-}" ]; then
  exit "$FAKE_FAIL"
fi
SH
chmod +x "$fake_bin/openwiki"

git -C "$repo" init -q -b main
git -C "$repo" config user.email test@example.com
git -C "$repo" config user.name Test
printf '# Instructions\n\nKeep this text.\n' >"$repo/AGENTS.md"
printf '# Repository\n' >"$repo/README.md"
cp "$repo/AGENTS.md" "$tmp/agents-original"
mkdir -p "$repo/openwiki"
printf '# Quickstart\n' >"$repo/openwiki/quickstart.md"
git -C "$repo" add .
git -C "$repo" commit -qm initial
git -C "$repo" update-ref refs/remotes/origin/main "$(git -C "$repo" rev-parse HEAD)"
git -C "$repo" switch -qc openwiki/update

export PATH="$fake_bin:$PATH"
export FAKE_LOG="$tmp/args"
export FAKE_PROVIDER_LOG="$tmp/provider"
unset OPENWIKI_PROVIDER

(
  cd "$repo"
  PATH=/usr/bin:/bin QQ_OPENWIKI_BIN="$fake_bin/openwiki" "$QQ_OPENWIKI" --update
)

test ! -e "$repo/.github/workflows/openwiki-update.yml"
test ! -d "$repo/.github"
cmp "$tmp/agents-original" "$repo/AGENTS.md"
test ! -e "$repo/CLAUDE.md"
test ! -L "$repo/CLAUDE.md"
test "$(<"$tmp/args.count")" = 3
test "$(<"$tmp/args.1")" = code
test "$(<"$tmp/args.2")" = --update
test "$(<"$tmp/args.3")" = --print
test "$(cat "$tmp/provider")" = 'openai-chatgpt'

git -C "$repo" restore openwiki/quickstart.md
test -z "$(git -C "$repo" status --porcelain)"

git -C "$repo" switch -qc wrong-branch
rm -f "$FAKE_LOG" "$FAKE_PROVIDER_LOG"
if (cd "$repo" && "$QQ_OPENWIKI" --update >"$tmp/branch.out" 2>"$tmp/branch.err"); then
  fail 'update outside the dedicated branch unexpectedly succeeded'
fi
grep -q 'updates require the dedicated openwiki/update branch' "$tmp/branch.err"
git -C "$repo" switch -q openwiki/update

expected_main="$(git -C "$repo" rev-parse HEAD)"
tree="$(git -C "$repo" rev-parse 'HEAD^{tree}')"
advanced_main="$(git -C "$repo" commit-tree "$tree" -p "$expected_main" -m 'advanced main')"
git -C "$repo" update-ref refs/remotes/origin/main "$advanced_main"
if (cd "$repo" && "$QQ_OPENWIKI" --update >"$tmp/fresh.out" 2>"$tmp/fresh.err"); then
  fail 'update from a stale base unexpectedly succeeded'
fi
grep -q 'openwiki/update must equal current origin/main' "$tmp/fresh.err"
git -C "$repo" update-ref refs/remotes/origin/main "$expected_main"
test ! -e "$FAKE_LOG"
test ! -e "$FAKE_PROVIDER_LOG"

rm -f "$FAKE_LOG" "$FAKE_PROVIDER_LOG"
if (
  cd "$repo"
  "$QQ_OPENWIKI" --correct 'address verified findings' \
    >"$tmp/correct-clean.out" 2>"$tmp/correct-clean.err"
); then
  fail 'correction without a staged generated snapshot unexpectedly succeeded'
fi
grep -q 'correction requires a staged generated snapshot' \
  "$tmp/correct-clean.err"
test ! -e "$FAKE_LOG"
test ! -e "$FAKE_PROVIDER_LOG"

printf 'reviewed generated result\n' >>"$repo/openwiki/quickstart.md"
git -C "$repo" add -A
(
  cd "$repo"
  "$QQ_OPENWIKI" --correct 'address verified findings'
)
test "$(<"$tmp/args.count")" = 4
test "$(<"$tmp/args.1")" = code
test "$(<"$tmp/args.2")" = --update
test "$(<"$tmp/args.3")" = --print
test "$(<"$tmp/args.4")" = 'address verified findings'
grep -Fq 'reviewed generated result' \
  <(git -C "$repo" diff --cached -- openwiki/quickstart.md)
grep -Fq 'updated' <(git -C "$repo" diff -- openwiki/quickstart.md)
test ! -e "$repo/.github/workflows/openwiki-update.yml"
cmp "$tmp/agents-original" "$repo/AGENTS.md"
git -C "$repo" restore --worktree .
git -C "$repo" restore --staged .
git -C "$repo" restore --worktree .
test -z "$(git -C "$repo" status --porcelain)"

printf 'stale setup\n' >>"$repo/AGENTS.md"
rm -f "$FAKE_LOG" "$FAKE_PROVIDER_LOG"
if (cd "$repo" && "$QQ_OPENWIKI" --update >"$tmp/deviation.out" 2>"$tmp/deviation.err"); then
  fail 'update from a deviated setup unexpectedly succeeded'
fi
grep -q 'OpenWiki setup deviates from HEAD' "$tmp/deviation.err"
git -C "$repo" restore AGENTS.md

cp "$repo/.git/info/exclude" "$tmp/info-exclude.original"
printf 'CLAUDE.md\n' >>"$repo/.git/info/exclude"
printf '# Ignored Claude instructions\n\nKeep this content.\n' >"$repo/CLAUDE.md"
cp "$repo/CLAUDE.md" "$tmp/ignored-CLAUDE.expected"
rm -f "$FAKE_LOG" "$FAKE_PROVIDER_LOG"
if (
  cd "$repo"
  "$QQ_OPENWIKI" --update >"$tmp/ignored.out" 2>"$tmp/ignored.err"
); then
  fail 'update with ignored setup unexpectedly succeeded'
fi
grep -q 'OpenWiki setup deviates from HEAD' "$tmp/ignored.err"
cmp "$tmp/ignored-CLAUDE.expected" "$repo/CLAUDE.md"
test ! -e "$FAKE_LOG"
test ! -e "$FAKE_PROVIDER_LOG"
rm "$repo/CLAUDE.md"
cp "$tmp/info-exclude.original" "$repo/.git/info/exclude"

printf 'out-of-scope change\n' >>"$repo/README.md"
git -C "$repo" add README.md
if (
  cd "$repo"
  "$QQ_OPENWIKI" --correct >"$tmp/correct-scope.out" 2>"$tmp/correct-scope.err"
); then
  fail 'out-of-scope correction snapshot unexpectedly succeeded'
fi
grep -q 'correction snapshot is outside openwiki/' "$tmp/correct-scope.err"
test ! -e "$FAKE_LOG"
test ! -e "$FAKE_PROVIDER_LOG"
git -C "$repo" restore --staged --worktree README.md

printf 'reviewed generated result\n' >>"$repo/openwiki/quickstart.md"
git -C "$repo" add -A
printf 'unreviewed local edit\n' >>"$repo/openwiki/quickstart.md"
if (
  cd "$repo"
  "$QQ_OPENWIKI" --correct \
    >"$tmp/correct-unstaged.out" 2>"$tmp/correct-unstaged.err"
); then
  fail 'correction with an unstaged baseline unexpectedly succeeded'
fi
grep -q 'correction baseline must be fully staged' \
  "$tmp/correct-unstaged.err"
git -C "$repo" restore --worktree .
git -C "$repo" restore --staged .
git -C "$repo" restore --worktree .
test -z "$(git -C "$repo" status --porcelain)"

(
  cd "$repo"
  OPENWIKI_PROVIDER=openai-chatgpt "$QQ_OPENWIKI" --update \
    --modelId gpt-5.5 'focus on lifecycle'
)
test "$(<"$tmp/args.count")" = 6
test "$(<"$tmp/args.4")" = --modelId
test "$(<"$tmp/args.5")" = gpt-5.5
test "$(<"$tmp/args.6")" = 'focus on lifecycle'
test "$(cat "$tmp/provider")" = 'openai-chatgpt'
cmp "$tmp/agents-original" "$repo/AGENTS.md"
test ! -e "$repo/CLAUDE.md"

git -C "$repo" restore openwiki/quickstart.md
test -z "$(git -C "$repo" status --porcelain)"

shared_agents="$tmp/shared-AGENTS.md"
printf '# Shared instructions\n\nDo not change this target.\n' >"$shared_agents"
cp "$shared_agents" "$tmp/shared-AGENTS.expected"
rm "$repo/AGENTS.md"
ln -s "$shared_agents" "$repo/AGENTS.md"
printf '# Claude instructions\n\nKeep this file.\n' >"$repo/CLAUDE.md"
cp "$repo/CLAUDE.md" "$tmp/CLAUDE.expected"
git -C "$repo" add AGENTS.md CLAUDE.md
git -C "$repo" commit -qm 'use shared agent instructions'
git -C "$repo" update-ref refs/remotes/origin/main "$(git -C "$repo" rev-parse HEAD)"

(
  cd "$repo"
  "$QQ_OPENWIKI" --update
)
test -L "$repo/AGENTS.md"
test "$(readlink "$repo/AGENTS.md")" = "$shared_agents"
cmp "$tmp/shared-AGENTS.expected" "$shared_agents"
cmp "$tmp/CLAUDE.expected" "$repo/CLAUDE.md"
test ! -e "$repo/.github/workflows/openwiki-update.yml"
git -C "$repo" restore openwiki/quickstart.md
test -z "$(git -C "$repo" status --porcelain)"

rm -f "$FAKE_LOG" "$FAKE_PROVIDER_LOG"
if (
  cd "$repo"
  OPENWIKI_PROVIDER=anthropic "$QQ_OPENWIKI" --update \
    >"$tmp/provider-conflict.out" 2>"$tmp/provider-conflict.err"
); then
  fail 'conflicting OPENWIKI_PROVIDER unexpectedly succeeded'
fi
grep -q 'OPENWIKI_PROVIDER must be openai-chatgpt (local ChatGPT OAuth only)' \
  "$tmp/provider-conflict.err"
test ! -e "$FAKE_LOG"
test ! -e "$FAKE_PROVIDER_LOG"

init_repo="$tmp/init-repo"
git -C "$tmp" init -q -b main "$(basename "$init_repo")"
git -C "$init_repo" config user.email test@example.com
git -C "$init_repo" config user.name Test
printf '# Instructions\n' >"$init_repo/AGENTS.md"
git -C "$init_repo" add AGENTS.md
git -C "$init_repo" commit -qm initial
printf 'untracked\n' >"$init_repo/local.txt"
if (cd "$init_repo" && "$QQ_OPENWIKI" --init >"$tmp/init.out" 2>"$tmp/init.err"); then
  fail 'init in a dirty worktree unexpectedly succeeded'
fi
grep -q 'init worktree must be clean' "$tmp/init.err"
test ! -e "$FAKE_LOG"
test ! -e "$FAKE_PROVIDER_LOG"

non_executable="$tmp/not-executable"
: >"$non_executable"
if (
  cd "$repo"
  QQ_OPENWIKI_BIN="$non_executable" "$QQ_OPENWIKI" --update \
    >"$tmp/non-executable.out" 2>"$tmp/non-executable.err"
); then
  fail 'non-executable QQ_OPENWIKI_BIN unexpectedly succeeded'
fi
grep -q 'QQ_OPENWIKI_BIN must be an absolute executable file' "$tmp/non-executable.err"

if (
  cd "$repo"
  QQ_OPENWIKI_BIN=openwiki "$QQ_OPENWIKI" --update \
    >"$tmp/relative.out" 2>"$tmp/relative.err"
); then
  fail 'relative QQ_OPENWIKI_BIN unexpectedly succeeded'
fi
grep -q 'QQ_OPENWIKI_BIN must be an absolute executable file' "$tmp/relative.err"

export FAKE_STARTED="$tmp/started"
export FAKE_SLEEP=2
(
  cd "$repo"
  "$QQ_OPENWIKI" --update >"$tmp/first.out" 2>"$tmp/first.err"
) &
first_pid=$!
for _ in $(seq 1 100); do
  [ -e "$FAKE_STARTED" ] && break
  sleep 0.02
done
test -e "$FAKE_STARTED"
if (cd "$repo" && "$QQ_OPENWIKI" --update >"$tmp/second.out" 2>"$tmp/second.err"); then
  fail 'concurrent writer unexpectedly succeeded'
fi
grep -q 'another OpenWiki writer is active' "$tmp/second.err"
wait "$first_pid"

test -L "$repo/AGENTS.md"
test "$(readlink "$repo/AGENTS.md")" = "$shared_agents"
cmp "$tmp/shared-AGENTS.expected" "$shared_agents"
cmp "$tmp/CLAUDE.expected" "$repo/CLAUDE.md"
git -C "$repo" restore openwiki/quickstart.md
unset FAKE_STARTED FAKE_SLEEP
set +e
(
  cd "$repo"
  FAKE_FAIL=42 "$QQ_OPENWIKI" --update >"$tmp/failure.out" 2>"$tmp/failure.err"
)
failure_status=$?
set -e
test "$failure_status" -eq 42
test ! -e "$repo/.github/workflows/openwiki-update.yml"
test -L "$repo/AGENTS.md"
test "$(readlink "$repo/AGENTS.md")" = "$shared_agents"
cmp "$tmp/shared-AGENTS.expected" "$shared_agents"
cmp "$tmp/CLAUDE.expected" "$repo/CLAUDE.md"

printf 'test-qq-openwiki: pass\n'
