#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-execution-profiles"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
EXT="$ROOT/extensions/qq-execution-profiles.ts"
POLICY="$ROOT/delegation/policies/execution-profiles.json"

[ -f "$EXT" ] || fail "missing extension: $EXT"
[ -f "$POLICY" ] || fail "missing policy: $POLICY"
[ -x "$ROOT/bin/qq-execution-profiles" ] || fail 'missing policy installer'
[ -x "$ROOT/bin/qq-pi-role" ] || fail 'missing accountable-role launcher'

jq -e '
  (keys == ["architect", "implementer", "observer", "orchestrator", "researcher", "reviewer"])
  and ([.architect, .orchestrator, .reviewer] | all(
    . == {provider:"kimi-coding", model:"k3", effort:"max", serviceClass:"provider-default"}
  ))
  and ([.implementer, .observer, .researcher] | all(
    . == {provider:"openai-codex", model:"gpt-5.6-sol", effort:"xhigh", serviceClass:"provider-default"}
  ))
' "$POLICY" >/dev/null || fail 'six-role policy does not match the operator-settled map'

for manifest in "$ROOT"/delegation/manifests/agents/{implementer,observer,researcher,reviewer}.md; do
  assert_file_not_matches "$manifest" '^(model|thinking):' 'canonical manifest retained compute authority'
done

EXT="$EXT" POLICY="$POLICY" ROOT="$ROOT" node --experimental-strip-types --input-type=module <<'NODE'
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const die = (message) => { console.error(message); process.exit(1); };
const assert = (condition, message) => { if (!condition) die(message); };
const expectReject = async (run, text) => {
  try { await run(); } catch (error) {
    if (String(error).includes(text)) return;
    die(`expected rejection containing ${JSON.stringify(text)}, got ${String(error)}`);
  }
  die(`expected rejection containing ${JSON.stringify(text)}`);
};
const ext = await import(pathToFileURL(process.env.EXT).href);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "qq-profiles-test-"));
const directory = path.join(temp, "qq");
const policyPath = path.join(directory, "execution-profiles.json");
fs.mkdirSync(directory, { mode: 0o700 });
const canonical = fs.readFileSync(process.env.POLICY, "utf8");
const writePolicy = (value) => {
  fs.writeFileSync(policyPath, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(policyPath, 0o600);
};
writePolicy(canonical);

const handlers = new Map();
const modelRegistry = {
  validateExecutionProfile(profile) {
    const key = `${profile.provider}/${profile.model}`;
    if (key !== "openai-codex/gpt-5.6-sol" && key !== "kimi-coding/k3") {
      throw new Error(`unsupported test profile: ${key}`);
    }
  },
};
const ctx = { modelRegistry };
let resolver;
const pi = {
  registerExecutionProfileResolver(next) { resolver = (request) => next(request, ctx); },
  on(name, handler) { handlers.set(name, handler); },
};
const env = {};
ext.default(pi, { profilePath: policyPath, env });
assert(typeof resolver === "function", "resolver was not registered");
assert(handlers.has("session_start") && handlers.has("tool_call") && handlers.has("message_end"), "profile lifecycle handlers missing");
await handlers.get("session_start")({}, ctx);

const parsed = JSON.parse(canonical);
let profile = await resolver({ purpose: "agent" }, {});
assert(JSON.stringify(profile) === JSON.stringify(parsed.orchestrator), "plain root did not resolve orchestrator");
assert(Object.keys(profile).sort().join(",") === "effort,model,provider,serviceClass", "resolver returned extra fields");
let delegated = JSON.parse(env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES);
assert(JSON.stringify(Object.keys(delegated).sort()) === JSON.stringify(["implementer", "observer", "researcher", "reviewer"]), "delegated snapshot keys drifted");
assert(JSON.stringify(delegated.observer) === JSON.stringify(parsed.observer), "observer snapshot drifted");

const receiptDirectory = path.join(temp, "receipt");
fs.mkdirSync(receiptDirectory, { mode: 0o700 });
const receiptPath = path.join(receiptDirectory, "execution-profile-receipt.json");
env.PI_SUBAGENT_CHILD_AGENT = "observer";
env.PI_SUBAGENT_TRUSTED_EXECUTION_ROLE = "observer";
env.PI_SUBAGENT_EXECUTION_PROFILE_RECEIPT = receiptPath;
profile = await resolver({ purpose: "agent" }, {});
assert(JSON.stringify(profile) === JSON.stringify(parsed.observer), "trusted observer did not resolve Observer");
await handlers.get("message_end")({ message: {
  role: "assistant",
  executionProfile: { ...parsed.observer, acknowledgedServiceClass: "default" },
} });
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
assert(JSON.stringify(receipt) === JSON.stringify({ ...parsed.observer, acknowledgedServiceClass: "default" }), "delegated receipt was not published exactly");
assert((fs.statSync(receiptPath).mode & 0o777) === 0o600, "delegated receipt is not mode 600");
fs.unlinkSync(receiptPath);
fs.symlinkSync(policyPath, receiptPath);
await expectReject(() => handlers.get("message_end")({ message: {
  role: "assistant",
  executionProfile: parsed.observer,
} }), "receipt target is not one private regular file");
assert(fs.lstatSync(receiptPath).isSymbolicLink(), "receipt writer replaced a conflicting symlink");
fs.unlinkSync(receiptPath);

env.PI_SUBAGENT_TRUSTED_EXECUTION_ROLE = "reviewer";
await expectReject(() => resolver({ purpose: "agent" }, {}), "must agree");
env.PI_SUBAGENT_TRUSTED_EXECUTION_ROLE = "observer";
env.QQ_EXECUTION_PROFILE_LAUNCHER_ROLE = "architect";
await expectReject(() => resolver({ purpose: "agent" }, {}), "conflicting delegated and root");
delete env.PI_SUBAGENT_CHILD_AGENT;
delete env.PI_SUBAGENT_TRUSTED_EXECUTION_ROLE;
delete env.PI_SUBAGENT_EXECUTION_PROFILE_RECEIPT;
delete env.QQ_EXECUTION_PROFILE_LAUNCHER_ROLE;
env.QQ_EXECUTION_PROFILE_LAUNCHER = `${process.env.ROOT}/bin/qq-pi-role`;
env.QQ_EXECUTION_PROFILE_LAUNCHER_ROLE = "architect";
profile = await resolver({ purpose: "agent" }, {});
assert(JSON.stringify(profile) === JSON.stringify(parsed.architect), "launcher-bound Architect did not resolve Architect");
env.QQ_EXECUTION_PROFILE_LAUNCHER = "/tmp/forged";
await expectReject(() => resolver({ purpose: "agent" }, {}), "invalid architect launcher assertion");
delete env.QQ_EXECUTION_PROFILE_LAUNCHER;
delete env.QQ_EXECUTION_PROFILE_LAUNCHER_ROLE;
env.PI_SUBAGENT_CHILD_AGENT = "reviewer";
await expectReject(() => resolver({ purpose: "agent" }, {}), "missing its trusted execution-role assertion");
delete env.PI_SUBAGENT_CHILD_AGENT;

const changed = structuredClone(parsed);
changed.observer = structuredClone(parsed.reviewer);
writePolicy(changed);
profile = await resolver({ purpose: "agent" }, {});
assert(JSON.stringify(profile) === JSON.stringify(changed.orchestrator), "valid update did not apply on next resolution");
const pinnedBeforeEdit = env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES;
writePolicy(parsed);
env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES = "caller-conflict";
handlers.get("tool_call")();
assert(env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES === pinnedBeforeEdit, "mid-request edit or env override changed pinned delegated snapshot");
await resolver({ purpose: "agent" }, {});
assert(JSON.parse(env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES).reviewer.model === "k3", "next valid policy did not recover");
const unsupportedSibling = structuredClone(parsed);
unsupportedSibling.observer = { provider: "missing", model: "nope", effort: "high", serviceClass: "provider-default" };
writePolicy(unsupportedSibling);
await expectReject(() => resolver({ purpose: "agent" }, {}), "unsupported test profile: missing/nope");
assert(env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES === "__qq_execution_profile_resolver_required__", "invalid complete policy retained a stale delegated snapshot");

writePolicy(canonical.replace('"architect"', '"architect"').replace('"implementer"', '"architect"'));
await expectReject(() => resolver({ purpose: "agent" }, {}), "duplicate object key");
writePolicy({ ...parsed, extra: parsed.observer });
await expectReject(() => resolver({ purpose: "agent" }, {}), "exactly these roles");
writePolicy(parsed);
fs.chmodSync(policyPath, 0o644);
await expectReject(() => resolver({ purpose: "agent" }, {}), "mode-600 regular file");
fs.chmodSync(policyPath, 0o600);
fs.renameSync(policyPath, `${policyPath}.real`);
fs.symlinkSync(`${policyPath}.real`, policyPath);
await expectReject(() => resolver({ purpose: "agent" }, {}), "ELOOP");
fs.unlinkSync(policyPath);
fs.renameSync(`${policyPath}.real`, policyPath);
await resolver({ purpose: "agent" }, {});

ext.acceptExecutionProfileTelemetry({
  role: "assistant",
  executionProfile: { ...parsed.orchestrator, acknowledgedServiceClass: "default", accountedServiceClass: "default" },
});
const display = ext.getExecutionProfileDisplay();
assert(display?.acknowledgedServiceClass === "default", "acknowledged telemetry was not retained");
const footer = await import(pathToFileURL(path.join(process.env.ROOT, "extensions", "qq-footer.ts")).href);
assert(
  footer.executionProfileText(parsed.observer) === "(openai-codex) gpt-5.6-sol • xhigh • class provider-default • ack n/a",
  "footer did not expose selected Observer profile and absent acknowledgement",
);
assert(
  footer.executionProfileText(display) === "(kimi-coding) k3 • max • class provider-default • ack default",
  "footer did not expose selected and acknowledged root profile",
);

fs.rmSync(temp, { recursive: true, force: true });
NODE

# The installer atomically publishes one private, byte-exact active document.
home="$(mktemp -d)"
trap 'rm -rf "$home" "$launcher_root"' EXIT
HOME="$home" "$ROOT/bin/qq-execution-profiles" install >/dev/null
active="$home/.config/qq/execution-profiles.json"
[ "$(stat -c '%a' "$home/.config/qq")" = 700 ] || fail 'policy directory is not mode 700'
[ "$(stat -c '%a' "$active")" = 600 ] || fail 'active policy is not mode 600'
cmp -s "$POLICY" "$active" || fail 'installer did not publish exact Repository policy'
HOME="$home" "$ROOT/bin/qq-execution-profiles" verify >/dev/null
printf '{}\n' >"$active"
chmod 600 "$active"
if HOME="$home" "$ROOT/bin/qq-execution-profiles" verify >/dev/null 2>&1; then
  fail 'verifier accepted a stale active policy'
fi
HOME="$home" "$ROOT/bin/qq-execution-profiles" install >/dev/null
bad_home="$home/bad-home"
unrelated="$home/unrelated-config"
mkdir -p "$bad_home" "$unrelated"
ln -s "$unrelated" "$bad_home/.config"
if HOME="$bad_home" "$ROOT/bin/qq-execution-profiles" install >/dev/null 2>&1; then
  fail 'installer followed a symlinked policy parent'
fi
[ ! -e "$unrelated/qq" ] || fail 'rejected symlinked policy parent was mutated'

# The dedicated launcher owns the Architect assertion and rejects conflicts.
launcher_root="$(mktemp -d)"
mkdir -p "$launcher_root/bin"
cp "$ROOT/bin/qq-pi-role" "$launcher_root/bin/qq-pi-role"
cat >"$launcher_root/bin/pi" <<'FAKE_PI'
#!/usr/bin/env bash
printf '%s\n' "${QQ_EXECUTION_PROFILE_LAUNCHER-}" "${QQ_EXECUTION_PROFILE_LAUNCHER_ROLE-}" "$*"
FAKE_PI
chmod 755 "$launcher_root/bin/pi" "$launcher_root/bin/qq-pi-role"
mapfile -t launched < <("$launcher_root/bin/qq-pi-role" architect --version)
assert_equal "$launcher_root/bin/qq-pi-role" "${launched[0]}" 'launcher path assertion mismatch'
assert_equal architect "${launched[1]}" 'launcher role assertion mismatch'
assert_equal --version "${launched[2]}" 'launcher argument forwarding mismatch'
if "$launcher_root/bin/qq-pi-role" observer >/dev/null 2>&1; then
  fail 'launcher accepted a delegated role'
fi
if PI_SUBAGENT_CHILD_AGENT=reviewer "$launcher_root/bin/qq-pi-role" architect >/dev/null 2>&1; then
  fail 'launcher erased a conflicting inherited child assertion'
fi

assert_file_contains "$ROOT/extensions/index.ts" 'registerExecutionProfiles(pi)'
assert_file_contains "$ROOT/extensions/qq-footer.ts" 'acknowledgedServiceClass'
assert_file_contains "$ROOT/bin/qq-dispatch" 'unset QQ_EXECUTION_PROFILE_LAUNCHER QQ_EXECUTION_PROFILE_LAUNCHER_ROLE'

printf 'test-qq-execution-profiles: pass\n'
