#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-subagent-env"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
EXT="$ROOT/extensions/qq-subagent-env.ts"

[ -f "$EXT" ] || fail "missing extension: $EXT"

# Structural guards: adapter and trusted-seat authority is overwritten from
# the governed checkout; runtime-root placement remains operator-overridable.
assert_file_contains "$EXT" 'PI_SUBAGENT_PI_BINARY'
assert_file_contains "$EXT" 'PI_SUBAGENT_EXTRA_AGENT_DIRS'
assert_file_contains "$EXT" 'PI_SUBAGENT_TRUSTED_AGENT_PATHS'
assert_file_contains "$EXT" 'PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES'
assert_file_contains "$EXT" 'QQ_DISPATCH_RUNTIME_ROOT'
assert_file_not_matches "$EXT" 'process\.env\.PI_SUBAGENT_(PI_BINARY|EXTRA_AGENT_DIRS|TRUSTED_AGENT_PATHS) === undefined' \
  'delegated authority became caller-overridable'
assert_file_contains "$EXT" 'process.env.QQ_DISPATCH_RUNTIME_ROOT === undefined'
assert_file_contains "$EXT" 'pi-subagents-uid-'
assert_file_contains "$EXT" '"bin/qq-dispatch"'
assert_file_contains "$EXT" '"delegation",'
assert_file_contains "$EXT" 'fileURLToPath(import.meta.url)'
assert_file_contains "$EXT" 'process.env.QQ_PI_ROOT_PROFILE === "qq-root-aligner-v1" ? QQ_ROOT : root'

# The extension establishes the pi-subagents session root at session start
# (created mode 700 when absent, tightened when operator-owned and loose) so
# pi-subagents' umask-dependent mkdir can never deadlock dispatch against
# the adapter's fail-closed mode check.
assert_file_contains "$EXT" 'ensureSessionRoot'
assert_file_contains "$EXT" 'mkdirSync(root, { mode: 0o700 })'
assert_file_contains "$EXT" 'chmodSync(root, 0o700)'
assert_file_contains "$EXT" 'defaultSessionDir'

# Functional: import the extension with a mock pi under an ISOLATED HOME and
# observe process.env and the session-root filesystem behavior.
EXT="$EXT" ROOT="$ROOT" node --experimental-strip-types --input-type=module -e '
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const ext = process.env.EXT;
const root = process.env.ROOT;
const pi = { on() {} };
const die = (msg) => { console.error(msg); process.exit(1); };
const assertEq = (actual, expected, label) => {
  if (actual !== expected) die(`${label}: expected ${expected}, got ${actual}`);
};

// Isolated HOME so the extension never touches operator state.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "qq-ext-home-"));
process.env.HOME = home;
const cfgDir = path.join(home, ".pi/agent/extensions/subagent");
fs.mkdirSync(cfgDir, { recursive: true });
const sessRoot = path.join(os.tmpdir(), `pi-subagent-envtest-${process.pid}`);
fs.writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify({ defaultSessionDir: sessRoot }));

delete process.env.PI_SUBAGENT_PI_BINARY;
delete process.env.PI_SUBAGENT_DEPTH;
delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;
delete process.env.PI_SUBAGENT_TRUSTED_AGENT_PATHS;
delete process.env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES;
delete process.env.QQ_DISPATCH_RUNTIME_ROOT;
process.chdir(root);
const mod = await import(pathToFileURL(ext).href);
mod.default(pi);
assertEq(process.env.PI_SUBAGENT_PI_BINARY, `${root}/bin/qq-dispatch`, "PI_SUBAGENT_PI_BINARY");
assertEq(
  process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS,
  `${root}/delegation/manifests/agents`,
  "PI_SUBAGENT_EXTRA_AGENT_DIRS",
);
assertEq(
  process.env.PI_SUBAGENT_TRUSTED_AGENT_PATHS,
  JSON.stringify({
    orchestrator: `${root}/delegation/manifests/agents/orchestrator.md`,
    implementer: `${root}/delegation/manifests/agents/implementer.md`,
    observer: `${root}/delegation/manifests/agents/observer.md`,
    researcher: `${root}/delegation/manifests/agents/researcher.md`,
    reviewer: `${root}/delegation/manifests/agents/reviewer.md`,
  }),
  "PI_SUBAGENT_TRUSTED_AGENT_PATHS",
);
assertEq(
  process.env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES,
  "__qq_execution_profile_resolver_required__",
  "trusted execution profiles start poisoned",
);
const uid = process.getuid?.() ?? process.geteuid?.();
if (uid === undefined) die("test runtime has no uid source");
assertEq(
  process.env.QQ_DISPATCH_RUNTIME_ROOT,
  path.join(os.tmpdir(), `pi-subagents-uid-${uid}`),
  "QQ_DISPATCH_RUNTIME_ROOT",
);

// Session root: created mode 700 when absent, tightened when loose.
if (!fs.existsSync(sessRoot)) die("session root was not created");
assertEq(fs.statSync(sessRoot).mode & 0o777, 0o700, "session root mode");
fs.chmodSync(sessRoot, 0o755);
const second = await import(pathToFileURL(ext).href + "?second");
second.default(pi);
assertEq(fs.statSync(sessRoot).mode & 0o777, 0o700, "session root tightened");

// The trusted depth-1 orchestrator inherits the root map, then loses the
// orchestrator seat by construction while retaining all four work roles.
process.env.PI_SUBAGENT_DEPTH = "1";
const inheritedRootMap = process.env.PI_SUBAGENT_TRUSTED_AGENT_PATHS;
const nested = await import(pathToFileURL(ext).href + "?nested");
nested.default(pi);
const nestedMap = JSON.parse(process.env.PI_SUBAGENT_TRUSTED_AGENT_PATHS);
if ("orchestrator" in nestedMap) die("depth-1 child retained recursive orchestrator authority");
assertEq(Object.keys(nestedMap).sort().join(","), "implementer,observer,researcher,reviewer", "nested worker seats");
process.env.PI_SUBAGENT_TRUSTED_AGENT_PATHS = inheritedRootMap;
delete process.env.PI_SUBAGENT_DEPTH;

// Caller environment cannot override delegated role or compute authority.
// Runtime-root placement remains an explicit operator-owned override.
process.env.PI_SUBAGENT_PI_BINARY = "/tmp/caller-override";
process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS = "";
process.env.PI_SUBAGENT_TRUSTED_AGENT_PATHS = "{}";
process.env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES = "{}";
process.env.QQ_DISPATCH_RUNTIME_ROOT = "/tmp/operator-runtime-override";
const third = await import(pathToFileURL(ext).href + "?third");
third.default(pi);
assertEq(process.env.PI_SUBAGENT_PI_BINARY, `${root}/bin/qq-dispatch`, "dispatcher override rejected");
assertEq(process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS, `${root}/delegation/manifests/agents`, "manifest override rejected");
assertEq(process.env.PI_SUBAGENT_TRUSTED_AGENT_PATHS, JSON.stringify({
  orchestrator: `${root}/delegation/manifests/agents/orchestrator.md`,
  implementer: `${root}/delegation/manifests/agents/implementer.md`,
  observer: `${root}/delegation/manifests/agents/observer.md`,
  researcher: `${root}/delegation/manifests/agents/researcher.md`,
  reviewer: `${root}/delegation/manifests/agents/reviewer.md`,
}), "trusted-path override rejected");
assertEq(process.env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES, "__qq_execution_profile_resolver_required__", "profile override rejected");
assertEq(
  process.env.QQ_DISPATCH_RUNTIME_ROOT,
  "/tmp/operator-runtime-override",
  "runtime-root override preserved",
);

const clearDelegationEnv = () => {
  delete process.env.PI_SUBAGENT_PI_BINARY;
  delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;
  delete process.env.PI_SUBAGENT_TRUSTED_AGENT_PATHS;
  delete process.env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES;
  delete process.env.QQ_DISPATCH_RUNTIME_ROOT;
};
const assertCanonicalEnv = (label) => {
  assertEq(process.env.PI_SUBAGENT_PI_BINARY, `${root}/bin/qq-dispatch`, `${label} dispatcher`);
  assertEq(process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS, `${root}/delegation/manifests/agents`, `${label} manifests`);
  assertEq(process.env.PI_SUBAGENT_TRUSTED_AGENT_PATHS, JSON.stringify({
    implementer: `${root}/delegation/manifests/agents/implementer.md`,
    observer: `${root}/delegation/manifests/agents/observer.md`,
    researcher: `${root}/delegation/manifests/agents/researcher.md`,
    reviewer: `${root}/delegation/manifests/agents/reviewer.md`,
  }), `${label} trusted manifests`);
  assertEq(
    process.env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES,
    "__qq_execution_profile_resolver_required__",
    `${label} profiles poisoned`,
  );
};

// An external Repository governed through the canonical AGENTS.md receives
// canonical qq worker configuration from the canonical qq source checkout.
const external = fs.mkdtempSync(path.join(os.tmpdir(), "qq-external-"));
await import("node:child_process").then(({ execFileSync }) => execFileSync("git", ["init", "-q", "-b", "main", external]));
fs.symlinkSync(path.join(root, "AGENTS.md"), path.join(external, "AGENTS.md"));
process.chdir(external);
clearDelegationEnv();
const externalRoot = path.join(os.tmpdir(), `pi-subagent-external-${process.pid}`);
fs.writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify({ defaultSessionDir: externalRoot }));
const externalModule = await import(pathToFileURL(ext).href + "?external");
externalModule.default(pi);
assertCanonicalEnv("external");
if (!fs.existsSync(externalRoot)) die("external session root was not created");

// Unrelated Git and non-Git sessions remain untouched rather than inheriting
// forged delegation authority from the ambient process.
const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), "qq-unrelated-"));
await import("node:child_process").then(({ execFileSync }) => execFileSync("git", ["init", "-q", unrelated]));
process.chdir(unrelated);
clearDelegationEnv();
const unrelatedModule = await import(pathToFileURL(ext).href + "?unrelated");
unrelatedModule.default(pi);
assertEq(process.env.PI_SUBAGENT_PI_BINARY, undefined, "unrelated dispatcher");

const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), "qq-non-git-"));
process.chdir(nonGit);
clearDelegationEnv();
const nonGitRoot = path.join(os.tmpdir(), `pi-subagent-non-git-${process.pid}`);
fs.writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify({ defaultSessionDir: nonGitRoot }));
const nonGitModule = await import(pathToFileURL(ext).href + "?non-git");
nonGitModule.default(pi);
assertEq(process.env.PI_SUBAGENT_PI_BINARY, undefined, "non-Git dispatcher");
if (fs.existsSync(nonGitRoot)) die("non-Git session root was created");

// A configured root outside the adapter-accepted set is left untouched.
const outside = path.join(home, "outside-root");
fs.writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify({ defaultSessionDir: outside }));
const fourth = await import(pathToFileURL(ext).href + "?fourth");
fourth.default(pi);
if (fs.existsSync(outside)) die("extension created a root outside the accepted set");

fs.rmSync(sessRoot, { recursive: true, force: true });
fs.rmSync(external, { recursive: true, force: true });
fs.rmSync(unrelated, { recursive: true, force: true });
fs.rmSync(nonGit, { recursive: true, force: true });
fs.rmSync(externalRoot, { recursive: true, force: true });
fs.rmSync(nonGitRoot, { recursive: true, force: true });
fs.rmSync(home, { recursive: true, force: true });
' || fail "extension behavior mismatch"

# The targets the extension points at must exist in this checkout.
[ -x "$ROOT/bin/qq-dispatch" ] || fail "extension target missing: bin/qq-dispatch"
for role in orchestrator implementer observer reviewer researcher; do
  [ -f "$ROOT/delegation/manifests/agents/$role.md" ] || fail "extension target missing: $role manifest"
done

# README Install documents the extension as the by-construction mechanism.
assert_file_contains "$ROOT/README.md" 'extensions/qq-subagent-env.ts'
assert_file_contains "$ROOT/README.md" 'ln -sT "$HOME/projects/qq/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"'
assert_file_contains "$ROOT/README.md" 'project-trust mechanism remains authoritative'

# Pivot tripwire: the shell surface must not re-introduce shell-level exports.
if grep -q 'export PI_SUBAGENT' "$ROOT/cockpit/shell/file-navigation.bash"; then
  fail "file-navigation.bash re-exports PI_SUBAGENT_* (mechanism moved to extensions/qq-subagent-env.ts)"
fi

printf 'test-qq-subagent-env: pass\n'
