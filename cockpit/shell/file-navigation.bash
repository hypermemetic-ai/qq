# Terminal file navigation helpers for Herdr panes and ordinary shells.

: "${QQ_HOME:=$HOME/projects/qq}"

function y() {
    local tmp cwd

    tmp="$(mktemp -t "yazi-cwd.XXXXXX")" || return
    command yazi "$@" --cwd-file="$tmp"
    IFS= read -r -d '' cwd < "$tmp" || true
    command rm -f -- "$tmp"

    if [ -n "$cwd" ] && [ "$cwd" != "$PWD" ] && [ -d "$cwd" ]; then
        builtin cd -- "$cwd"
    fi
}

function br() {
    local cmd cmd_file code

    cmd_file="$(mktemp)" || return
    if command broot --outcmd "$cmd_file" "$@"; then
        cmd="$(<"$cmd_file")"
        command rm -f -- "$cmd_file"
        eval "$cmd"
    else
        code=$?
        command rm -f -- "$cmd_file"
        return "$code"
    fi
}

function qqroot() {
    if [ -d "$QQ_HOME" ]; then
        builtin cd -- "$QQ_HOME"
    else
        printf 'QQ_HOME does not exist: %s\n' "$QQ_HOME" >&2
        return 1
    fi
}

# Print the focused Herdr space's worktree checkout path. Fail if Herdr/jq are
# unavailable, no focused space has a worktree, or its directory is missing;
# callers then fall back to QQ_HOME.
function qq_space_dir() {
    local dir

    command -v herdr >/dev/null 2>&1 || return 1
    command -v jq >/dev/null 2>&1 || return 1
    dir="$(command herdr workspace list 2>/dev/null \
        | command jq -r '[.result.workspaces[] | select(.focused == true) | .worktree.checkout_path // empty][0] // empty' 2>/dev/null)" || return 1
    [ -n "$dir" ] && [ -d "$dir" ] || return 1
    printf '%s\n' "$dir"
}

function qqy() {
    local dir

    if dir="$(qq_space_dir)"; then
        y "$dir" "$@"
    elif [ -d "$QQ_HOME" ]; then
        y "$QQ_HOME" "$@"
    else
        y "$@"
    fi
}

function qqbr() {
    local dir

    if dir="$(qq_space_dir)"; then
        br "$dir" "$@"
    elif [ -d "$QQ_HOME" ]; then
        br "$QQ_HOME" "$@"
    else
        br "$@"
    fi
}

alias qfiles='qqy'
alias qtree='qqbr'
