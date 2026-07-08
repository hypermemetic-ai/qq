#!/usr/bin/env bash
# qq preflight — checks the external surface and prints exact setup steps.
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

bold "qq preflight"
echo

bold "Externals (fast filesystem + GitHub)"
for t in rg fd eza gh; do
  if have "$t"; then ok "$t"; else
    case "$t" in
      rg)  miss "rg (ripgrep)  →  $(pkg_hint ripgrep ripgrep ripgrep)";;
      fd)  miss "fd            →  $(pkg_hint fd fd fd-find)";;
      eza) miss "eza           →  $(pkg_hint eza eza -)";;
      gh)  miss "gh (GitHub)   →  $(pkg_hint gh gh gh)";;
    esac
  fi
done
echo

bold "Sessions — herdr (agent multiplexer)"
if have herdr; then ok "herdr"; else
  miss "herdr  →  brew install herdr"
  miss "        (or: curl -fsSL https://herdr.dev/install.sh | sh)"
fi
echo

bold "Cockpit — terminal surface"
for t in yazi broot glow mdcat; do
  if have "$t"; then ok "$t"; else
    case "$t" in
      yazi)  miss "yazi   →  $(pkg_hint yazi yazi -)";;
      broot) miss "broot  →  $(pkg_hint broot broot -)";;
      glow)  miss "glow   →  $(pkg_hint glow glow -)";;
      mdcat) miss "mdcat  →  $(pkg_hint mdcat mdcat -)";;
    esac
  fi
done
echo

bold "Knowledge — the document stack"
if have codebase-memory-mcp; then ok "codebase-memory-mcp (code graph, out-of-repo index)"; else
  miss "codebase-memory-mcp  →  see github.com/DeusData/codebase-memory-mcp"
  miss "  install.sh --skip-config, then wire MCP for Claude Code + Codex manually"
fi
if have backlog; then ok "backlog (intent + work status registry)"; else
  miss "backlog  →  npm i -g backlog.md"
fi
if have openwiki; then
  openwiki_env="$HOME/.openwiki/.env"
  if [ ! -f "$openwiki_env" ]; then
    miss "openwiki installed but ~/.openwiki/.env is missing"
  elif grep -qs "PASTE_KEY_HERE" "$openwiki_env"; then
    miss "openwiki installed but ~/.openwiki/.env still needs a real API key"
  else ok "openwiki (durable descriptive docs)"; fi
else
  miss "openwiki  →  npm i -g openwiki  (then set provider/key in ~/.openwiki/.env)"
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
  miss "link skills live: bash bin/qq-link.sh skills"
  miss "link a repo: bash bin/qq-link.sh repo <path>"
else
  miss "skills/ not found — run from the qq repo root"
fi
echo
bold "Done. Address any '•' items above."
