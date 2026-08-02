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
[ ! -e "$ROOT/bin/qq-execution-profiles" ] || fail 'deleted policy mirror installer still exists'
[ -x "$ROOT/bin/qq-pi-role" ] || fail 'missing accountable-role launcher'

jq -e '
  (keys == ["architect", "implementer", "observer", "orchestrator", "researcher", "reviewer"])
  and ([.orchestrator, .reviewer] | all(
    . == {provider:"kimi-coding", model:"k3", effort:"max", serviceClass:"provider-default"}
  ))
  and ([.architect, .implementer, .observer, .researcher] | all(
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
assert(
  ext.PROFILE_PATH === path.join(process.env.ROOT, "delegation", "policies", "execution-profiles.json"),
  "default profile path is not the mounted Repository policy",
);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "qq-profiles-test-"));
const policyPath = path.join(temp, "execution-profiles.json");
const canonical = fs.readFileSync(process.env.POLICY, "utf8");
const writePolicy = (value) => {
  fs.writeFileSync(policyPath, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
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
assert(handlers.size === 1 && handlers.has("session_start"), "root profile lifecycle handler drifted");
await handlers.get("session_start")({}, ctx);

const parsed = JSON.parse(canonical);
let profile = await resolver({ purpose: "agent" }, {});
assert(JSON.stringify(profile) === JSON.stringify(parsed.orchestrator), "plain root did not resolve orchestrator");
assert(Object.keys(profile).sort().join(",") === "effort,model,provider,serviceClass", "resolver returned extra fields");
env.QQ_EXECUTION_PROFILE_LAUNCHER = `${process.env.ROOT}/bin/qq-pi-role`;
env.QQ_EXECUTION_PROFILE_LAUNCHER_ROLE = "architect";
profile = await resolver({ purpose: "agent" }, {});
assert(JSON.stringify(profile) === JSON.stringify(parsed.architect), "launcher-bound Architect did not resolve Architect");
env.QQ_EXECUTION_PROFILE_LAUNCHER = "/tmp/forged";
await expectReject(() => resolver({ purpose: "agent" }, {}), "invalid architect launcher assertion");
delete env.QQ_EXECUTION_PROFILE_LAUNCHER;
delete env.QQ_EXECUTION_PROFILE_LAUNCHER_ROLE;

const changed = structuredClone(parsed);
changed.orchestrator = structuredClone(parsed.implementer);
writePolicy(changed);
profile = await resolver({ purpose: "agent" }, {});
assert(JSON.stringify(profile) === JSON.stringify(changed.orchestrator), "valid update did not apply on next resolution");
writePolicy(parsed);
await resolver({ purpose: "agent" }, {});
const unsupportedSibling = structuredClone(parsed);
unsupportedSibling.observer = { provider: "missing", model: "nope", effort: "high", serviceClass: "provider-default" };
writePolicy(unsupportedSibling);
await expectReject(() => resolver({ purpose: "agent" }, {}), "unsupported test profile: missing/nope");

writePolicy("{ not json\n");
await expectReject(() => resolver({ purpose: "agent" }, {}), "not valid JSON");
writePolicy({ ...parsed, extra: parsed.observer });
await expectReject(() => resolver({ purpose: "agent" }, {}), "exactly these roles");

writePolicy(canonical);
profile = await resolver({ purpose: "agent" }, {});
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

# The dedicated launcher owns the Architect assertion and rejects conflicts.
launcher_root="$(mktemp -d)"
trap 'rm -rf "$launcher_root"' EXIT
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
if QQ_EXECUTION_PROFILE_LAUNCHER_ROLE=orchestrator "$launcher_root/bin/qq-pi-role" architect >/dev/null 2>&1; then
  fail 'launcher erased a conflicting inherited root assertion'
fi

assert_file_contains "$ROOT/extensions/index.ts" 'registerExecutionProfiles(pi)'
assert_file_contains "$ROOT/extensions/qq-footer.ts" 'acknowledgedServiceClass'

printf 'test-qq-execution-profiles: pass\n'
