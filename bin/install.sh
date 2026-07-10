#!/usr/bin/env bash
# Install qq's live Codex and cockpit surfaces from this checkout.
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

install_wip_hook() {
  local hooks="$HOME/.codex/hooks.json"
  local command="bash '$HOME/.codex/hooks/qq-wip-snapshot.sh'"

  mkdir -p "$(dirname "$hooks")"
  python3 - "$hooks" "$command" <<'PY'
import json
import os
import stat
import sys
import tempfile

path, command = sys.argv[1:]
data = {}
mode = 0o600
if os.path.islink(path):
    raise SystemExit(f"qq install: refusing symlinked hook config: {path}")
if os.path.exists(path):
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"qq install: refusing malformed {path}: {exc}")
    if not isinstance(data, dict):
        raise SystemExit(f"qq install: refusing non-object {path}")
    mode = stat.S_IMODE(os.stat(path).st_mode)

hooks = data.setdefault("hooks", {})
if not isinstance(hooks, dict):
    raise SystemExit(f"qq install: refusing non-object hooks in {path}")
stop = hooks.setdefault("Stop", [])
if not isinstance(stop, list):
    raise SystemExit(f"qq install: refusing non-list hooks.Stop in {path}")

matches = []
ambiguous = []
for entry in stop:
    if not isinstance(entry, dict):
        continue
    commands = entry.get("hooks")
    if not isinstance(commands, list):
        continue
    for hook in commands:
        if not isinstance(hook, dict):
            continue
        existing = str(hook.get("command", ""))
        if existing == command:
            matches.append(hook)
        elif "qq-wip-snapshot" in existing:
            ambiguous.append(existing)

if ambiguous:
    raise SystemExit(f"qq install: refusing unrecognized qq-wip-snapshot hook in {path}")
if len(matches) > 1:
    raise SystemExit(f"qq install: refusing duplicate qq-wip-snapshot hooks in {path}")
if matches:
    matches[0].update({"command": command, "timeout": 10, "type": "command"})
else:
    stop.append({"hooks": [{"command": command, "timeout": 10, "type": "command"}]})

parent = os.path.dirname(path)
fd, temporary = tempfile.mkstemp(prefix="hooks.", suffix=".json", dir=parent)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")
    os.chmod(temporary, mode)
    os.replace(temporary, path)
except BaseException:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    raise
PY
  printf 'ok: Codex WIP Stop hook\n'
}

link_one "$QQ/qq-methodology.md" "$HOME/.codex/AGENTS.md" "Codex methodology"
sync_skills
prune_removed_commands

link_one "$QQ/cockpit/yazi/yazi.toml" "$HOME/.config/yazi/yazi.toml" "cockpit/yazi.toml"
link_one "$QQ/cockpit/yazi/keymap.toml" "$HOME/.config/yazi/keymap.toml" "cockpit/yazi-keymap.toml"
link_one "$QQ/cockpit/glow/glow.yml" "$HOME/.config/glow/glow.yml" "cockpit/glow.yml"
link_one "$QQ/cockpit/glow/tuned.json" "$HOME/.config/glow/tuned.json" "cockpit/glow-theme.json"
link_one "$QQ/cockpit/herdr/config.toml" "$HOME/.config/herdr/config.toml" "cockpit/herdr.toml"
link_one "$QQ/cockpit/shell/file-navigation.bash" "$HOME/.config/shell/file-navigation.bash" "cockpit/file-navigation.bash"

link_one "$QQ/bin/qq-herdr-pull" "$HOME/.local/bin/qq-herdr-pull" "command/qq-herdr-pull"
link_one "$QQ/bin/qq-openwiki" "$HOME/.local/bin/qq-openwiki" "command/qq-openwiki"
link_one "$QQ/bin/qq-wip" "$HOME/.local/bin/qq-wip" "command/qq-wip"
link_one "$QQ/bin/qq-wip-snapshot.sh" "$HOME/.codex/hooks/qq-wip-snapshot.sh" "hook/qq-wip-snapshot.sh"
install_wip_hook

printf 'qq install: links complete\n'
printf 'qq install: confirm the WIP hook in a new Codex session with /hooks; Codex skips it until trusted.\n'
