# Start Pi on a clean terminal, including clearing supported scrollback.
pi() {
    printf '\033[3J\033[H\033[2J'
    command pi "$@"
}
