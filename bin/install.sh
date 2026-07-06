#!/usr/bin/env bash
# hypercore preflight — checks the external surface and prints exact setup steps.
# Safe by design: it inspects and instructs; it does not install system packages
# or use sudo on your behalf. Re-run any time; it is idempotent.
set -euo pipefail

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
miss() { printf '  \033[33m•\033[0m %s\n' "$1"; }

have() { command -v "$1" >/dev/null 2>&1; }

pkg_hint() {
  # $1 = tool, $2 = brew formula, $3 = apt package (or "-")
  if have brew;      then echo "brew install $2"
  elif have apt-get; then [ "$3" = "-" ] && echo "(no apt package — see $1 docs)" || echo "sudo apt install $3"
  else echo "see $1 install docs"; fi
}

bold "hypercore preflight"
echo

bold "Externals (fast filesystem + GitHub)"
for t in rg fd eza gh tmux; do
  if have "$t"; then ok "$t"; else
    case "$t" in
      rg)  miss "rg (ripgrep)  →  $(pkg_hint ripgrep ripgrep ripgrep)";;
      fd)  miss "fd            →  $(pkg_hint fd fd fd-find)";;
      eza) miss "eza           →  $(pkg_hint eza eza -)";;
      gh)  miss "gh (GitHub)   →  $(pkg_hint gh gh gh)";;
      tmux) miss "tmux         →  $(pkg_hint tmux tmux tmux)";;
    esac
  fi
done
echo

bold "Sessions — NTM (Named Tmux Manager)"
if have ntm; then ok "ntm"; else
  miss "ntm  →  brew install dicklesworthstone/tap/ntm"
  miss "      (or: curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/ntm/main/install.sh | bash -s -- --easy-mode)"
fi
echo

bold "Knowledge — Understand-Anything (documentation layer)"
if [ -f .understand-anything/knowledge-graph.json ]; then ok "knowledge graph present"; else
  miss "not built yet. In a Claude Code session:"
  miss "  /plugin marketplace add Egonex-AI/Understand-Anything"
  miss "  /plugin install understand-anything"
  miss "  /understand           # builds .understand-anything/knowledge-graph.json"
fi
echo

bold "External docs — Context7 MCP"
if [ -f .mcp.json ]; then ok ".mcp.json present — approve the context7 server on next session start"; else
  miss ".mcp.json missing"
fi
miss "optional: export CONTEXT7_API_KEY=... to raise rate limits"
echo

bold "Skills"
if [ -d skills ]; then
  n=$(find skills -maxdepth 2 -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')
  ok "$n skills in ./skills/"
  miss "activate in a project: /plugin marketplace add \"$(pwd)\"  then  /plugin install hypercore"
  miss "or vendor into a project: cp -R skills/* <project>/.claude/skills/"
else
  miss "skills/ not found — run from the hypercore repo root"
fi
echo
bold "Done. Address any '•' items above."
