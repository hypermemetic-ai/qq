#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-openwiki-daily"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
DAILY="$ROOT/bin/qq-openwiki-daily"
SCHEDULE="$ROOT/bin/qq-openwiki-schedule"
FINISH="$ROOT/bin/qq-openwiki-daily-finish"
scratch="$ROOT/.test-qq-openwiki-daily"
rm -rf "$scratch"
mkdir -p "$scratch"
tmp="$(TMPDIR="$scratch" mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$tmp/runtime"

fake_pi="$tmp/pi"
cat >"$fake_pi" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\0' "$@" >"$FAKE_PI_ARGS"
printf '%s' "${QQ_OPENWIKI_SCHEDULED:-}" >"$FAKE_PI_MARKER"
if [ "${FAKE_NO_RECEIPT:-}" != 1 ] && [ -n "${QQ_OPENWIKI_COMPLETION_RECEIPT:-}" ]; then
  printf 'no-change:%040d\n' 0 >"$QQ_OPENWIKI_COMPLETION_RECEIPT"
  chmod 0600 "$QQ_OPENWIKI_COMPLETION_RECEIPT"
fi
if [ -n "${FAKE_PI_STARTED:-}" ]; then
  : >"$FAKE_PI_STARTED"
  sleep "${FAKE_PI_SLEEP:-0}"
fi
exit "${FAKE_PI_STATUS:-0}"
SH
chmod +x "$fake_pi"
export QQ_PI_BIN="$fake_pi"
export QQ_OPENWIKI_SCHEDULED=1
export XDG_RUNTIME_DIR="$tmp/runtime"
export FAKE_PI_ARGS="$tmp/pi.args"
export FAKE_PI_MARKER="$tmp/pi.marker"

(
  cd "$ROOT"
  "$DAILY"
)
mapfile -d '' -t args <"$FAKE_PI_ARGS"
assert_equal --print "${args[0]}"
assert_equal --no-session "${args[1]}"
assert_equal --approve "${args[2]}"
assert_equal --skill "${args[3]}"
assert_equal "$ROOT/skills/openwiki-maintainer/SKILL.md" "${args[4]}"
assignment="${args[5]}"
for required in \
  'dedicated openwiki-maintainer' \
  'Freshly fetch origin' \
  'reset its branch and worktree exactly to fresh origin/main' \
  "worktree's bin/qq-openwiki --update" \
  'no semantic documentation change' \
  'bin/qq-openwiki-daily-finish no-change' \
  'fresh independent code-review' \
  'review every correction delta' \
  'exactly one candidate commit' \
  'shell-tests' \
  'qq-openwiki-merge' \
  'Do not modify Backlog'; do
  assert_contains "$assignment" "$required"
done
assert_equal 1 "$(cat "$FAKE_PI_MARKER")"

if env -u QQ_OPENWIKI_SCHEDULED "$DAILY" >"$tmp/no-marker.out" 2>"$tmp/no-marker.err"; then
  fail 'daily runner accepted an ordinary environment'
fi
assert_file_contains "$tmp/no-marker.err" 'refusing outside the scheduled OpenWiki service environment'

set +e
FAKE_PI_STATUS=41 "$DAILY" >"$tmp/fail.out" 2>"$tmp/fail.err"
status=$?
set -e
assert_equal 41 "$status" 'Pi failure did not propagate'

if FAKE_NO_RECEIPT=1 "$DAILY" >"$tmp/no-receipt.out" 2>"$tmp/no-receipt.err"; then
  fail 'normal Pi completion without a workflow receipt unexpectedly succeeded'
fi
assert_file_contains "$tmp/no-receipt.err" \
  'maintainer completed without a machine-verifiable workflow receipt'

export FAKE_PI_STARTED="$tmp/started"
export FAKE_PI_SLEEP=2
"$DAILY" >"$tmp/first.out" 2>"$tmp/first.err" &
first_pid=$!
for _ in $(seq 1 100); do
  [ -e "$FAKE_PI_STARTED" ] && break
  sleep 0.02
done
[ -e "$FAKE_PI_STARTED" ] || fail 'first scheduled runner did not start'
if "$DAILY" >"$tmp/second.out" 2>"$tmp/second.err"; then
  fail 'overlapping scheduled runner unexpectedly succeeded'
fi
assert_file_contains "$tmp/second.err" 'another scheduled OpenWiki assessment is active'
wait "$first_pid"
unset FAKE_PI_STARTED FAKE_PI_SLEEP

nochange_repo="$tmp/nochange-repo"
nochange_remote="$tmp/nochange-remote.git"
real_git="$(command -v git)"
"$real_git" init -q --bare "$nochange_remote"
"$real_git" clone -q "$nochange_remote" "$nochange_repo"
"$real_git" -C "$nochange_repo" switch -qc main
"$real_git" -C "$nochange_repo" config user.name Test
"$real_git" -C "$nochange_repo" config user.email test@example.com
printf '# current\n' >"$nochange_repo/README.md"
"$real_git" -C "$nochange_repo" add README.md
"$real_git" -C "$nochange_repo" commit -qm base
"$real_git" -C "$nochange_repo" push -qu origin main
"$real_git" -C "$nochange_repo" switch -qc openwiki/update
nochange_head="$("$real_git" -C "$nochange_repo" rev-parse HEAD)"
finish_run="$XDG_RUNTIME_DIR/qq-openwiki-daily/run.finish"
mkdir -p "$finish_run"
export QQ_OPENWIKI_COMPLETION_RECEIPT="$finish_run/completion"
(
  cd "$nochange_repo"
  "$FINISH" no-change
)
assert_equal "no-change:$nochange_head" "$(cat "$QQ_OPENWIKI_COMPLETION_RECEIPT")"
rm -f "$QQ_OPENWIKI_COMPLETION_RECEIPT"
if (cd "$nochange_repo" && "$FINISH" no-change >/dev/full 2>"$tmp/full.err"); then
  fail 'no-change finisher accepted a failed status-stream write'
fi
test ! -e "$QQ_OPENWIKI_COMPLETION_RECEIPT" \
  || fail 'failed no-change status write left a successful receipt'
printf 'dirty\n' >>"$nochange_repo/README.md"
if (cd "$nochange_repo" && "$FINISH" no-change >"$tmp/dirty.out" 2>"$tmp/dirty.err"); then
  fail 'no-change finisher accepted a dirty OpenWiki worktree'
fi
assert_file_contains "$tmp/dirty.err" 'no-change worktree contains generated or unrelated changes'

service="$ROOT/cockpit/systemd/user/qq-openwiki-daily.service"
timer="$ROOT/cockpit/systemd/user/qq-openwiki-daily.timer"
assert_file_contains "$service" 'Type=oneshot'
assert_file_contains "$service" 'TimeoutStartSec=6h'
assert_file_contains "$service" 'Environment=QQ_OPENWIKI_SCHEDULED=1'
assert_file_contains "$service" 'Environment=PATH=%h/projects/qq/bin:%h/.local/bin:/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:/usr/bin:/bin'
assert_file_contains "$service" 'ExecStart=%h/projects/qq/bin/qq-openwiki-daily'
assert_file_contains "$timer" 'OnCalendar=*-*-* 03:00:00'
assert_file_contains "$timer" 'OnCalendar=*-*-* 13:00:00'
assert_file_contains "$timer" 'RandomizedDelaySec=0'
assert_file_contains "$timer" 'Persistent=false'
assert_file_not_matches "$timer" '^Persistent=true$'

afake="$tmp/systemctl"
cat >"$afake" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_SYSTEMCTL_LOG"
SH
chmod +x "$afake"
export QQ_SYSTEMCTL_BIN="$afake"
export FAKE_SYSTEMCTL_LOG="$tmp/systemctl.log"
"$SCHEDULE" install
assert_file_contains "$FAKE_SYSTEMCTL_LOG" "--user link $service $timer"
assert_file_contains "$FAKE_SYSTEMCTL_LOG" '--user enable --now qq-openwiki-daily.timer'
: >"$FAKE_SYSTEMCTL_LOG"
"$SCHEDULE" inspect
assert_file_contains "$FAKE_SYSTEMCTL_LOG" '--user show qq-openwiki-daily.timer'
assert_file_contains "$FAKE_SYSTEMCTL_LOG" '--user show qq-openwiki-daily.service'
: >"$FAKE_SYSTEMCTL_LOG"
"$SCHEDULE" disable
assert_file_contains "$FAKE_SYSTEMCTL_LOG" '--user disable --now qq-openwiki-daily.timer qq-openwiki-daily.service'

printf 'test-qq-openwiki-daily: pass\n'
