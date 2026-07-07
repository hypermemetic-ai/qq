#!/bin/bash
# block-dangerous-git.sh — Claude Code PreToolUse(Bash) hook.
#
# qq rail: allows normal `git push` so agents can ship, but blocks the
# genuinely destructive operations — force-push, reset --hard, clean -f,
# branch -D, `checkout .` / `restore .`, and history rewrites.
#
# Modified from mattpocock/skills `git-guardrails-claude-code` (MIT): the upstream
# version blocked ALL pushes; qq narrows that to force-pushes only.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

DANGEROUS_PATTERNS=(
  # force pushes (rewrite remote history) — plain `git push` is allowed
  'push[[:space:]].*--force'
  'push[[:space:]]([^&|;]*[[:space:]])?-f([[:space:]]|$)'
  'push[[:space:]].*--mirror'
  # destructive local operations
  'reset --hard'
  'git clean[[:space:]].*-f'
  'git branch -D'
  'git checkout[[:space:]]+\.'
  'git restore[[:space:]]+\.'
  # history rewrites
  'filter-branch'
  'filter-repo'
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches destructive-git pattern '$pattern'. The qq rail allows normal 'git push' but blocks force-push, reset --hard, clean -f, branch -D, checkout/restore ., and history rewrites." >&2
    exit 2
  fi
done

exit 0
