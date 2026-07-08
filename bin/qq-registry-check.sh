#!/usr/bin/env bash
# qq registry check — the gate's `commands.test`. Enforces the intent-registry
# prerequisite the script can prove: a landing whose diff doesn't touch
# `backlog/` is refused. One landing path + this mechanical check + PR review is
# what lets the registry stay exhaustive ("EVERYTHING, updated at landing").
# Runs inside the no-mistakes pipeline checkout; also runnable locally.
set -euo pipefail

say() { printf '[qq-registry-check] %s\n' "$1"; }

backlog_tree_exists() {
  [ "$(git cat-file -t "$1:backlog" 2>/dev/null || true)" = "tree" ]
}

# Find the base to diff against: the push target's main line.
base=""
for ref in origin/main origin/master main master; do
  if git rev-parse --verify -q "$ref" >/dev/null 2>&1; then
    if base=$(git merge-base HEAD "$ref" 2>/dev/null) && [ -n "$base" ]; then
      break
    fi
    base=""
  fi
done

if [ -z "$base" ]; then
  # Fail open, loudly: blocking every landing on ref-layout drift is worse
  # than one unchecked push. Tighten once the gate's checkout shape is pinned.
  say "WARNING: no base ref found (tried origin/main, origin/master, main, master) — cannot check; passing."
  exit 0
fi

if [ "$base" = "$(git rev-parse HEAD)" ]; then
  say "no commits beyond base — nothing to check."
  exit 0
fi

base_has_backlog=0
head_has_backlog=0
if backlog_tree_exists "$base"; then
  base_has_backlog=1
fi
if backlog_tree_exists HEAD; then
  head_has_backlog=1
fi

if [ "$head_has_backlog" -eq 0 ]; then
  if [ "$base_has_backlog" -eq 0 ]; then
    say "no backlog/ directory — registry not adopted here; skipping."
    exit 0
  fi

  say "REFUSED: backlog/ existed on the base branch but is missing from HEAD."
  say "Restore the registry or update this check deliberately before landing its removal."
  exit 1
fi

changed=$(git -c core.quotePath=false diff --name-only "$base"...HEAD)
if [ -z "$changed" ]; then
  say "empty diff — nothing to check."
  exit 0
fi

backlog_count=$(grep -c '^backlog/' <<<"$changed" || true)
if [ "$backlog_count" -gt 0 ]; then
  say "OK: landing touches the registry ($backlog_count backlog file(s) in diff)."
  exit 0
fi

say "REFUSED: this landing does not touch backlog/ — the intent registry was not reconciled."
say "Every landing must create, claim, update, or close a task in backlog/ (backlog task create/edit)."
say "Changed files were:"
printf '%s\n' "$changed" | sed 's/^/  /'
exit 1
