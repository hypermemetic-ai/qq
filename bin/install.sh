#!/usr/bin/env bash
# Install qq's live Skills, cockpit, and commands from this checkout.
set -euo pipefail

QQ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
QQ_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"

die() {
  printf 'qq install: %s\n' "$*" >&2
  exit 1
}

case "$QQ_DATA_HOME" in
  /*) ;;
  *) die "XDG_DATA_HOME must be an absolute path" ;;
esac

resolved_path() {
  readlink -f "$1" 2>/dev/null || true
}

link_one() {
  local src="$1"
  local dst="$2"
  local label="$3"

  [ -e "$src" ] || die "missing source for $label: $src"
  mkdir -p "$(dirname "$dst")"

  if [ -L "$dst" ]; then
    if [ "$(resolved_path "$dst")" = "$(resolved_path "$src")" ]; then
      printf 'ok: %s\n' "$label"
      return
    fi
    die "refusing to replace unmanaged symlink: $dst -> $(readlink "$dst")"
  fi
  [ ! -e "$dst" ] || die "refusing to replace unmanaged path: $dst"

  ln -s "$src" "$dst"
  printf 'linked: %s\n' "$label"
}

sync_skills() {
  local dst="$1"
  local link skill name

  mkdir -p "$dst"
  for link in "$dst"/*; do
    [ -L "$link" ] || continue
    case "$(readlink "$link")" in
      "$QQ"/skills/*)
        if [ ! -e "$link" ]; then
          rm "$link"
          printf 'pruned: skill/%s\n' "$(basename "$link")"
        fi
        ;;
    esac
  done

  for skill in "$QQ"/skills/*; do
    [ -f "$skill/SKILL.md" ] || continue
    name="$(basename "$skill")"
    link_one "$skill" "$dst/$name" "skill/$name"
  done
}

prune_removed_commands() {
  local dst="$HOME/.local/bin"
  local link

  mkdir -p "$dst"
  for link in "$dst"/*; do
    [ -L "$link" ] || continue
    case "$(readlink "$link")" in
      "$QQ"/bin/*)
        if [ ! -e "$link" ]; then
          rm "$link"
          printf 'pruned: command/%s\n' "$(basename "$link")"
        fi
        ;;
    esac
  done
}

install_openwiki_activation_handler() {
  local applications="$QQ_DATA_HOME/applications"
  local desktop="$applications/qq-openwiki-activate.desktop"
  local command_path="$HOME/.local/bin/qq-openwiki-activate"
  local escaped_command temporary

  command -v xdg-mime >/dev/null 2>&1 || die "xdg-mime is required for the OpenWiki activation handler"
  mkdir -p "$applications"
  [ ! -L "$desktop" ] || die "refusing symlinked desktop entry: $desktop"
  if [ -e "$desktop" ] && ! grep -Fxq 'X-qq-managed=true' "$desktop"; then
    die "refusing to replace unmanaged desktop entry: $desktop"
  fi

  escaped_command="${command_path//\\/\\\\}"
  escaped_command="${escaped_command//\"/\\\"}"
  escaped_command="${escaped_command//\`/\\\`}"
  escaped_command="${escaped_command//\$/\\\$}"
  temporary="$(mktemp "$applications/.qq-openwiki-activate.desktop.XXXXXX")"
  trap 'rm -f "$temporary"' RETURN
  printf '%s\n' \
    '[Desktop Entry]' \
    'Type=Application' \
    'Name=qq OpenWiki Activator' \
    'NoDisplay=true' \
    'Terminal=false' \
    "Exec=\"$escaped_command\" %u" \
    'MimeType=x-scheme-handler/qq-openwiki;' \
    'X-qq-managed=true' >"$temporary"
  chmod 0644 "$temporary"
  mv -f "$temporary" "$desktop"
  trap - RETURN

  xdg-mime default qq-openwiki-activate.desktop x-scheme-handler/qq-openwiki
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$applications"
  fi
  printf 'installed: qq-openwiki:// activation handler\n'
}

install_bpmn_pipeline() {
  local pipeline="$QQ/tools/bpmn-pipeline"

  command -v npm >/dev/null 2>&1 || die "npm is required for the bundled BPMN pipeline"
  npm ci --prefix "$pipeline" --no-audit --no-fund
  printf 'installed: locked BPMN pipeline dependencies\n'
}

install_bpmn_pipeline
sync_skills "$HOME/.codex/skills"
sync_skills "$HOME/.claude/skills"
prune_removed_commands

link_one "$QQ/cockpit/yazi/yazi.toml" "$HOME/.config/yazi/yazi.toml" "cockpit/yazi.toml"
link_one "$QQ/cockpit/yazi/keymap.toml" "$HOME/.config/yazi/keymap.toml" "cockpit/yazi-keymap.toml"
link_one "$QQ/cockpit/yazi/plugins/smart-enter.yazi/main.lua" "$HOME/.config/yazi/plugins/smart-enter.yazi/main.lua" "cockpit/yazi-smart-enter.lua"
link_one "$QQ/cockpit/glow/glow.yml" "$HOME/.config/glow/glow.yml" "cockpit/glow.yml"
link_one "$QQ/cockpit/glow/tuned.json" "$HOME/.config/glow/tuned.json" "cockpit/glow-theme.json"
link_one "$QQ/cockpit/herdr/config.toml" "$HOME/.config/herdr/config.toml" "cockpit/herdr.toml"
link_one "$QQ/cockpit/shell/file-navigation.bash" "$HOME/.config/shell/file-navigation.bash" "cockpit/file-navigation.bash"

link_one "$QQ/bin/qq-herdr-home" "$HOME/.local/bin/qq-herdr-home" "command/qq-herdr-home"
link_one "$QQ/bin/qq-herdr-pull" "$HOME/.local/bin/qq-herdr-pull" "command/qq-herdr-pull"
link_one "$QQ/bin/qq-openwiki" "$HOME/.local/bin/qq-openwiki" "command/qq-openwiki"
link_one "$QQ/bin/qq-openwiki-bpmn" "$HOME/.local/bin/qq-openwiki-bpmn" "command/qq-openwiki-bpmn"
link_one "$QQ/bin/qq-openwiki-activate.py" "$HOME/.local/bin/qq-openwiki-activate" "command/qq-openwiki-activate"
link_one "$QQ/browser/openwiki-merge-activator.user.js" "$QQ_DATA_HOME/qq/openwiki-merge-activator.user.js" "browser/openwiki-merge-activator.user.js"

install_openwiki_activation_handler

printf 'qq install: links complete\n'
printf 'Tampermonkey userscript: https://raw.githubusercontent.com/hypermemetic-ai/qq/main/browser/openwiki-merge-activator.user.js\n'
