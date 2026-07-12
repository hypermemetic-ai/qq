#!/usr/bin/env bash
# Install qq's live Skills, cockpit, and commands from this checkout.
set -euo pipefail

QQ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

die() {
  printf 'qq install: %s\n' "$*" >&2
  exit 1
}

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
  local dst="$HOME/.codex/skills"
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

sync_skills
prune_removed_commands

link_one "$QQ/cockpit/yazi/yazi.toml" "$HOME/.config/yazi/yazi.toml" "cockpit/yazi.toml"
link_one "$QQ/cockpit/yazi/keymap.toml" "$HOME/.config/yazi/keymap.toml" "cockpit/yazi-keymap.toml"
link_one "$QQ/cockpit/yazi/plugins/smart-enter.yazi/main.lua" "$HOME/.config/yazi/plugins/smart-enter.yazi/main.lua" "cockpit/yazi-smart-enter.lua"
link_one "$QQ/cockpit/glow/glow.yml" "$HOME/.config/glow/glow.yml" "cockpit/glow.yml"
link_one "$QQ/cockpit/glow/tuned.json" "$HOME/.config/glow/tuned.json" "cockpit/glow-theme.json"
link_one "$QQ/cockpit/herdr/config.toml" "$HOME/.config/herdr/config.toml" "cockpit/herdr.toml"
link_one "$QQ/cockpit/shell/file-navigation.bash" "$HOME/.config/shell/file-navigation.bash" "cockpit/file-navigation.bash"

link_one "$QQ/bin/qq-herdr-pull" "$HOME/.local/bin/qq-herdr-pull" "command/qq-herdr-pull"
link_one "$QQ/bin/qq-openwiki" "$HOME/.local/bin/qq-openwiki" "command/qq-openwiki"

printf 'qq install: links complete\n'
