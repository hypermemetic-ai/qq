#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-install-cleanup"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
INSTALLER="$ROOT/bin/install.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
original_path="$PATH"
fake_bin="$tmp/bin"
install_log="$tmp/install.log"
mkdir -p "$fake_bin"

cat >"$fake_bin/update-desktop-database" <<'EOF'
#!/usr/bin/env bash
printf 'update-desktop-database %s\n' "$*" >>"$INSTALL_LOG"
EOF
chmod +x "$fake_bin/update-desktop-database"
export INSTALL_LOG="$install_log"

write_managed_desktop() {
  local data_home="$1"

  mkdir -p "$data_home/applications"
  printf '%s\n' \
    '[Desktop Entry]' \
    'Type=Application' \
    'X-qq-managed=true' >"$data_home/applications/qq-openwiki-activate.desktop"
}

run_installer() {
  local home="$1"
  local config_home="$2"
  local data_home="$3"
  local output="$4"

  : >"$install_log"
  if ! HOME="$home" \
    XDG_CONFIG_HOME="$config_home" \
    XDG_DATA_HOME="$data_home" \
    PATH="$fake_bin:$original_path" \
      bash "$INSTALLER" >"$output" 2>&1; then
    sed 's/^/installer: /' "$output" >&2
    fail "installer failed for isolated HOME: $home"
  fi
}

relative_root="$tmp/relative"
relative_cwd="$relative_root/cwd"
relative_home="$relative_root/home"
relative_data="$relative_root/data"
relative_config="$relative_cwd/relative-config"
mkdir -p "$relative_cwd" "$relative_home" "$relative_config"
write_managed_desktop "$relative_data"
printf '%s\n' \
  '[Default Applications]' \
  'x-scheme-handler/qq-openwiki=qq-openwiki-activate.desktop;' \
  >"$relative_config/mimeapps.list"
cp "$relative_config/mimeapps.list" "$relative_root/expected-mimeapps.list"
cp "$relative_data/applications/qq-openwiki-activate.desktop" \
  "$relative_root/expected-desktop"
: >"$install_log"

if (
  cd "$relative_cwd"
  HOME="$relative_home" \
  XDG_CONFIG_HOME=relative-config \
  XDG_DATA_HOME="$relative_data" \
  PATH="$fake_bin:$original_path" \
    bash "$INSTALLER"
) >"$relative_root/install.out" 2>&1; then
  fail 'installer accepted a relative XDG_CONFIG_HOME'
fi
assert_contains "$(<"$relative_root/install.out")" \
  'XDG_CONFIG_HOME must be an absolute path'
cmp -s "$relative_root/expected-mimeapps.list" "$relative_config/mimeapps.list" || \
  fail 'relative XDG_CONFIG_HOME changed its MIME file before refusal'
cmp -s "$relative_root/expected-desktop" \
  "$relative_data/applications/qq-openwiki-activate.desktop" || \
  fail 'relative XDG_CONFIG_HOME changed the managed desktop before refusal'
[ -z "$(find "$relative_home" -mindepth 1 -print -quit)" ] || \
  fail 'relative XDG_CONFIG_HOME changed the isolated HOME before refusal'
[ ! -s "$install_log" ] || \
  fail 'relative XDG_CONFIG_HOME invoked an installer dependency before refusal'

unchanged_root="$tmp/unchanged"
unchanged_home="$unchanged_root/home"
unchanged_config="$unchanged_root/config"
unchanged_data="$unchanged_root/data"
mkdir -p "$unchanged_home" "$unchanged_config"
write_managed_desktop "$unchanged_data"
printf '[Default Applications]\ntext/plain=keep.desktop;' \
  >"$unchanged_config/mimeapps.list"
cp "$unchanged_config/mimeapps.list" "$unchanged_root/expected-mimeapps.list"
unchanged_inode="$(stat -c '%d:%i' "$unchanged_config/mimeapps.list")"
run_installer \
  "$unchanged_home" \
  "$unchanged_config" \
  "$unchanged_data" \
  "$unchanged_root/install.out"
cmp -s "$unchanged_root/expected-mimeapps.list" "$unchanged_config/mimeapps.list" || \
  fail 'MIME file without the retired handler changed bytes'
assert_equal "$unchanged_inode" \
  "$(stat -c '%d:%i' "$unchanged_config/mimeapps.list")" \
  'MIME file without the retired handler was replaced'

surgical_root="$tmp/surgical"
surgical_home="$surgical_root/home"
surgical_config="$surgical_root/config"
surgical_data="$surgical_root/data"
mkdir -p \
  "$surgical_home/.local/bin" \
  "$surgical_config" \
  "$surgical_data/qq"
write_managed_desktop "$surgical_data"
ln -s "$ROOT/bin/qq-openwiki-activate.py" \
  "$surgical_home/.local/bin/qq-openwiki-activate"
ln -s "$ROOT/browser/openwiki-merge-activator.user.js" \
  "$surgical_data/qq/openwiki-merge-activator.user.js"
printf '%s\n' \
  '[Default Applications]' \
  'text/plain=keep.desktop;' >"$surgical_config/mimeapps.list"
printf '%s' \
  'x-scheme-handler/qq-openwiki=left.desktop;;qq-openwiki-activate.desktop;right.desktop;' \
  >>"$surgical_config/mimeapps.list"
printf '%s\n' \
  '[Default Applications]' \
  'text/plain=keep.desktop;' >"$surgical_root/expected-mimeapps.list"
printf '%s' \
  'x-scheme-handler/qq-openwiki=left.desktop;;right.desktop;' \
  >>"$surgical_root/expected-mimeapps.list"
printf '%s\n' \
  '[Added Associations]' \
  'x-scheme-handler/qq-openwiki=qq-openwiki-activate.desktop;fallback.desktop;' \
  >"$surgical_data/applications/mimeapps.list"
printf '%s\n' \
  '[Added Associations]' \
  'x-scheme-handler/qq-openwiki=fallback.desktop;' \
  >"$surgical_root/expected-data-mimeapps.list"
run_installer \
  "$surgical_home" \
  "$surgical_config" \
  "$surgical_data" \
  "$surgical_root/install.out"
cmp -s "$surgical_root/expected-mimeapps.list" "$surgical_config/mimeapps.list" || \
  fail 'MIME handler removal did not preserve empty segments and separators'
cmp -s "$surgical_root/expected-data-mimeapps.list" \
  "$surgical_data/applications/mimeapps.list" || \
  fail 'data-home MIME handler removal did not preserve its final newline'
[ ! -L "$surgical_home/.local/bin/qq-openwiki-activate" ] || \
  fail 'retired OpenWiki activation command link was not pruned'
[ ! -L "$surgical_data/qq/openwiki-merge-activator.user.js" ] || \
  fail 'retired OpenWiki userscript link was not pruned'

unmanaged_root="$tmp/unmanaged"
unmanaged_home="$unmanaged_root/home"
unmanaged_config="$unmanaged_root/config"
unmanaged_data="$unmanaged_root/data"
external="$unmanaged_root/external-artifact"
mkdir -p \
  "$unmanaged_home/.local/bin" \
  "$unmanaged_config" \
  "$unmanaged_data/applications" \
  "$unmanaged_data/qq"
printf 'external\n' >"$external"
ln -s "$external" "$unmanaged_home/.local/bin/qq-openwiki-activate"
ln -s "$external" "$unmanaged_data/qq/openwiki-merge-activator.user.js"
printf 'unmanaged\n' >"$unmanaged_data/applications/qq-openwiki-activate.desktop"
printf '%s\n' \
  '[Default Applications]' \
  'x-scheme-handler/qq-openwiki=qq-openwiki-activate.desktop;' \
  >"$unmanaged_config/mimeapps.list"
cp "$unmanaged_data/applications/qq-openwiki-activate.desktop" \
  "$unmanaged_root/expected-desktop"
cp "$unmanaged_config/mimeapps.list" "$unmanaged_root/expected-mimeapps.list"
run_installer \
  "$unmanaged_home" \
  "$unmanaged_config" \
  "$unmanaged_data" \
  "$unmanaged_root/install.out"
cmp -s "$unmanaged_root/expected-desktop" \
  "$unmanaged_data/applications/qq-openwiki-activate.desktop" || \
  fail 'installer changed an unmanaged desktop entry'
cmp -s "$unmanaged_root/expected-mimeapps.list" "$unmanaged_config/mimeapps.list" || \
  fail 'installer changed MIME state owned by an unmanaged desktop entry'
assert_equal "$external" "$(readlink "$unmanaged_home/.local/bin/qq-openwiki-activate")" \
  'installer changed an unmanaged command link'
assert_equal "$external" \
  "$(readlink "$unmanaged_data/qq/openwiki-merge-activator.user.js")" \
  'installer changed an unmanaged userscript link'

empty_root="$tmp/empty-config"
empty_home="$empty_root/home"
empty_data="$empty_root/data"
mkdir -p "$empty_home/.config"
write_managed_desktop "$empty_data"
printf '%s\n' \
  '[Default Applications]' \
  'x-scheme-handler/qq-openwiki=qq-openwiki-activate.desktop;' \
  >"$empty_home/.config/mimeapps.list"
run_installer "$empty_home" "" "$empty_data" "$empty_root/install.out"
assert_not_contains "$(<"$empty_root/install.out")" \
  'XDG_CONFIG_HOME must be an absolute path' \
  'empty XDG_CONFIG_HOME was refused instead of treated as unset'
if grep -Fq 'qq-openwiki-activate.desktop' "$empty_home/.config/mimeapps.list"; then
  fail 'empty XDG_CONFIG_HOME did not fall back to ~/.config for cleanup'
fi
[ ! -e "$empty_data/applications/qq-openwiki-activate.desktop" ] || \
  fail 'empty XDG_CONFIG_HOME left the managed desktop entry'

printf 'test-install-cleanup: pass\n'
