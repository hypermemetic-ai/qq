#!/usr/bin/env bash
# qq-wip-snapshot — snapshot the working tree to refs/wip/<branch> WITHOUT touching
# HEAD, the index, or any working file. Runs on every Codex Stop as a recovery
# point for in-flight work that has not been committed yet.
#
# Non-destructive by construction: it builds the snapshot in a temporary index and
# only ever writes new git objects + moves refs/wip/<branch>. The ref update is
# compare-and-swap so same-tree Stop hooks do not clobber each other, and hook
# races never fail the caller. It is invisible to normal git operations. No-op
# when the tree is clean, outside a repo, or when nothing changed since the last
# snapshot.
#
# Recover with:  qq-wip list | diff | branch <name>
set -euo pipefail

# In a work tree? Otherwise succeed silently — this must never break a Stop.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# Nothing uncommitted to save → cheapest possible exit.
[ -n "$(git status --porcelain 2>/dev/null)" ] || exit 0

branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo detached)
ref="refs/wip/${branch}"

# Build a tree from the CURRENT working tree (tracked + untracked, honoring
# .gitignore) in a TEMPORARY index, so the real index is never disturbed.
tmp_index="$(git rev-parse --git-dir)/qq-wip-index.$$"
trap 'rm -f "$tmp_index"' EXIT
GIT_INDEX_FILE="$tmp_index" git read-tree HEAD 2>/dev/null \
  || GIT_INDEX_FILE="$tmp_index" git read-tree --empty
# Never advance the recovery ref with a partial tree. A Stop hook must not fail
# its caller, so collection failure exits cleanly and preserves the last snapshot.
GIT_INDEX_FILE="$tmp_index" git add -A 2>/dev/null || exit 0
tree=$(GIT_INDEX_FILE="$tmp_index" git write-tree)

# Skip if the snapshot would equal HEAD's tree (clean) or the last snapshot (no change).
head_tree=$(git rev-parse --quiet --verify 'HEAD^{tree}' 2>/dev/null || echo "")
[ "$tree" = "$head_tree" ] && exit 0
prev=$(git rev-parse --quiet --verify "$ref" 2>/dev/null || echo "")
if [ -n "$prev" ] && [ "$tree" = "$(git rev-parse "${prev}^{tree}")" ]; then
  exit 0
fi

# Record the snapshot: commit-tree with HEAD (+ previous snapshot) as parents, move ref.
head=$(git rev-parse --quiet --verify HEAD 2>/dev/null || echo "")
msg="wip: ${head:0:9}+uncommitted @ $(date -u +%FT%TZ) on ${branch}"
make_commit() {
  local snapshot_parent="$1"
  local parents=()
  [ -n "$head" ] && parents+=(-p "$head")
  [ -n "$snapshot_parent" ] && parents+=(-p "$snapshot_parent")
  printf '%s\n' "$msg" | git commit-tree "$tree" "${parents[@]}"
}

commit=$(make_commit "$prev") || exit 0
# Compare-and-swap: only move the ref if it still points where we read it
# (zero-oid = "must not exist"). Two sessions in one tree can race this hook.
zero=$(printf "%${#commit}s" "" | tr ' ' '0')
if ! git update-ref "$ref" "$commit" "${prev:-$zero}" 2>/dev/null; then
  current=$(git rev-parse --quiet --verify "$ref" 2>/dev/null || echo "")
  current_tree=""
  if [ -n "$current" ]; then
    current_tree=$(git rev-parse "${current}^{tree}" 2>/dev/null || echo "")
  fi
  if [ "$tree" != "$current_tree" ]; then
    retry_commit=$(make_commit "$current") || exit 0
    git update-ref "$ref" "$retry_commit" "${current:-$zero}" 2>/dev/null || true
  fi
fi
exit 0
