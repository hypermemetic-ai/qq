# Terminal file navigation helpers for Herdr panes and ordinary shells.
: "${QQ_HOME:=$HOME/projects/qq}"
function qq_mount_bin() {
    # Positional scratch avoids collisions with readonly caller variables.
    set -- "$PATH:" ""
    while [ -n "$1" ]; do
        if [ "${1%%:*}" = "$QQ_HOME/bin" ]; then
            set -- "${1#*:}" "$2"
        else
            set -- "${1#*:}" "$2:${1%%:*}"
        fi
    done
    PATH="$QQ_HOME/bin$2"
}
qq_mount_bin
unset -f qq_mount_bin
export PATH
# Confined delegation adapter env is provided by the project-local pi
# extension .pi/extensions/qq-subagent-env.ts (README, Install), which sets
# the PI_SUBAGENT_* variables in-process for pi sessions in this checkout.
function qqroot() {
    if [ -d "$QQ_HOME" ]; then
        builtin cd -- "$QQ_HOME"
    else
        printf 'QQ_HOME does not exist: %s\n' "$QQ_HOME" >&2
        return 1
    fi
}
function qq_space_dir() {
    local json dir
    command -v herdr >/dev/null 2>&1 || return 1
    command -v jq >/dev/null 2>&1 || return 1
    json="$(command herdr workspace list 2>/dev/null)" || return 1
    dir="$(command jq -r '[.result.workspaces[] | select(.focused == true) | .worktree.checkout_path // empty][0] // empty' <<<"$json" 2>/dev/null)" || return 1
    [ -n "$dir" ] && [ -d "$dir" ] || return 1
    printf '%s\n' "$dir"
}
function qqcd() {
    local dir status
    if [ "$#" -eq 0 ]; then
        dir="$(qq_space_dir)" || dir="$QQ_HOME"
    else
        command -v fzf >/dev/null 2>&1 || { printf 'qqcd requires fzf\n' >&2; return 1; }
        # fzf's own exit status decides. find feeds it through process
        # substitution: an early-exiting fzf may SIGPIPE find, but that
        # status is never collected, so no pipeline status can discard a
        # valid selection under ambient pipefail. find keeps its tolerance
        # for unreadable subtrees.
        dir="$(command fzf --query="$*" < <(command find "$HOME" -type d 2>/dev/null))" && status=0 || status=$?
        case "$status" in
            0) [ -n "$dir" ] || { printf 'qqcd: empty selection\n' >&2; return 1; } ;;
            1|130) return "$status" ;;
            *) printf 'qqcd: fzf failed (exit %s)\n' "$status" >&2; return "$status" ;;
        esac
    fi
    builtin cd -- "$dir"
}
