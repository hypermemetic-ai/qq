#!/usr/bin/env bash
# Link qq methodology and skills live from this repo.
set -euo pipefail

QQ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

usage() {
  cat <<EOF
usage:
  bash bin/qq-link.sh skills
  bash bin/qq-link.sh repo <path> [--gate all-gated]
EOF
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 2
}

backup_path() {
  local path="$1"
  local candidate="${path}.qq.bak"
  local n=1

  while [ -e "$candidate" ] || [ -L "$candidate" ]; do
    candidate="${path}.${n}.qq.bak"
    n=$((n + 1))
  done

  mv "$path" "$candidate"
  printf 'backed up: %s -> %s\n' "$path" "$candidate"
}

resolved_path() {
  readlink -f "$1" 2>/dev/null || true
}

link_one() {
  local src="$1"
  local dst="$2"
  local label="$3"
  local src_resolved
  local dst_resolved

  mkdir -p "$(dirname "$dst")"
  src_resolved="$(resolved_path "$src")"

  if [ -L "$dst" ]; then
    dst_resolved="$(resolved_path "$dst")"
    if [ "$dst_resolved" = "$src_resolved" ]; then
      printf 'ok: %s\n' "$label"
      return
    fi
    rm "$dst"
  elif [ -e "$dst" ]; then
    backup_path "$dst"
  fi

  ln -s "$src" "$dst"
  printf 'linked: %s -> %s\n' "$label" "$src"
}

link_skills() {
  local skill_dir
  local name
  local count=0

  mkdir -p "$HOME/.claude/skills"
  for skill_dir in "$QQ"/skills/*/; do
    [ -d "$skill_dir" ] || continue
    name="$(basename "${skill_dir%/}")"
    link_one "${skill_dir%/}" "$HOME/.claude/skills/$name" "skills/$name"
    count=$((count + 1))
  done
  printf 'skills linked: %s\n' "$count"
}

ensure_agents_import() {
  local repo="$1"
  local gate="$2"
  local agents="$repo/AGENTS.md"
  local base

  base="$(basename "$repo")"
  if [ ! -e "$agents" ]; then
    printf "# %s — agent operating rules\n\nThis project runs on qq. Merge gate: %s — one landing path.\n\n## Methodology\n@.claude/qq-methodology.md\n" "$base" "$gate" > "$agents"
    printf 'scaffolded: %s\n' "$agents"
    return
  fi

  if grep -Fxq '@.claude/qq-methodology.md' "$agents"; then
    printf 'ok: %s imports methodology\n' "$agents"
    return
  fi

  printf '\n## Methodology\n@.claude/qq-methodology.md\n' >> "$agents"
  printf 'updated: %s imports methodology\n' "$agents"
}

merge_context7() {
  local mcp="$1"

  python3 - "$mcp" <<'PY'
import json
import os
import sys

path = sys.argv[1]
server = {
    "command": "npx",
    "args": ["-y", "@upstash/context7-mcp@latest"],
}
data = {}

if os.path.exists(path) and os.path.getsize(path) > 0:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

if not isinstance(data, dict):
    data = {}

servers = data.get("mcpServers")
if not isinstance(servers, dict):
    servers = {}
    data["mcpServers"] = servers

if "context7" in servers:
    print(f"ok: {path} has context7")
else:
    servers["context7"] = server
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"updated: {path} added context7")
PY
}

seed_concepts() {
  local concepts="$1"

  if [ -e "$concepts" ]; then
    printf 'ok: %s exists\n' "$concepts"
    return
  fi

  cat > "$concepts" <<'EOF'
# Concepts

Durable domain vocabulary for this system. Each entry is a term and its precise,
project-specific meaning. Appended by `ce-compound` as concepts stabilize; read by
agents to speak the same language across sessions.

<!-- entries: `**term** — one-line definition grounded in this codebase.` -->
EOF
  printf 'seeded: %s\n' "$concepts"
}

ensure_gitignore() {
  local repo="$1"
  local gitignore="$repo/.gitignore"

  # qq-phase stamps .qq/state.json in whatever repo it runs in; every linked repo
  # needs to ignore it or the first phase stamp leaves untracked transient state.
  if [ -f "$gitignore" ] && grep -qxF '.qq/' "$gitignore"; then
    printf 'ok: %s ignores .qq/\n' "$gitignore"
    return
  fi

  if [ -s "$gitignore" ]; then printf '\n' >> "$gitignore"; fi
  printf '# qq background-work progress — transient per-repo state a status widget reads\n.qq/\n' >> "$gitignore"
  printf 'updated: %s ignores .qq/\n' "$gitignore"
}

link_repo() {
  local repo
  local gate="all-gated"

  if [ "$#" -lt 1 ]; then
    usage >&2
    exit 2
  fi

  repo="$1"
  shift

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --gate)
        [ "$#" -ge 2 ] || die "--gate requires a value"
        gate="$2"
        shift 2
        ;;
      *)
        die "unknown repo option: $1"
        ;;
    esac
  done

  case "$gate" in
    all-gated) ;;
    trunk|blast-radius|human) die "retired gate: $gate (use all-gated)" ;;
    *) die "unknown gate: $gate" ;;
  esac

  mkdir -p "$repo/.claude"
  repo="$(cd "$repo" && pwd -P)"

  link_one "$QQ/qq-methodology.md" "$repo/.claude/qq-methodology.md" "$repo/.claude/qq-methodology.md"
  ensure_agents_import "$repo" "$gate"
  merge_context7 "$repo/.mcp.json"
  seed_concepts "$repo/CONCEPTS.md"
  ensure_gitignore "$repo"
}

main() {
  local cmd="${1:-}"

  case "$cmd" in
    skills)
      shift
      [ "$#" -eq 0 ] || die "skills takes no arguments"
      link_skills
      ;;
    repo)
      shift
      link_repo "$@"
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
