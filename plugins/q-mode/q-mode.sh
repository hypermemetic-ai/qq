#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

install_dir=${qq_q_mode_install_dir:-${HOME:?HOME is required}/.local/opt/qq-dictation/Handy.AppDir}
handy_bin=${qq_q_mode_handy_bin:-${HOME}/.local/bin/handy}
runtime_dir=${qq_q_mode_runtime_dir:-${XDG_RUNTIME_DIR:-}}
proc_root=${qq_q_mode_proc_root:-/proc}
control_timeout=${qq_q_mode_control_timeout:-5s}
ready_marker="$runtime_dir/qq-dictation-handy-ready"
expected_executable="$install_dir/usr/bin/handy"

fail() {
  printf 'q mode: %s\n' "$*" >&2
  return 1
}

ready_pid=
check_readiness() {
  [[ -n $runtime_dir ]] || { fail 'XDG_RUNTIME_DIR is unavailable'; return 1; }
  [[ -x $handy_bin ]] || { fail "handy launcher is not executable: $handy_bin"; return 1; }
  local ready_content extra pid state actual_executable
  [[ -f $ready_marker && ! -L $ready_marker ]] || {
    fail 'the running handy instance has no readiness marker'
    return 1
  }
  ready_content=$(<"$ready_marker") || {
    fail 'the handy readiness marker is unreadable'
    return 1
  }
  [[ $ready_content != *$'\n'* ]] || {
    fail 'the handy readiness marker is malformed'
    return 1
  }
  pid='' state='' extra=''
  read -r pid state extra <<<"$ready_content"
  [[ $pid =~ ^[1-9][0-9]*$ && -z $extra ]] || {
    fail 'the handy readiness marker is malformed'
    return 1
  }
  case "$state" in
    ready|prepared|armed) ;;
    *) fail 'the handy readiness state is invalid'; return 1 ;;
  esac
  kill -0 "$pid" 2>/dev/null || {
    fail 'the ready handy process is no longer running'
    return 1
  }
  actual_executable=$(readlink -f "$proc_root/$pid/exe" 2>/dev/null || true)
  [[ $actual_executable == "$expected_executable" ]] || {
    fail 'the ready process is not the installed qq-dictation executable'
    return 1
  }
  ready_pid=$pid
}

run_control() {
  local status
  set +e
  timeout --signal=TERM --kill-after=1s "$control_timeout" \
    "$handy_bin" "$@"
  status=$?
  set -e
  if [[ $status -eq 124 || $status -eq 137 ]]; then
    fail 'handy did not forward the control to its running instance'
    return 1
  fi
  if [[ $status -ne 0 ]]; then
    fail "handy control failed with status $status"
    return 1
  fi
}

valid_pane_id() {
  local pane_id=$1
  [[ ${#pane_id} -le 64 && $pane_id =~ ^w[[:alnum:]]+:p[[:alnum:]]+$ ]]
}

action=${1:-}
if [[ -n ${HERDR_PLUGIN_ACTION_ID:-} && $action != check \
  && $HERDR_PLUGIN_ACTION_ID != "$action" ]]; then
  fail 'plugin action context does not match the requested control'
  exit 1
fi

case "$action" in
  check)
    check_readiness
    printf 'q mode ready: Handy (pid %s)\n' "$ready_pid"
    ;;
  start-or-stop)
    pane_id=${HERDR_PANE_ID:-}
    valid_pane_id "$pane_id" || {
      fail 'start or stop requires one exact public Herdr pane id'
      exit 1
    }
    check_readiness
    run_control --toggle-transcription --herdr-pane "$pane_id"
    ;;
  cancel)
    # Cancellation is targetless and idempotent. If no accepted running instance
    # exists, there is nothing to cancel and the adapter must not cold-start it.
    if check_readiness 2>/dev/null; then
      run_control --cancel
    fi
    ;;
  *)
    printf 'usage: q-mode.sh {check|start-or-stop|cancel}\n' >&2
    exit 2
    ;;
esac
