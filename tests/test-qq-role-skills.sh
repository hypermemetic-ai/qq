#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME=test-qq-role-skills
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
POLICY="$ROOT/delegation/policies/role-skills.json"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

jq -e '
  keys == ["assignment_selectable", "inventory", "roles", "schema", "version"]
  and .schema == "qq.role-skills/v1" and .version == 1
  and .inventory == ["agent-messaging", "delegate", "diagnosing-bugs", "operator-input", "research", "review", "uat-signoff", "writing-for-clients"]
  and .assignment_selectable == {"writing-for-clients":["implementer","reviewer"]}
  and .roles == {
    architect:["delegate","diagnosing-bugs","operator-input","research","agent-messaging"],
    change_owner:["delegate","review","diagnosing-bugs","operator-input","research","uat-signoff","agent-messaging"],
    coordinator:["agent-messaging"],
    implementer:["diagnosing-bugs"], observer:[],
    openwiki_maintainer:["delegate","review"], researcher:[], reviewer:[],
    runner:["writing-for-clients","diagnosing-bugs"]
  }
' "$POLICY" >/dev/null || fail 'role Skill inventory/map or assignment selection differs from doc-169 section 9'

for retired in architect code-review delegate-batch deliver-change idea; do
  [ ! -e "$ROOT/skills/$retired" ] || fail "retired Skill remains: $retired"
done
for current in agent-messaging delegate diagnosing-bugs operator-input research review uat-signoff writing-for-clients; do
  [ -f "$ROOT/skills/$current/SKILL.md" ] || fail "contract Skill is missing: $current"
done
[ -f "$ROOT/skills/openwiki-maintainer/SKILL.md" ] || fail 'T-196 legacy scheduled Skill was deleted early'
assert_file_contains "$ROOT/bin/qq-openwiki-daily" '--skill "$root/skills/openwiki-maintainer/SKILL.md"'
assert_file_not_matches "$POLICY" 'openwiki-maintainer|\.system' 'legacy or machine-local Skill entered final role policy'

for phrase in 'Start with one ticket' 'repeatable `--skill writing-for-clients`' '1–12 tickets' 'Exact-path `status`' 'missing envelope fails'; do
  assert_file_contains "$ROOT/skills/delegate/SKILL.md" "$phrase"
done
for phrase in 'software, documentation, client-facing work' 'artifact-appropriate evidence' 'fresh Reviewer' 'context gap'; do
  assert_file_contains "$ROOT/skills/review/SKILL.md" "$phrase"
done
for phrase in 'concrete significant failure' 'recurring/intermittent' 'apparently causal fix that failed' 'routine compiler or test feedback' 'authorized Implementer' 'scope, stakes, authority, or acceptance crossing'; do
  assert_file_contains "$ROOT/skills/diagnosing-bugs/SKILL.md" "$phrase"
done

# A machine-local .system tree can physically coexist with the source policy;
# exact per-role file mounts never discover it. Canonical files must also be
# regular and non-symlinked.
fixture="$TMP/root"
mkdir -p "$fixture/delegation/policies" "$fixture/bin/lib" "$fixture/skills/.system/private"
cp "$POLICY" "$fixture/delegation/policies/role-skills.json"
cp "$ROOT/bin/lib/qq_role_identity.mjs" "$fixture/bin/lib/qq_role_identity.mjs"
for current in agent-messaging delegate diagnosing-bugs operator-input research review uat-signoff writing-for-clients; do
  mkdir -p "$fixture/skills/$current"
  cp "$ROOT/skills/$current/SKILL.md" "$fixture/skills/$current/SKILL.md"
done
printf '%s\n' '---' 'name: private-machine-skill' 'description: must never mount' '---' >"$fixture/skills/.system/private/SKILL.md"
node --input-type=module - "$ROOT/bin/lib/qq_role_identity.mjs" "$fixture" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const [modulePath, root] = process.argv.slice(2);
const { ROLE_NAMES, loadRoleSkillPolicy, skillPathsForRole } = await import(pathToFileURL(modulePath));
const policy = await loadRoleSkillPolicy({ root });
const all = ROLE_NAMES.flatMap((role) => skillPathsForRole(root, policy.roles, role));
assert.ok(all.length > 0);
assert.equal(all.some((path) => path.includes("/.system/")), false, all);
assert.equal(all.some((path) => path.endsWith("/openwiki-maintainer/SKILL.md")), false, all);
assert.deepEqual(policy.assignmentSelectable, { "writing-for-clients": ["implementer", "reviewer"] });
JS
mv "$fixture/skills/review/SKILL.md" "$fixture/skills/review/real"
ln -s real "$fixture/skills/review/SKILL.md"
if node --input-type=module - "$ROOT/bin/lib/qq_role_identity.mjs" "$fixture" \
  >"$TMP/symlink.out" 2>"$TMP/symlink.err" <<'JS'
import { pathToFileURL } from "node:url";
const [modulePath, root] = process.argv.slice(2);
const { loadRoleSkillPolicy } = await import(pathToFileURL(modulePath));
await loadRoleSkillPolicy({ root });
JS
then
  fail 'role policy accepted a symlinked canonical Skill'
fi
assert_file_contains "$TMP/symlink.err" 'canonical qq Skill review is unsafe or unavailable'

printf 'test-qq-role-skills: pass\n'
