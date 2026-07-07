#!/usr/bin/env bash
# qq-activate — one-shot activation of the qq setup.
#
#   Run ONCE:  bash /home/qqp/projects/qq/bin/qq-activate.sh
#
# What it does (idempotent; backs up every file it edits to *.qq.bak):
#   Links live qq assets instead of copying snapshots; the qq plugin is dropped.
#   1. herdr : install claude + codex integrations so herdr tracks agent state
#   2. Cockpit: symlink tuned terminal configs into ~/.config
#   3. Skills : symlink qq skills into ~/.claude/skills
#   4. Hooks : git rail (block destructive git) + wip savepoint (Stop) (~/.claude/hooks + settings.json)
#   5. Claude: yolo — permissions.defaultMode="bypassPermissions"  (~/.claude/settings.json)
#   6. Codex : yolo — approval_policy="never", sandbox_mode="danger-full-access" (~/.codex/config.toml)
#   7. Commit + push both repos (meeting-reviewer: qq link artifacts ONLY; your src/tests stay uncommitted)
#
# Safety: the rail is installed BEFORE yolo, so future Claude Code agents never get
# prompt-free git destruction — force-push / reset --hard / clean -fd / history
# rewrites are blocked at the hook layer even with permissions off. This script,
# run by YOU in a plain shell, is not intercepted by that hook, so its own push works.
set -euo pipefail

QQ=/home/qqp/projects/qq
MR=/home/qqp/projects/meeting-reviewer
say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
bak() { if [ -f "$1" ]; then cp -n "$1" "$1.qq.bak" 2>/dev/null || true; fi; }

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

say "1/7  herdr agent-state integrations (claude + codex)"
if command -v herdr >/dev/null 2>&1; then
  herdr integration install claude >/dev/null 2>&1 && echo "     herdr integration: claude" || echo "     herdr integration claude: skipped"
  herdr integration install codex  >/dev/null 2>&1 && echo "     herdr integration: codex"  || echo "     herdr integration codex: skipped"
else
  echo "     herdr not installed — run: brew install herdr"
fi

say "2/7  cockpit — symlink tuned configs (~/.config → $QQ/cockpit)"
link_cfg() {  # $1 = repo-relative source, $2 = ~/.config dest
  local src="$QQ/$1" dst="$HOME/.config/$2"
  mkdir -p "$(dirname "$dst")"
  if [ -L "$dst" ] && [ "$(readlink -f "$dst")" = "$(readlink -f "$src")" ]; then
    echo "     ok (already linked): $2"; return
  fi
  [ -e "$dst" ] && ! [ -L "$dst" ] && cp -a "$dst" "$dst.qq.bak" && echo "     backed up $2 → $2.qq.bak"
  ln -sfn "$src" "$dst" && echo "     linked $2 → $1"
}
link_cfg cockpit/yazi/yazi.toml            yazi/yazi.toml
link_cfg cockpit/yazi/keymap.toml          yazi/keymap.toml
link_cfg cockpit/glow/glow.yml             glow/glow.yml
link_cfg cockpit/glow/tuned.json           glow/tuned.json
link_cfg cockpit/herdr/config.toml         herdr/config.toml
link_cfg cockpit/shell/file-navigation.bash shell/file-navigation.bash

say "3/7  skills — symlink qq skills into ~/.claude/skills"
bash "$QQ/bin/qq-link.sh" skills

say "4/7  global hooks (git rail + wip savepoint)"
mkdir -p "$HOME/.claude/hooks"
cp "$QQ/skills/git-guardrails-claude-code/scripts/block-dangerous-git.sh" "$HOME/.claude/hooks/block-dangerous-git.sh"
chmod +x "$HOME/.claude/hooks/block-dangerous-git.sh"
echo "     installed ~/.claude/hooks/block-dangerous-git.sh"
ln -sfn "$QQ/bin/qq-wip-snapshot.sh" "$HOME/.claude/hooks/qq-wip-snapshot.sh"
mkdir -p "$HOME/.local/bin"; ln -sfn "$QQ/bin/qq-wip" "$HOME/.local/bin/qq-wip"
ln -sfn "$QQ/bin/qq-herdr-pull" "$HOME/.local/bin/qq-herdr-pull"
echo "     linked wip savepoint + qq-wip (recover: qq-wip list|diff|branch <name>)"
echo "     linked qq-herdr-pull (prefix+F<N> pulls agent N into the focused pane)"

say "5/7  Claude Code yolo + wire the rail + status line into ~/.claude/settings.json"
bak "$HOME/.claude/settings.json"
QQ_STATUSLINE="$QQ/bin/qq-phase render" python3 - <<'PY'
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
d["statusLine"] = {"type": "command", "command": os.environ["QQ_STATUSLINE"], "padding": 0}
json.dump(d, open(p, "w"), indent=2)
print("     bypassPermissions + PreToolUse rail + Stop wip savepoint + status line wired")
PY

say "6/7  Codex yolo -> ~/.codex/config.toml"
set_toml_top approval_policy '"never"' "$HOME/.codex/config.toml"
set_toml_top sandbox_mode '"danger-full-access"' "$HOME/.codex/config.toml"
echo "     approval_policy=never, sandbox_mode=danger-full-access"

say "7/7  commit + push both repos"
git -C "$QQ" add -A
git -C "$QQ" commit -q -m "curate qq linked methodology, skills, knowledge and sessions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" && echo "     qq committed" || echo "     qq: nothing to commit"
git -C "$QQ" push origin main && echo "     qq pushed" || echo "     qq push FAILED — pull/rebase then retry"

# meeting-reviewer: stage ONLY the qq link artifacts; your src/tests WIP is left untouched
bash "$QQ/bin/qq-link.sh" repo "$MR"
git -C "$MR" add AGENTS.md .claude/qq-methodology.md .mcp.json CONCEPTS.md
git -C "$MR" commit -q -m "adopt qq linked rules, skills and Context7

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" && echo "     meeting-reviewer committed (qq layer only)" || echo "     meeting-reviewer: nothing to commit"
git -C "$MR" push origin main && echo "     meeting-reviewer pushed" || echo "     meeting-reviewer push FAILED — pull/rebase then retry"

say "done"
cat <<'EOF'
  qq is active. Notes:
   - Restart Claude Code (or open a new session) so yolo + the rail load.
   - The rail blocks destructive git only (force-push, reset --hard, clean -f, history rewrites); normal `git push` is allowed, so agents push for you.
   - Backups of every edited config sit beside them as *.qq.bak.
   - Codex now defaults to yolo; just run `codex`.
EOF
