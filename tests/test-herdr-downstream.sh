#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
downstream="$root/herdr/downstream"
# shellcheck source=/dev/null
source "$downstream/upstream.env"

[[ "$HERDR_UPSTREAM_URL" == https://github.com/hypermemetic-ai/herdr.git ]]
[[ "$HERDR_UPSTREAM_TAG" == qq-v0.8.0-1 ]]
[[ "$HERDR_UPSTREAM_COMMIT" == f1e8f5793ecad4feab4c6df6bebca3f564cdbe05 ]]
[[ -z ${HERDR_PATCHES+x} ]]
[[ ! -e "$downstream/patches/0001-centered-pane-row.patch" ]]
grep -q 'pane_preferred_width = 80' "$root/herdr/config.toml"
grep -q 'previous_workspace = "alt+up"' "$root/herdr/config.toml"
grep -q 'next_workspace = "alt+down"' "$root/herdr/config.toml"
grep -q 'previous_tab = "alt+left"' "$root/herdr/config.toml"
grep -q 'next_tab = "alt+right"' "$root/herdr/config.toml"
grep -q '%h/.local/lib/qq/herdr/bin/herdr server' "$root/systemd/user/herdr.service"
grep -q '^ExitType=cgroup$' "$root/systemd/user/herdr.service"
grep -q '%h/.local/state/herdr/herdr.log' "$root/systemd/user/herdr.service"
[[ -x "$root/bin/qq-herdr-build" ]]
[[ -x "$root/bin/qq-herdr-activate" ]]
[[ -x "$root/bin/qq-herdr-upgrade" ]]
[[ -x "$root/bin/qq-herdr-pane-add" ]]
[[ -x "$root/bin/qq-herdr-smoke" ]]
[[ -x "$root/bin/qq-herdr-launch" ]]
[[ -x "$root/tests/test-herdr-live.sh" ]]
grep -q 'integration status --outdated-only' "$root/bin/qq-herdr-build"
grep -q 'refs/tags/qq-v' "$root/bin/qq-herdr-upgrade"
if grep -Eq 'git .*apply|HERDR_PATCHES' "$root/bin/qq-herdr-build" "$root/bin/qq-herdr-upgrade"; then
  echo 'retired QQ Rust patch flow returned' >&2
  exit 1
fi
grep -q -- 'ghostty --gtk-single-instance=true --title=herdr -e' "$root/bin/qq-herdr-launch"

ghostty_config="$root/ghostty/config"
[[ -s "$ghostty_config" ]]
grep -q '^fullscreen = true$' "$ghostty_config"
grep -q '^window-padding-x = 12$' "$ghostty_config"
grep -q '^title = herdr$' "$ghostty_config"
if grep -q '^window-padding-x = 480$' "$ghostty_config"; then
  echo 'retired Ghostty 4K box padding returned' >&2
  exit 1
fi
if grep -q '^custom-shader' "$ghostty_config"; then
  echo 'retired Ghostty edge-mask shader returned' >&2
  exit 1
fi
[[ ! -e "$root/ghostty/shaders/column-rails.glsl" ]]

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git init -q "$work/source"
git -C "$work/source" remote add origin "$HERDR_UPSTREAM_URL"
git -C "$work/source" fetch -q --depth 1 origin \
  "refs/tags/$HERDR_UPSTREAM_TAG:refs/tags/$HERDR_UPSTREAM_TAG"
tag_commit=$(git -C "$work/source" rev-list -n1 "$HERDR_UPSTREAM_TAG")
[[ "$tag_commit" == "$HERDR_UPSTREAM_COMMIT" ]]
git -C "$work/source" checkout -q --detach "$HERDR_UPSTREAM_COMMIT"
grep -Rqs --include='*.rs' 'pane_preferred_width' "$work/source/src"
grep -Rqs --include='*.rs' 'balance_horizontal_row' "$work/source/src"
[[ -z $(git -C "$work/source" status --porcelain) ]]

mock="$work/mock"
mkdir -p "$mock"
cat > "$mock/herdr" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$QQ_HERDR_TEST_ARGS"
EOF
chmod +x "$mock/herdr"
QQ_HERDR_TEST_ARGS="$work/args" QQ_HERDR_BIN="$mock/herdr" \
  "$root/bin/qq-herdr-pane-add" --current --cwd /tmp --no-focus
[[ "$(cat "$work/args")" == 'pane split --direction right --current --cwd /tmp --no-focus' ]]
QQ_HERDR_TEST_ARGS="$work/args" QQ_HERDR_BIN="$mock/herdr" \
  "$root/bin/qq-herdr-pane-add" --pane w2T:p1M --cwd /tmp --no-focus
[[ "$(cat "$work/args")" == 'pane split w2T:p1M --direction right --cwd /tmp --no-focus' ]]
if QQ_HERDR_BIN="$mock/herdr" "$root/bin/qq-herdr-pane-add" --ratio 0.5 >/dev/null 2>&1; then
  echo 'qq-herdr-pane-add accepted a forbidden ratio' >&2
  exit 1
fi

printf 'herdr downstream contract tests passed\n'
