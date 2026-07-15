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

if [ -n "${XDG_CONFIG_HOME:-}" ]; then
  case "$XDG_CONFIG_HOME" in
    /*) ;;
    *) die "XDG_CONFIG_HOME must be an absolute path" ;;
  esac
fi
QQ_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"

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

remove_openwiki_mime_registration() {
  local mimeapps="$1"
  local final_newline=0
  local temporary

  [ -f "$mimeapps" ] || return 0
  [ ! -L "$mimeapps" ] || return 0
  grep -Fq 'qq-openwiki-activate.desktop' "$mimeapps" || return 0

  if [ -s "$mimeapps" ] &&
      [ "$(tail -c 1 "$mimeapps" | od -An -t u1 | tr -d '[:space:]')" = 10 ]; then
    final_newline=1
  fi

  temporary="$(mktemp "$(dirname "$mimeapps")/.mimeapps.list.XXXXXX")"
  if ! awk \
    -v mimetype='x-scheme-handler/qq-openwiki' \
    -v application='qq-openwiki-activate.desktop' \
    -v final_newline="$final_newline" '
      BEGIN {
        prefix = mimetype "="
        section = ""
        records = 0
      }
      {
        line = $0
        comparable = line
        sub(/\r$/, "", comparable)
        if (comparable ~ /^\[/) {
          section = comparable
        } else if ((section == "[Default Applications]" ||
                    section == "[Added Associations]") && index(line, prefix) == 1) {
          value = substr(line, length(prefix) + 1)
          carriage_return = ""
          if (substr(value, length(value), 1) == "\r") {
            carriage_return = "\r"
            value = substr(value, 1, length(value) - 1)
          }

          count = 0
          remaining = value
          while ((separator = index(remaining, ";")) != 0) {
            entries[++count] = substr(remaining, 1, separator - 1)
            remaining = substr(remaining, separator + 1)
          }
          entries[++count] = remaining

          kept = 0
          removed = 0
          output = ""
          for (i = 1; i <= count; i++) {
            if (entries[i] == application) {
              removed = 1
            } else {
              output = output (kept ? ";" : "") entries[i]
              kept++
            }
          }
          if (removed) {
            if (substr(value, length(value), 1) == ";" &&
              substr(output, length(output), 1) != ";") {
              output = output ";"
            }
            line = prefix output carriage_return
          }
        }

        if (records++) {
          printf "\n"
        }
        printf "%s", line
      }
      END {
        if (final_newline) {
          printf "\n"
        }
      }
    ' "$mimeapps" >"$temporary"; then
    rm -f "$temporary"
    die "could not remove retired OpenWiki MIME registration from $mimeapps"
  fi

  chmod --reference="$mimeapps" "$temporary"
  if cmp -s "$mimeapps" "$temporary"; then
    rm -f "$temporary"
  else
    mv -f "$temporary" "$mimeapps"
    printf 'pruned: desktop/OpenWiki MIME registration\n'
  fi
}

cleanup_openwiki_activation_handler() {
  local applications="$QQ_DATA_HOME/applications"
  local desktop="$applications/qq-openwiki-activate.desktop"

  if [ -f "$desktop" ] && [ ! -L "$desktop" ] &&
      grep -Fxq 'X-qq-managed=true' "$desktop"; then
    remove_openwiki_mime_registration "$QQ_CONFIG_HOME/mimeapps.list"
    remove_openwiki_mime_registration "$applications/mimeapps.list"
    rm "$desktop"
    printf 'pruned: desktop/qq-openwiki-activate.desktop\n'
    if command -v update-desktop-database >/dev/null 2>&1; then
      update-desktop-database "$applications"
    fi
  fi
}

prune_removed_openwiki_links() {
  local link="$QQ_DATA_HOME/qq/openwiki-merge-activator.user.js"

  if [ -L "$link" ] &&
      [ "$(readlink "$link")" = "$QQ/browser/openwiki-merge-activator.user.js" ] &&
      [ ! -e "$link" ]; then
    rm "$link"
    printf 'pruned: browser/openwiki-merge-activator.user.js\n'
  fi
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
cleanup_openwiki_activation_handler
prune_removed_commands
prune_removed_openwiki_links

link_one "$QQ/cockpit/yazi/yazi.toml" "$HOME/.config/yazi/yazi.toml" "cockpit/yazi.toml"
link_one "$QQ/cockpit/yazi/keymap.toml" "$HOME/.config/yazi/keymap.toml" "cockpit/yazi-keymap.toml"
link_one "$QQ/cockpit/yazi/plugins/smart-enter.yazi/main.lua" "$HOME/.config/yazi/plugins/smart-enter.yazi/main.lua" "cockpit/yazi-smart-enter.lua"
link_one "$QQ/cockpit/glow/glow.yml" "$HOME/.config/glow/glow.yml" "cockpit/glow.yml"
link_one "$QQ/cockpit/glow/tuned.json" "$HOME/.config/glow/tuned.json" "cockpit/glow-theme.json"
link_one "$QQ/cockpit/herdr/config.toml" "$HOME/.config/herdr/config.toml" "cockpit/herdr.toml"
link_one "$QQ/cockpit/shell/file-navigation.bash" "$HOME/.config/shell/file-navigation.bash" "cockpit/file-navigation.bash"

link_one "$QQ/bin/qq-herdr-home" "$HOME/.local/bin/qq-herdr-home" "command/qq-herdr-home"
link_one "$QQ/bin/qq-herdr-pull" "$HOME/.local/bin/qq-herdr-pull" "command/qq-herdr-pull"
link_one "$QQ/bin/qq-herdr-snap" "$HOME/.local/bin/qq-herdr-snap" "command/qq-herdr-snap"
link_one "$QQ/bin/qq-openwiki" "$HOME/.local/bin/qq-openwiki" "command/qq-openwiki"
link_one "$QQ/bin/qq-openwiki-bpmn" "$HOME/.local/bin/qq-openwiki-bpmn" "command/qq-openwiki-bpmn"

printf 'qq install: links complete\n'
