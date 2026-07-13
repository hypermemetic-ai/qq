#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
skill="$root/skills/bpmn-plans/SKILL.md"
normalized="$(tr '\n\t' '  ' <"$skill" | sed -E 's/ +/ /g')"

require_policy() {
  local text="$1"
  if ! grep -Fq "$text" <<<"$normalized"; then
    printf 'missing BPMN plan policy: %s\n' "$text" >&2
    exit 1
  fi
}

reject_policy() {
  local text="$1"
  if grep -Fq "$text" <<<"$normalized"; then
    printf 'obsolete BPMN plan policy remains: %s\n' "$text" >&2
    exit 1
  fi
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
  printf 'BPMN plan policy must contain exactly one durable opener command\n' >&2
  exit 1
fi

printf 'test-bpmn-plans: pass\n'
