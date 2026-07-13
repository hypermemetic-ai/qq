#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
skill="$root/skills/openwiki-maintainer/SKILL.md"
normalized="$(tr '\n\t' '  ' <"$skill" | sed -E 's/ +/ /g')"
ordinary_delivery="$(tr '\n\t' '  ' <"$root/skills/deliver-change/SKILL.md" | sed -E 's/ +/ /g')"

require_policy() {
  local text="$1"
  if ! grep -Fq "$text" <<<"$normalized"; then
    printf 'missing OpenWiki maintainer policy: %s\n' "$text" >&2
    exit 1
  fi
}

reject_policy() {
  local text="$1"
  if grep -Fq "$text" <<<"$normalized"; then
    printf 'obsolete OpenWiki maintainer policy remains: %s\n' "$text" >&2
    exit 1
  fi
}

require_policy 'Consolidate all verified material findings into a concise correction brief for the internal generator'
require_policy "\`qq-openwiki --correct\` so it can correct the current generated set it authored"
require_policy "invoke \`code-review\` on the exact correction delta—including untracked files—against the staged baseline"
require_policy 'Reserve another correction round for evidence of a remaining material defect, a clear remedy, and continued convergence'
require_policy 'polish or speculative improvement does not justify one'
require_policy 'End correction when the generator command fails, or when a round fails to materially reduce the findings or introduces comparable defects'
require_policy 'Leave the current worktree, staged baseline, and evidence intact'
require_policy "record its exact commit as the immutable \`target_main\` for this run"
require_policy 'require it to remain open, mergeable and clean'
require_policy "verify the remote \`headRefOid\` equals \`head_sha\`"
require_policy "only paths under \`openwiki/\` and, when present, the file containing the marked OpenWiki instruction block may differ; only lines inside that marked block may change in the latter file"
require_policy "gh api \"repos/{owner}/{repo}/pulls/\$pr\" --jq '.base.sha'"
require_policy "Require both fetched \`origin/main\` and \`base_sha\` to equal \`target_main\`"
require_policy 'sole exception to the ordinary operator-merge boundary'
require_policy 'does not require operator review, approval, or a merge action'
require_policy "Create a two-parent merge commit object whose tree equals \`head_sha\`"
require_policy "whose first parent is \`target_main\`, and whose second parent is \`head_sha\`"
require_policy "git commit-tree \"\$tree_sha\" -p \"\$target_main\" -p \"\$head_sha\""
require_policy "git push origin \"\$merge_sha:refs/heads/main\""
require_policy "Git rejects the update as non-fast-forward or stale if \`main\` wins a concurrent advance"
require_policy "Never use \`gh pr merge\`, auto-merge, a merge queue, \`--force\`, \`--admin\`"
require_policy "never delete the persistent \`openwiki/update\` branch"
require_policy 'do not retry around the guard'
require_policy 'verify that GitHub reports the pull request merged'

reject_policy 'permit at most one evidence-backed'
reject_policy 'whole-generation correction'
reject_policy 'Discard that result'
reject_policy 'leave merge authority to the operator'

if [[ "$(grep -Fc 'gh pr merge' "$skill")" -ne 1 ]]; then
  printf 'OpenWiki maintainer policy must mention gh pr merge only in its prohibition\n' >&2
  exit 1
fi

if ! grep -Fq 'Never merge the pull request.' <<<"$ordinary_delivery"; then
  printf 'ordinary Change delivery no longer preserves operator merge authority\n' >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
seed="$tmp/seed"
remote="$tmp/remote.git"
fresh_remote="$tmp/fresh-remote.git"
concurrent="$tmp/concurrent"

git init -q -b main "$seed"
git -C "$seed" config user.name 'OpenWiki Maintainer Test'
git -C "$seed" config user.email 'openwiki-maintainer-test@example.invalid'
printf 'base\n' >"$seed/source.txt"
git -C "$seed" add source.txt
git -C "$seed" commit -q -m 'base'
target_main="$(git -C "$seed" rev-parse HEAD)"

git init -q --bare "$remote"
git -C "$seed" remote add origin "$remote"
git -C "$seed" push -q origin "$target_main:refs/heads/main"
git -C "$seed" switch -q -c openwiki/update
mkdir -p "$seed/openwiki"
printf 'generated docs\n' >"$seed/openwiki/quickstart.md"
git -C "$seed" add openwiki/quickstart.md
git -C "$seed" commit -q -m 'docs: refresh OpenWiki'
head_sha="$(git -C "$seed" rev-parse HEAD)"
tree_sha="$(git -C "$seed" rev-parse "$head_sha^{tree}")"
merge_sha="$(
  printf 'Merge OpenWiki pull request #1\n' |
    git -C "$seed" commit-tree "$tree_sha" -p "$target_main" -p "$head_sha"
)"

[[ "$(git -C "$seed" rev-parse "$merge_sha^{tree}")" == "$tree_sha" ]]
[[ "$(git -C "$seed" show -s --format='%P' "$merge_sha")" == "$target_main $head_sha" ]]

git clone -q -b main "$remote" "$concurrent"
git -C "$concurrent" config user.name 'Concurrent Change Test'
git -C "$concurrent" config user.email 'concurrent-change-test@example.invalid'
printf 'concurrent main advance\n' >>"$concurrent/source.txt"
git -C "$concurrent" add source.txt
git -C "$concurrent" commit -q -m 'concurrent main advance'
concurrent_main="$(git -C "$concurrent" rev-parse HEAD)"
git -C "$concurrent" push -q origin HEAD:refs/heads/main

if git -C "$seed" push origin "$merge_sha:refs/heads/main" >"$tmp/stale-push.log" 2>&1; then
  printf 'ordinary OpenWiki merge push accepted a stale target\n' >&2
  exit 1
fi
[[ "$(git --git-dir="$remote" rev-parse refs/heads/main)" == "$concurrent_main" ]]

git init -q --bare "$fresh_remote"
git -C "$seed" remote add fresh "$fresh_remote"
git -C "$seed" push -q fresh "$target_main:refs/heads/main"
git -C "$seed" push -q fresh "$merge_sha:refs/heads/main"
[[ "$(git --git-dir="$fresh_remote" rev-parse refs/heads/main)" == "$merge_sha" ]]

printf 'test-openwiki-maintainer: pass\n'
