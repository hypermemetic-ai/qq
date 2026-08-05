#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-methodology-linkage"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
RAIL="$ROOT/bin/qq-methodology"
EXTENSION="$ROOT/extensions/qq-methodology.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[[ -x "$RAIL" ]] || fail "missing methodology activation rail: $RAIL"
command -v node >/dev/null 2>&1 || fail 'node is required to test methodology bootstrap behavior'

repository="$TMP/repository"
unlinked="$TMP/unlinked"
invalid="$TMP/invalid"
malformed="$TMP/malformed"
non_git="$TMP/non-git"
mkdir -p "$non_git"
for repo in "$repository" "$unlinked" "$invalid" "$malformed"; do
  git init -q -b main "$repo"
  git -C "$repo" config user.name 'Methodology Test'
  git -C "$repo" config user.email 'methodology@example.invalid'
  printf 'fixture\n' >"$repo/file.txt"
  git -C "$repo" add file.txt
  git -C "$repo" commit -qm initial
done

inspect_output="$(cd "$repository" && "$RAIL" inspect)"
assert_contains "$inspect_output" 'unlinked:'
assert_contains "$inspect_output" 'qq.methodology is absent'

link_output="$(cd "$repository" && "$RAIL" link)"
assert_contains "$link_output" 'qq.methodology=true'
assert_contains "$link_output" 'fresh Pi session or run /reload'
assert_equal true "$(git -C "$repository" config --local --type=bool --get qq.methodology)"
(cd "$repository" && "$RAIL" link >/dev/null)
assert_equal 1 "$(git -C "$repository" config --local --get-all qq.methodology | wc -l)" \
  'idempotent link created multiple local values'

worktree="$TMP/linked-worktree"
git -C "$repository" worktree add -q -b linked-worktree "$worktree"
worktree_inspect="$(cd "$worktree" && "$RAIL" inspect)"
assert_contains "$worktree_inspect" 'linked: qq.methodology=true'

clone="$TMP/fresh-clone"
git clone -q "$repository" "$clone"
clone_inspect="$(cd "$clone" && "$RAIL" inspect)"
assert_contains "$clone_inspect" 'unlinked:'
assert_contains "$clone_inspect" 'qq.methodology is absent'

# Invalid and ambiguous values never activate.
git -C "$invalid" config --local --add qq.methodology true
git -C "$invalid" config --local --add qq.methodology false
invalid_inspect="$(cd "$invalid" && "$RAIL" inspect)"
assert_contains "$invalid_inspect" 'unlinked (invalid)'
assert_contains "$invalid_inspect" 'multiple local values'
git -C "$malformed" config --local qq.methodology definitely-not-a-boolean
malformed_inspect="$(cd "$malformed" && "$RAIL" inspect)"
assert_contains "$malformed_inspect" 'unlinked (invalid)'
assert_contains "$malformed_inspect" 'not a readable Git boolean'

non_git_inspect="$(cd "$non_git" && "$RAIL" inspect)"
assert_contains "$non_git_inspect" 'unlinked:'
assert_contains "$non_git_inspect" 'not inside a Git Repository'
if (cd "$non_git" && "$RAIL" link >"$TMP/non-git-link.out" 2>"$TMP/non-git-link.err"); then
  fail 'link rail accepted a non-Git directory'
fi
assert_file_contains "$TMP/non-git-link.err" 'not inside a Git Repository'

unlink_output="$(cd "$worktree" && "$RAIL" unlink)"
assert_contains "$unlink_output" 'fresh Pi session or run /reload'
if git -C "$repository" config --local --get qq.methodology >/dev/null 2>&1; then
  fail 'unlink from a linked worktree did not clear the common Repository bit'
fi
# Unlink is idempotent.
(cd "$repository" && "$RAIL" unlink >/dev/null)

# Installation/cutover tests use only disposable HOME directories.
install_home="$TMP/install-home"
install_output="$(HOME="$install_home" "$RAIL" install)"
assert_contains "$install_output" 'no unconditional qq context, Skill, or prompt mounts remain'
[[ -L "$install_home/.pi/agent/extensions/qq" ]] || fail 'bootstrap symlink was not installed'
assert_equal "$(readlink -f "$ROOT/extensions")" \
  "$(readlink -f "$install_home/.pi/agent/extensions/qq")" \
  'bootstrap symlink does not resolve to this checkout'
for legacy in \
  "$install_home/.pi/agent/AGENTS.md" \
  "$install_home/.pi/agent/skills" \
  "$install_home/.pi/agent/prompts/bro.md" \
  "$install_home/.pi/agent/prompts/check-in.md"; do
  [[ ! -e "$legacy" && ! -L "$legacy" ]] || fail "legacy mount survived install: $legacy"
done
HOME="$install_home" "$RAIL" install >/dev/null

cutover_home="$TMP/cutover-home"
mkdir -p "$cutover_home/.pi/agent/prompts"
ln -sT "$ROOT/AGENTS.md" "$cutover_home/.pi/agent/AGENTS.md"
ln -sT "$ROOT/skills" "$cutover_home/.pi/agent/skills"
ln -sT "$ROOT/.pi/prompts/bro.md" "$cutover_home/.pi/agent/prompts/bro.md"
ln -sT "$ROOT/.pi/prompts/check-in.md" "$cutover_home/.pi/agent/prompts/check-in.md"
HOME="$cutover_home" "$RAIL" install >/dev/null
[[ -L "$cutover_home/.pi/agent/extensions/qq" ]] || fail 'cutover did not install bootstrap'
for legacy in \
  "$cutover_home/.pi/agent/AGENTS.md" \
  "$cutover_home/.pi/agent/skills" \
  "$cutover_home/.pi/agent/prompts/bro.md" \
  "$cutover_home/.pi/agent/prompts/check-in.md"; do
  [[ ! -e "$legacy" && ! -L "$legacy" ]] || fail "safe legacy mount survived cutover: $legacy"
done

foreign_home="$TMP/foreign-home"
mkdir -p "$foreign_home/.pi/agent"
printf 'foreign\n' >"$foreign_home/.pi/agent/AGENTS.md"
if HOME="$foreign_home" "$RAIL" install >"$TMP/foreign.out" 2>"$TMP/foreign.err"; then
  fail 'installer replaced a foreign regular legacy path'
fi
assert_file_contains "$TMP/foreign.err" 'refusing to replace it'
[[ ! -e "$foreign_home/.pi/agent/extensions/qq" ]] \
  || fail 'installer partially created bootstrap before refusing a foreign path'
assert_equal foreign "$(tr -d '\n' <"$foreign_home/.pi/agent/AGENTS.md")"

foreign_extension_home="$TMP/foreign-extension-home"
mkdir -p "$foreign_extension_home/.pi/agent/extensions"
ln -sT "$TMP/non-git" "$foreign_extension_home/.pi/agent/extensions/qq"
if HOME="$foreign_extension_home" "$RAIL" install \
  >"$TMP/foreign-extension.out" 2>"$TMP/foreign-extension.err"; then
  fail 'installer replaced a foreign bootstrap symlink'
fi
assert_file_contains "$TMP/foreign-extension.err" 'foreign symlink'
assert_equal "$(readlink -f "$TMP/non-git")" \
  "$(readlink -f "$foreign_extension_home/.pi/agent/extensions/qq")"

bundle="$TMP/bundle"
runtime_repo="$TMP/runtime-repository"
mkdir -p "$bundle/skills/example" "$bundle/.pi/prompts" "$bundle/extensions" "$runtime_repo"
printf 'AGENTS SNAPSHOT ONE\n' >"$bundle/AGENTS.md"
printf 'CONCEPTS SNAPSHOT ONE\n' >"$bundle/CONCEPTS.md"
printf 'skill one\n' >"$bundle/skills/example/SKILL.md"
printf 'prompt one\n' >"$bundle/.pi/prompts/example.md"
printf 'extension one\n' >"$bundle/extensions/example.ts"
printf 'LOCAL VOCABULARY ONE\n' >"$runtime_repo/CONCEPTS.local.md"

node --input-type=module - "$EXTENSION" "$repository" "$unlinked" "$invalid" "$malformed" "$non_git" "$bundle" "$runtime_repo" <<'JS'
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [
  extensionPath,
  linkedRepository,
  unlinkedRepository,
  invalidRepository,
  malformedRepository,
  nonGitDirectory,
  bundleRoot,
  runtimeRepository,
] = process.argv.slice(2);
const { default: register, inspectMethodologyLink } = await import(
  pathToFileURL(extensionPath)
);

assert.equal((await inspectMethodologyLink(nonGitDirectory, { gitBin: "git" })).linked, false);
assert.equal((await inspectMethodologyLink(unlinkedRepository, { gitBin: "git" })).state, "unlinked");
assert.equal((await inspectMethodologyLink(invalidRepository, { gitBin: "git" })).state, "invalid");
assert.equal((await inspectMethodologyLink(malformedRepository, { gitBin: "git" })).state, "invalid");
// The shell portion deliberately unlinked this Repository through its worktree.
assert.equal((await inspectMethodologyLink(linkedRepository, { gitBin: "git" })).linked, false);

function runtime() {
  const handlers = new Map();
  const registrations = [];
  const messages = [];
  const pi = {
    on(name, handler) {
      const entries = handlers.get(name) ?? [];
      entries.push(handler);
      handlers.set(name, entries);
      registrations.push(`listener:${name}`);
    },
    registerTool(tool) {
      registrations.push(`tool:${tool.name}`);
    },
    registerCommand(name) {
      registrations.push(`command:${name}`);
    },
    registerShortcut(name) {
      registrations.push(`shortcut:${name}`);
    },
    sendMessage(message) {
      messages.push(message);
    },
  };
  return { pi, handlers, registrations, messages };
}

async function emit(instance, name, event, context) {
  const results = [];
  for (const handler of instance.handlers.get(name) ?? []) {
    results.push(await handler(event, context));
  }
  return results;
}

function watcherHarness() {
  const records = [];
  const watch = (path, options, callback) => {
    const errors = [];
    const record = {
      path,
      options,
      callback,
      errors,
      closed: false,
      on(name, handler) {
        if (name === "error") errors.push(handler);
        return this;
      },
      close() {
        this.closed = true;
      },
    };
    records.push(record);
    return record;
  };
  return { watch, records };
}

function context(trusted = true) {
  const statuses = [];
  const notifications = [];
  return {
    hasUI: true,
    statuses,
    notifications,
    isProjectTrusted: () => trusted,
    ui: {
      setStatus(key, text) {
        statuses.push([key, text]);
      },
      notify(text, level) {
        notifications.push([text, level]);
      },
    },
  };
}

let siblingCalls = 0;
const unlinked = runtime();
await register(unlinked.pi, {
  cwd: nonGitDirectory,
  inspectLink: async () => ({ linked: false, state: "non-git" }),
  siblingRegisters: [() => siblingCalls++],
});
assert.deepEqual(unlinked.registrations, []);
assert.equal(siblingCalls, 0, "unlinked runtime loaded a sibling extension");

const watches = watcherHarness();
const linked = runtime();
await register(linked.pi, {
  cwd: runtimeRepository,
  bundleRoot,
  inspectLink: async () => ({
    linked: true,
    state: "linked",
    repositoryRoot: runtimeRepository,
  }),
  siblingRegisters: [
    (pi) => {
      siblingCalls++;
      pi.registerTool({ name: "linked_fixture_tool" });
    },
  ],
  watch: watches.watch,
});
assert.equal(siblingCalls, 1);
assert.ok(linked.registrations.includes("tool:linked_fixture_tool"));

const linkedContext = context(true);
await emit(linked, "session_start", { reason: "startup" }, linkedContext);
assert.equal(watches.records.length, 5, "bootstrap did not watch the five canonical resource roots");
assert.deepEqual(
  watches.records.map((record) => record.path).sort(),
  [
    join(bundleRoot, "AGENTS.md"),
    join(bundleRoot, "CONCEPTS.md"),
    join(bundleRoot, "skills"),
    join(bundleRoot, ".pi", "prompts"),
    join(bundleRoot, "extensions"),
  ].sort(),
);
assert.deepEqual(linkedContext.statuses, [["qq-methodology-update", undefined]]);

const [resources] = await emit(
  linked,
  "resources_discover",
  { reason: "startup", cwd: runtimeRepository },
  linkedContext,
);
assert.deepEqual(resources, {
  skillPaths: [join(bundleRoot, "skills")],
  promptPaths: [join(bundleRoot, ".pi", "prompts")],
});

const [firstTurn] = await emit(
  linked,
  "before_agent_start",
  {
    systemPrompt: "PI BASE\nPROJECT AGENT CONTEXT",
    systemPromptOptions: { contextFiles: [{ path: "AGENTS.md", content: "PROJECT AGENT CONTEXT" }] },
  },
  linkedContext,
);
assert.match(firstTurn.systemPrompt, /AGENTS SNAPSHOT ONE/);
assert.match(firstTurn.systemPrompt, /CONCEPTS SNAPSHOT ONE/);
assert.match(firstTurn.systemPrompt, /LOCAL VOCABULARY ONE/);
assert.match(firstTurn.systemPrompt, /PROJECT AGENT CONTEXT/);

const [deduplicatedTurn] = await emit(
  linked,
  "before_agent_start",
  {
    systemPrompt: "PI BASE\nAGENTS SNAPSHOT ONE",
    systemPromptOptions: {
      contextFiles: [{ path: "AGENTS.md", content: "AGENTS SNAPSHOT ONE\n" }],
    },
  },
  linkedContext,
);
assert.doesNotMatch(deduplicatedTurn.systemPrompt, /## Canonical AGENTS\.md/);
assert.match(deduplicatedTurn.systemPrompt, /CONCEPTS SNAPSHOT ONE/);

await writeFile(join(bundleRoot, "AGENTS.md"), "AGENTS SNAPSHOT TWO\n");
await writeFile(join(bundleRoot, "CONCEPTS.md"), "CONCEPTS SNAPSHOT TWO\n");
await writeFile(join(runtimeRepository, "CONCEPTS.local.md"), "LOCAL VOCABULARY TWO\n");
for (const record of watches.records) {
  record.callback("change", "fixture");
  record.callback("change", "fixture-again");
}
assert.equal(
  linkedContext.statuses.filter(([, text]) => text === "qq update available").length,
  1,
  "canonical changes did not coalesce to one persistent update state",
);
assert.deepEqual(linked.messages, [], "update awareness emitted a model-visible message");

const [snapshotTurn] = await emit(
  linked,
  "before_agent_start",
  { systemPrompt: "PI BASE", systemPromptOptions: { contextFiles: [] } },
  linkedContext,
);
assert.match(snapshotTurn.systemPrompt, /AGENTS SNAPSHOT ONE/);
assert.match(snapshotTurn.systemPrompt, /CONCEPTS SNAPSHOT ONE/);
assert.match(snapshotTurn.systemPrompt, /LOCAL VOCABULARY ONE/);
assert.doesNotMatch(snapshotTurn.systemPrompt, /SNAPSHOT TWO/);
assert.doesNotMatch(snapshotTurn.systemPrompt, /qq update available/);

await emit(linked, "session_shutdown", { reason: "reload" }, linkedContext);
assert.ok(watches.records.every((record) => record.closed), "shutdown left a canonical watcher open");
assert.deepEqual(linkedContext.statuses.at(-1), ["qq-methodology-update", undefined]);
const statusCountAfterShutdown = linkedContext.statuses.length;
watches.records[0].callback("change", "after-shutdown");
assert.equal(linkedContext.statuses.length, statusCountAfterShutdown);

// A successful explicit reload builds a fresh runtime/current snapshot and
// starts with the update status clear.
const reloadWatches = watcherHarness();
const reloaded = runtime();
await register(reloaded.pi, {
  cwd: runtimeRepository,
  bundleRoot,
  inspectLink: async () => ({
    linked: true,
    state: "linked",
    repositoryRoot: runtimeRepository,
  }),
  siblingRegisters: [],
  watch: reloadWatches.watch,
});
const reloadedContext = context(true);
await emit(reloaded, "session_start", { reason: "reload" }, reloadedContext);
assert.deepEqual(reloadedContext.statuses, [["qq-methodology-update", undefined]]);
const [currentTurn] = await emit(
  reloaded,
  "before_agent_start",
  { systemPrompt: "PI BASE", systemPromptOptions: { contextFiles: [] } },
  reloadedContext,
);
assert.match(currentTurn.systemPrompt, /AGENTS SNAPSHOT TWO/);
assert.match(currentTurn.systemPrompt, /CONCEPTS SNAPSHOT TWO/);
assert.match(currentTurn.systemPrompt, /LOCAL VOCABULARY TWO/);
assert.doesNotMatch(currentTurn.systemPrompt, /SNAPSHOT ONE/);

const untrusted = runtime();
await register(untrusted.pi, {
  cwd: runtimeRepository,
  bundleRoot,
  inspectLink: async () => ({
    linked: true,
    state: "linked",
    repositoryRoot: runtimeRepository,
  }),
  siblingRegisters: [],
  watch: watcherHarness().watch,
});
const untrustedContext = context(false);
await emit(untrusted, "session_start", { reason: "startup" }, untrustedContext);
const [untrustedTurn] = await emit(
  untrusted,
  "before_agent_start",
  { systemPrompt: "PI BASE", systemPromptOptions: { contextFiles: [] } },
  untrustedContext,
);
assert.doesNotMatch(untrustedTurn.systemPrompt, /LOCAL VOCABULARY TWO/);

JS

printf 'test-qq-methodology-linkage: pass\n'
