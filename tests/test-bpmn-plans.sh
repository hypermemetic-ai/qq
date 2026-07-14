#!/usr/bin/env bash
set -euo pipefail

tests_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-bpmn-plans"
# shellcheck source=tests/helpers.sh
source "$tests_dir/helpers.sh"
root="$(cd "$tests_dir/.." && pwd -P)"
skill="$root/skills/bpmn-plans/SKILL.md"
normalized="$(tr '\n\t' '  ' <"$skill" | sed -E 's/ +/ /g')"

require_policy() {
  local text="$1"
  assert_contains "$normalized" "$text" "missing BPMN plan policy: $text"
}

reject_policy() {
  local text="$1"
  assert_not_contains "$normalized" "$text" "obsolete BPMN plan policy remains: $text"
}

require_policy 'every work-specific action, decision, failure path, and acceptance Check remains an explicit flow node'
require_policy 'Never simplify or remove that content to improve the diagram layout'
require_policy "\`callActivity\` named \`Complete qq Change delivery\`"
require_policy 'calledElement: "qq_change_delivery"'
require_policy "flowing immediately to an end event named \`Green PR ready\`"
require_policy 'Generation is not presentation'
require_policy 'Intermediate candidates must never create operator-facing windows'
require_policy 'Only after the final plan version is generated, stored, linked, and verified—and the approval question is ready—launch that version exactly once'
require_policy 'do not invoke the opener again for the same version'
require_policy 'Never reopen an unchanged version'

reject_policy 'After the command succeeds, immediately open the generated'

if [[ "$(grep -Fc 'setsid -f xdg-open' "$skill")" -ne 1 ]]; then
  fail 'BPMN plan policy must contain exactly one durable opener command'
fi

printf 'test-bpmn-plans: pass\n'
