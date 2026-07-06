#!/usr/bin/env bash
# hypercore-activate — one-shot activation of the hypercore setup.
#
#   Run ONCE:  bash /home/qqp/projects/hypercore/bin/hypercore-activate.sh
#
# What it does (idempotent; backs up every file it edits to *.hypercore.bak):
#   1. herdr : install claude + codex integrations so herdr tracks agent state
#   2. Hooks : git rail (block destructive git) + wip savepoint (Stop) (~/.claude/hooks + settings.json)
#   3. Claude: yolo — permissions.defaultMode="bypassPermissions"  (~/.claude/settings.json)
#   4. Codex : yolo — approval_policy="never", sandbox_mode="danger-full-access" (~/.codex/config.toml)
#   5. Commit + push both repos (meeting-reviewer: hypercore-layer files ONLY; your src/tests stay uncommitted)
#
# Safety: the rail is installed BEFORE yolo, so future Claude Code agents never get
# prompt-free git destruction — force-push / reset --hard / clean -fd / history
# rewrites are blocked at the hook layer even with permissions off. This script,
# run by YOU in a plain shell, is not intercepted by that hook, so its own push works.
set -euo pipefail

HC=/home/qqp/projects/hypercore
MR=/home/qqp/projects/meeting-reviewer
say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
bak() { [ -f "$1" ] && cp -n "$1" "$1.hypercore.bak" 2>/dev/null || true; }

# set a top-level TOML key: replace in place if present, else prepend above any [section]
set_toml_top() {
  local k="$1" v="$2" f="$3"
  mkdir -p "$(dirname "$f")"; touch "$f"; bak "$f"
  if grep -qE "^[[:space:]]*$k[[:space:]]*=" "$f"; then
    sed -i -E "s|^[[:space:]]*$k[[:space:]]*=.*|$k = $v|" "$f"
  else
    printf '%s = %s\n%s' "$k" "$v" "$(cat "$f")" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
}

say "1/5  herdr agent-state integrations (claude + codex)"
if command -v herdr >/dev/null 2>&1; then
  herdr integration install claude >/dev/null 2>&1 && echo "     herdr integration: claude" || echo "     herdr integration claude: skipped"
  herdr integration install codex  >/dev/null 2>&1 && echo "     herdr integration: codex"  || echo "     herdr integration codex: skipped"
else
  echo "     herdr not installed — run: brew install herdr"
fi

say "2/5  global hooks (git rail + wip savepoint)"
mkdir -p "$HOME/.claude/hooks"
cp "$HC/skills/git-guardrails-claude-code/scripts/block-dangerous-git.sh" "$HOME/.claude/hooks/block-dangerous-git.sh"
chmod +x "$HOME/.claude/hooks/block-dangerous-git.sh"
echo "     installed ~/.claude/hooks/block-dangerous-git.sh"
ln -sfn "$HC/bin/qq-wip-snapshot.sh" "$HOME/.claude/hooks/qq-wip-snapshot.sh"
mkdir -p "$HOME/.local/bin"; ln -sfn "$HC/bin/qq-wip" "$HOME/.local/bin/qq-wip"
echo "     linked wip savepoint + qq-wip (recover: qq-wip list|diff|branch <name>)"

say "3/5  Claude Code yolo + wire the rail into ~/.claude/settings.json"
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

say "4/5  Codex yolo -> ~/.codex/config.toml"
set_toml_top approval_policy '"never"' "$HOME/.codex/config.toml"
set_toml_top sandbox_mode '"danger-full-access"' "$HOME/.codex/config.toml"
echo "     approval_policy=never, sandbox_mode=danger-full-access"

say "5/5  commit + push both repos"
git -C "$HC" add -A
git -C "$HC" commit -q -m "hypercore: curated 15-skill system, rules, knowledge + session layers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" && echo "     hypercore committed" || echo "     hypercore: nothing to commit"
git -C "$HC" push origin main && echo "     hypercore pushed" || echo "     hypercore push FAILED — pull/rebase then retry"

# meeting-reviewer: stage ONLY the hypercore layer; your src/tests WIP is left untouched
git -C "$MR" add AGENTS.md CLAUDE.md .mcp.json CONCEPTS.md SKILLS-ATTRIBUTION.md docs/solutions .claude/skills
git -C "$MR" commit -q -m "adopt hypercore: rules + 15 skills + Context7

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" && echo "     meeting-reviewer committed (hypercore layer only)" || echo "     meeting-reviewer: nothing to commit"
git -C "$MR" push origin main && echo "     meeting-reviewer pushed" || echo "     meeting-reviewer push FAILED — pull/rebase then retry"

say "done"
cat <<'EOF'
  hypercore is active. Notes:
   - Restart Claude Code (or open a new session) so yolo + the rail load.
   - The rail blocks destructive git only (force-push, reset --hard, clean -f, history rewrites); normal `git push` is allowed, so agents push for you.
   - Backups of every edited config sit beside them as *.hypercore.bak.
   - Codex now defaults to yolo; just run `codex`.
EOF
