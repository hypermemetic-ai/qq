#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const read = (path) => readFile(join(root, path), "utf8");
const json = async (path) => JSON.parse(await read(path));

const [pkg, pins, toolchain, toolchainLock, evidence, run, patch, relayProbe, relayContract, liveMessages, messages, review, scrub, runLib, runEvents] = await Promise.all([
  json("package.json"),
  json("compat/pi2dsh/pins.json"),
  json("compat/pi2dsh/toolchain/package.json"),
  json("compat/pi2dsh/toolchain/package-lock.json"),
  json("compat/pi2dsh/evidence.json"),
  read("compat/pi2dsh/run.sh"),
  read("compat/pi2dsh/qq.patch.yml"),
  read("compat/pi2dsh/relay-probe.mjs"),
  read("tests/test-qq-relay.sh"),
  read("tests/test-agent-messages-live.sh"),
  read("extensions/agent-messages.ts"),
  read("extensions/review-flow.ts"),
  read("extensions/session-scrub.ts"),
  read("bin/lib/run.mjs"),
  read("bin/lib/run-events.mjs"),
]);

assert.deepEqual(pkg.pi, { extensions: ["extensions/index.ts"] });
assert.equal(pins.schema, "qq.pi2dsh-pins/v1");
assert.match(pins.qq.revision, /^[a-f0-9]{40}$/);
for (const key of ["pi2dsh", "dsh"]) {
  assert.match(pins[key].revision, /^[a-f0-9]{40}$/);
  assert.match(pins[key].version, /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/);
  assert.match(pins[key].integrity, /^sha512-/);
  assert.equal(toolchain.dependencies[pins[key].package], pins[key].version);
  assert.equal(toolchainLock.packages[`node_modules/${pins[key].package}`].integrity, pins[key].integrity);
}
assert.equal(toolchain.dependencies.typescript, pins.typescript.version);
assert.match(run, /npm ci --prefix/);
assert.match(run, /diff --quiet "\$qq_revision" -- extensions/);
assert.match(run, /plugin --profile headless add/);
assert.match(run, /--patch "\$here\/qq\.patch\.yml"/);
assert.match(run, /QQ_PI2DSH_RELAY_STATE_HOME/);
assert.match(run, /QQ_RELAY_INSTALL_ROOT="\$relay_install_root"/);
assert.match(run, /relay-probe\.mjs/);
assert.match(run, /relay-proof\.json/);
assert.match(run, /QQ_AGENT_ROLE=architect/);
assert.doesNotMatch(run, /relay-stub|RECEIPT_PROBE|RELAY_PROBE/);
assert.match(run, /llm-stub\.mjs/);
assert.match(patch, /id: tool-fs\s+disabled: true/);
assert.match(patch, /id: session-persistence-jsonl[\s\S]*compression: none/);
assert.match(relayProbe, /bin\/lib\/qq-relay-client\.mjs/);
assert.match(relayProbe, /client\.send\(/);
assert.match(relayProbe, /client\.status\(/);
assert.match(relayProbe, /bin\/lib\/run-events\.mjs/);
assert.match(relayProbe, /sendRunEvent\(/);
assert.match(relayProbe, /qq\/review-flow\/\$\{recipientSessionId\}/);
assert.match(relayContract, /rm -rf -- "\$work\/source"[\s\S]*test-agent-messages-live\.sh/);
assert.match(liveMessages, /qq-relay" serve --state-dir "\$relay_state_dir"/);
assert.match(liveMessages, /QQ_PI2DSH_RELAY_STATE_HOME="\$relay_state_home" "\$ROOT\/compat\/pi2dsh\/run\.sh"/);

assert.equal(evidence.schema, "qq.pi2dsh-evidence/v1");
assert.equal(evidence.observed_at, "2026-08-16");
assert.equal(evidence.pins_file, "compat/pi2dsh/pins.json");
assert.deepEqual(evidence.inspection, {
  verdict: "review",
  extensions: ["extensions/index.ts"],
  full: 66,
  partial: 57,
  unsupported: 0,
  fatal: 0,
});
assert.equal(evidence.conclusion.operator_cutover, "blocked");
assert.equal(evidence.conclusion.native_translation_started, true);
const probes = new Map(evidence.probes.map((probe) => [probe.id, probe]));
for (const id of [
  "package-local-events", "before-agent-start", "tools", "commands", "model-selection",
  "thinking-effort", "shortcut", "session-tree", "shutdown", "project-trust",
  "read-tool-collision", "session-id", "qq-relay-client", "herdr-launch", "herdr-delivery-proof",
  "agent-message-receipts", "run-outcome-addressing", "review-receipts", "session-scrub",
]) assert.ok(probes.has(id), `missing compatibility probe ${id}`);
assert.equal(probes.get("session-id").verdict, "identity-translated");
assert.match(probes.get("session-id").fact, /complete value unchanged as the live relay address/);
assert.equal(probes.get("qq-relay-client").verdict, "installed-product-proven");
assert.equal(probes.get("agent-message-receipts").verdict, "installed-transport-and-durable-entry-proven");
assert.equal(probes.get("run-outcome-addressing").verdict, "installed-address-and-parse-proven");
assert.match(probes.get("run-outcome-addressing").fact, /qq\/review-flow\/session-<UUID>/);
assert.equal(probes.get("review-receipts").verdict, "installed-durable-entry-proven");
assert.ok(evidence.conclusion.blockers.every((blocker) => !/qq-relay client boundary|review events/i.test(blocker)));

// Herdr orchestration remains explicitly Pi-owned and proves prompt acceptance
// by opening the path in Herdr's Pi session descriptor.
assert.match(runLib, /"agent", "start", `runner-\$\{slug\}-\$\{nonce\}`, "--kind", "pi"/);
assert.match(runLib, /agent\.agent !== "pi"/);
assert.match(runLib, /session\.source !== "herdr:pi"/);
assert.match(runLib, /path\.endsWith\("\.jsonl"\)/);
assert.match(runLib, /sessionHasPromptMarker\(path, marker\)/);

// Run outcomes accept only canonical Pi UUIDs or pinned DSH session-UUIDs.
assert.match(runEvents, /DSH_SESSION_ID = \/\^session-/);
assert.match(runEvents, /review-flow\/\$\{sessionId\}/);

// Agent-message and review-flow acknowledgement use only host-managed entries.
assert.doesNotMatch(messages, /getSessionFile/);
assert.match(messages, /sessionManager\?\.getEntries\?\.\(\)/);
assert.doesNotMatch(messages, /JSON\.parse\(line\)/);
assert.doesNotMatch(review, /getSessionFile/);
assert.match(review, /sessionManager\?\.getEntries\?\.\(\)/);
assert.doesNotMatch(review, /JSON\.parse\(line\)/);
assert.match(review, /entry\?\.type === "custom_message"/);
assert.match(review, /entry\?\.type === "message"/);

// Scrubbing is tied to Pi's transcript root and Pi's /new event shape.
assert.match(scrub, /"\.pi", "agent", "sessions"/);
assert.match(scrub, /event\?\.reason !== "new"/);
assert.match(scrub, /previousSessionFile/);

execFileSync("git", ["cat-file", "-e", `${pins.qq.revision}^{commit}`], { cwd: root, stdio: "ignore" });
execFileSync("git", ["diff", "--quiet", pins.qq.revision, "--", "extensions"], { cwd: root, stdio: "ignore" });

console.log("pi2dsh compatibility baseline test passed");
