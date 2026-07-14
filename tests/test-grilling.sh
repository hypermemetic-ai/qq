#!/usr/bin/env bash
set -euo pipefail

tests_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-grilling"
# shellcheck source=tests/helpers.sh
source "$tests_dir/helpers.sh"
root="$(cd "$tests_dir/.." && pwd -P)"
skill="$root/skills/grilling/SKILL.md"
description="$(grep -m1 '^description:' "$skill")"
normalized="$(tr '\n\t' '  ' <"$skill" | sed -E 's/ +/ /g')"

require_description() {
  local text="$1"
  assert_contains "$description" "$text" "missing grilling trigger boundary: $text"
}

require_policy() {
  local text="$1"
  assert_contains "$normalized" "$text" "missing grilling Actor-boundary policy: $text"
}

reject_description() {
  local text="$1"
  assert_not_contains "$description" "$text" "over-broad grilling trigger remains: $text"
}

require_description 'used only by the accountable owning agent'
require_description 'Never invoke from a spawned, delegated, review, research, maintainer, or event-triggered agent'
require_description 'treat bounded assignments as aligned and return new consequential decisions or scope gaps to their assigning or owning Actor'

require_policy 'Only the operator-facing agent accountable for owning the work item may invoke this Skill.'
require_policy 'A spawned, delegated, review, research, maintainer, or event-triggered agent must not invoke it for a bounded assignment.'
require_policy 'Treat the bounded assignment as aligned and execute within its boundary.'
require_policy 'return it to the assigning or owning Actor rather than asking the operator or expanding the assignment'
require_policy 'The operator-facing owner stops and resumes alignment.'

reject_description 'Default alignment interview before every new work item'

printf 'test-grilling: pass\n'
