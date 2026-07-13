#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
skill="$root/skills/openwiki-maintainer/SKILL.md"
normalized="$(tr '\n\t' '  ' <"$skill" | sed -E 's/ +/ /g')"

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

reject_policy 'permit at most one evidence-backed'
reject_policy 'whole-generation correction'
reject_policy 'Discard that result'

printf 'test-openwiki-maintainer: pass\n'
