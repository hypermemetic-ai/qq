#!/usr/bin/env bash
set -euo pipefail

QQ_OPENWIKI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/bin/qq-openwiki"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

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
printf '%s\n' "$QQ_OPENWIKI_NODE_BIN" >"$FAKE_RUNTIME_NODE_LOG"
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
ln -s "$(command -v node)" "$fake_bin/node"

git -C "$repo" init -q -b main
git -C "$repo" config user.email test@example.com
git -C "$repo" config user.name Test
printf '# Instructions\n\nKeep this text.\n' >"$repo/AGENTS.md"
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
export FAKE_RUNTIME_NODE_LOG="$tmp/runtime-node"
unset OPENWIKI_PROVIDER

(
  cd "$repo"
  PATH=/usr/bin:/bin OPENWIKI_BIN="$fake_bin/openwiki" "$QQ_OPENWIKI" --update
)

test ! -e "$repo/.github/workflows/openwiki-update.yml"
test ! -d "$repo/.github"
cmp "$tmp/agents-original" "$repo/AGENTS.md"
test ! -e "$repo/CLAUDE.md"
test ! -L "$repo/CLAUDE.md"
test "$(<"$tmp/args.count")" = 4
test "$(<"$tmp/args.1")" = code
test "$(<"$tmp/args.2")" = --update
test "$(<"$tmp/args.3")" = --print
grep -Fq 'You, the internal OpenWiki generator, own diagram selection and authorship during this run.' \
  "$tmp/args.4"
grep -Fq 'There is no diagram quota.' "$tmp/args.4"
grep -Fq 'Prefer a compact process abstraction over mirroring every source statement.' "$tmp/args.4"
grep -Fq 'Make the embedded image a link to the same PNG' "$tmp/args.4"
grep -Fq 'verifies every cited source file and line range inside the Repository' "$tmp/args.4"
grep -Fq "QQ_OPENWIKI_NODE_BIN=$(<"$tmp/runtime-node")" "$tmp/args.4"
grep -Fq "$QQ_OPENWIKI-bpmn openwiki/processes/<id>.json" "$tmp/args.4"
grep -Fq "$QQ_OPENWIKI-bpmn --check openwiki/processes/<id>.json" "$tmp/args.4"
grep -Fq 'run the publisher in --check mode for every retained spec in stable filename order' \
  "$tmp/args.4"
test "$(cat "$tmp/provider")" = 'openai-chatgpt'
test -x "$(<"$tmp/runtime-node")"

git -C "$repo" restore openwiki/quickstart.md
test -z "$(git -C "$repo" status --porcelain)"

(
  cd "$repo"
  OPENWIKI_PROVIDER=openai-chatgpt "$QQ_OPENWIKI" --update \
    --modelId gpt-5.5 'focus on lifecycle'
)
test "$(<"$tmp/args.count")" = 7
test "$(<"$tmp/args.4")" = --modelId
test "$(<"$tmp/args.5")" = gpt-5.5
test "$(<"$tmp/args.6")" = 'focus on lifecycle'
grep -Fq 'OpenWiki BPMN authoring extension:' "$tmp/args.7"
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
  echo 'conflicting OPENWIKI_PROVIDER unexpectedly succeeded' >&2
  exit 1
fi
grep -q 'OPENWIKI_PROVIDER must be openai-chatgpt (local ChatGPT OAuth only)' \
  "$tmp/provider-conflict.err"
test ! -e "$FAKE_LOG"
test ! -e "$FAKE_PROVIDER_LOG"

non_executable="$tmp/not-executable"
: >"$non_executable"
if (
  cd "$repo"
  OPENWIKI_BIN="$non_executable" "$QQ_OPENWIKI" --update \
    >"$tmp/non-executable.out" 2>"$tmp/non-executable.err"
); then
  echo 'non-executable OPENWIKI_BIN unexpectedly succeeded' >&2
  exit 1
fi
grep -q 'OPENWIKI_BIN must be an absolute executable file' "$tmp/non-executable.err"

if (
  cd "$repo"
  OPENWIKI_BIN=openwiki "$QQ_OPENWIKI" --update \
    >"$tmp/relative.out" 2>"$tmp/relative.err"
); then
  echo 'relative OPENWIKI_BIN unexpectedly succeeded' >&2
  exit 1
fi
grep -q 'OPENWIKI_BIN must be an absolute executable file' "$tmp/relative.err"

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
  echo 'concurrent writer unexpectedly succeeded' >&2
  exit 1
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
