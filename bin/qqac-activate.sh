#!/usr/bin/env bash
# qqac-activate — one-shot activation of the qq-ac setup.
#
#   Run ONCE:  bash /home/qqp/projects/qq-ac/bin/qqac-activate.sh
#
# What it does (idempotent; backs up every file it edits to *.qqac.bak):
#   1. herdr : install claude + codex integrations so herdr tracks agent state
#   2. Cockpit: symlink tuned terminal configs into ~/.config
#   3. Hooks : git rail (block destructive git) + wip savepoint (Stop) (~/.claude/hooks + settings.json)
#   4. Claude: yolo — permissions.defaultMode="bypassPermissions"  (~/.claude/settings.json)
#   5. Codex : yolo — approval_policy="never", sandbox_mode="danger-full-access" (~/.codex/config.toml)
#   6. Commit + push both repos (meeting-reviewer: qq-ac-layer files ONLY; your src/tests stay uncommitted)
#
# Safety: the rail is installed BEFORE yolo, so future Claude Code agents never get
# prompt-free git destruction — force-push / reset --hard / clean -fd / history
# rewrites are blocked at the hook layer even with permissions off. This script,
# run by YOU in a plain shell, is not intercepted by that hook, so its own push works.
set -euo pipefail

QQAC=/home/qqp/projects/qq-ac
MR=/home/qqp/projects/meeting-reviewer
say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
bak() { if [ -f "$1" ]; then cp -n "$1" "$1.qqac.bak" 2>/dev/null || true; fi; }

# set a top-level TOML key: replace in place if present, else prepend above any [section]
set_toml_top() {
  local k="$1" v="$2" f="$3"
  mkdir -p "$(dirname "$f")"; touch "$f"; bak "$f"
  if grep -qE "^[[:space:]]*${k}[[:space:]]*=" "$f"; then
    sed -i -E "s|^[[:space:]]*${k}[[:space:]]*=.*|${k} = $v|" "$f"
  else
    printf '%s = %s\n%s' "$k" "$v" "$(cat "$f")" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
}

say "1/6  herdr agent-state integrations (claude + codex)"
if command -v herdr >/dev/null 2>&1; then
  herdr integration install claude >/dev/null 2>&1 && echo "     herdr integration: claude" || echo "     herdr integration claude: skipped"
  herdr integration install codex  >/dev/null 2>&1 && echo "     herdr integration: codex"  || echo "     herdr integration codex: skipped"
else
  echo "     herdr not installed — run: brew install herdr"
fi

say "2/6  cockpit — symlink tuned configs (~/.config → $QQAC/cockpit)"
link_cfg() {  # $1 = repo-relative source, $2 = ~/.config dest
  local src="$QQAC/$1" dst="$HOME/.config/$2"
  mkdir -p "$(dirname "$dst")"
  if [ -L "$dst" ] && [ "$(readlink -f "$dst")" = "$(readlink -f "$src")" ]; then
    echo "     ok (already linked): $2"; return
  fi
  [ -e "$dst" ] && ! [ -L "$dst" ] && cp -a "$dst" "$dst.qqac.bak" && echo "     backed up $2 → $2.qqac.bak"
  ln -sfn "$src" "$dst" && echo "     linked $2 → $1"
}
link_cfg cockpit/yazi/yazi.toml            yazi/yazi.toml
link_cfg cockpit/yazi/keymap.toml          yazi/keymap.toml
link_cfg cockpit/glow/glow.yml             glow/glow.yml
link_cfg cockpit/glow/tuned.json           glow/tuned.json
link_cfg cockpit/herdr/config.toml         herdr/config.toml
link_cfg cockpit/shell/file-navigation.bash shell/file-navigation.bash

say "3/6  global hooks (git rail + wip savepoint)"
mkdir -p "$HOME/.claude/hooks"
cp "$QQAC/skills/git-guardrails-claude-code/scripts/block-dangerous-git.sh" "$HOME/.claude/hooks/block-dangerous-git.sh"
chmod +x "$HOME/.claude/hooks/block-dangerous-git.sh"
echo "     installed ~/.claude/hooks/block-dangerous-git.sh"
ln -sfn "$QQAC/bin/qq-wip-snapshot.sh" "$HOME/.claude/hooks/qq-wip-snapshot.sh"
mkdir -p "$HOME/.local/bin"; ln -sfn "$QQAC/bin/qq-wip" "$HOME/.local/bin/qq-wip"
echo "     linked wip savepoint + qq-wip (recover: qq-wip list|diff|branch <name>)"

say "4/6  Claude Code yolo + wire the rail into ~/.claude/settings.json"
bak "$HOME/.claude/settings.json"
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.claude/settings.json")
d = {}
if os.path.exists(p):
    try: d = json.load(open(p))
    except Exception: d = {}
d.setdefault("permissions", {})["defaultMode"] = "bypassPermissions"
hook = os.path.expanduser("~/.claude/hooks/block-dangerous-git.sh")
arr = d.setdefault("hooks", {}).setdefault("PreToolUse", [])
present = any(e.get("matcher") == "Bash" and any(x.get("command", "").endswith("block-dangerous-git.sh") for x in e.get("hooks", [])) for e in arr)
if not present:
    arr.append({"matcher": "Bash", "hooks": [{"type": "command", "command": hook}]})
wip = os.path.expanduser("~/.claude/hooks/qq-wip-snapshot.sh")
stop = d.setdefault("hooks", {}).setdefault("Stop", [])
if not any(any("qq-wip-snapshot" in x.get("command", "") for x in e.get("hooks", [])) for e in stop):
    stop.append({"hooks": [{"type": "command", "command": wip}]})
json.dump(d, open(p, "w"), indent=2)
print("     bypassPermissions + PreToolUse rail + Stop wip savepoint wired")
PY

say "5/6  Codex yolo -> ~/.codex/config.toml"
set_toml_top approval_policy '"never"' "$HOME/.codex/config.toml"
set_toml_top sandbox_mode '"danger-full-access"' "$HOME/.codex/config.toml"
echo "     approval_policy=never, sandbox_mode=danger-full-access"

say "6/6  commit + push both repos"
git -C "$QQAC" add -A
git -C "$QQAC" commit -q -m "qq-ac: curated 15-skill system, rules, knowledge + session layers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" && echo "     qq-ac committed" || echo "     qq-ac: nothing to commit"
git -C "$QQAC" push origin main && echo "     qq-ac pushed" || echo "     qq-ac push FAILED — pull/rebase then retry"

# meeting-reviewer: stage ONLY the qq-ac layer; your src/tests WIP is left untouched
git -C "$MR" add AGENTS.md CLAUDE.md .mcp.json CONCEPTS.md SKILLS-ATTRIBUTION.md docs/solutions .claude/skills
git -C "$MR" commit -q -m "adopt qq-ac: rules + 15 skills + Context7

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" && echo "     meeting-reviewer committed (qq-ac layer only)" || echo "     meeting-reviewer: nothing to commit"
git -C "$MR" push origin main && echo "     meeting-reviewer pushed" || echo "     meeting-reviewer push FAILED — pull/rebase then retry"

say "done"
cat <<'EOF'
  qq-ac is active. Notes:
   - Restart Claude Code (or open a new session) so yolo + the rail load.
   - The rail blocks destructive git only (force-push, reset --hard, clean -f, history rewrites); normal `git push` is allowed, so agents push for you.
   - Backups of every edited config sit beside them as *.qqac.bak.
   - Codex now defaults to yolo; just run `codex`.
EOF
