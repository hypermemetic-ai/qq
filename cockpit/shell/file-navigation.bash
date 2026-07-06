# Terminal file navigation helpers for Herdr panes and ordinary shells.

: "${QQAC_HOME:=$HOME/projects/qq-ac}"

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
    if [ -d "$QQAC_HOME" ]; then
        builtin cd -- "$QQAC_HOME"
    else
        printf 'QQAC_HOME does not exist: %s\n' "$QQAC_HOME" >&2
        return 1
    fi
}

function qqy() {
    if [ -d "$QQAC_HOME" ]; then
        y "$QQAC_HOME" "$@"
    else
        y "$@"
    fi
}

function qqbr() {
    if [ -d "$QQAC_HOME" ]; then
        br "$QQAC_HOME" "$@"
    else
        br "$@"
    fi
}

alias qfiles='qqy'
alias qtree='qqbr'
