#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const read = (path) => readFile(join(root, path), "utf8");
const json = async (path) => JSON.parse(await read(path));

const [pkg, pins, toolchain, toolchainLock, evidence, run, patch, relayStub, messages, review, scrub, runLib] = await Promise.all([
  json("package.json"),
  json("compat/pi2dsh/pins.json"),
  json("compat/pi2dsh/toolchain/package.json"),
  json("compat/pi2dsh/toolchain/package-lock.json"),
  json("compat/pi2dsh/evidence.json"),
  read("compat/pi2dsh/run.sh"),
  read("compat/pi2dsh/qq.patch.yml"),
  read("compat/pi2dsh/relay-stub/client.mjs"),
  read("extensions/agent-messages.ts"),
  read("extensions/review-flow.ts"),
  read("extensions/session-scrub.ts"),
  read("bin/lib/run.mjs"),
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
assert.match(run, /QQ_RELAY_INSTALL_ROOT="\$here\/relay-stub"/);
assert.match(patch, /id: tool-fs\s+disabled: true/);
assert.match(relayStub, /outside the pi2dsh mount probe/);

assert.equal(evidence.schema, "qq.pi2dsh-evidence/v1");
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
assert.equal(evidence.conclusion.native_translation_started, false);
const probes = new Map(evidence.probes.map((probe) => [probe.id, probe]));
for (const id of [
  "package-local-events", "before-agent-start", "tools", "commands", "model-selection",
  "thinking-effort", "shortcut", "session-tree", "shutdown", "project-trust",
  "read-tool-collision", "session-id", "qq-relay-client", "herdr-launch", "herdr-delivery-proof",
  "relay-receipts", "session-scrub",
]) assert.ok(probes.has(id), `missing compatibility probe ${id}`);

// Herdr orchestration remains explicitly Pi-owned and proves prompt acceptance
// by opening the path in Herdr's Pi session descriptor.
assert.match(runLib, /"agent", "start", `runner-\$\{slug\}-\$\{nonce\}`, "--kind", "pi"/);
assert.match(runLib, /agent\.agent !== "pi"/);
assert.match(runLib, /session\.source !== "herdr:pi"/);
assert.match(runLib, /path\.endsWith\("\.jsonl"\)/);
assert.match(runLib, /sessionHasPromptMarker\(path, marker\)/);

// Relay and review acknowledgement read Pi JSONL directly instead of asking
// the host's durable-session API.
for (const source of [messages, review]) {
  assert.match(source, /sessionManager\?\.getSessionFile\?\.\(\)/);
  assert.match(source, /readFile\(path, "utf8"\)/);
  assert.match(source, /JSON\.parse\(line\)/);
}
assert.match(messages, /value\?\.type === "custom_message"/);
assert.match(review, /value\?\.type === "custom_message"/);

// Scrubbing is tied to Pi's transcript root and Pi's /new event shape.
assert.match(scrub, /"\.pi", "agent", "sessions"/);
assert.match(scrub, /event\?\.reason !== "new"/);
assert.match(scrub, /previousSessionFile/);

execFileSync("git", ["cat-file", "-e", `${pins.qq.revision}^{commit}`], { cwd: root, stdio: "ignore" });
execFileSync("git", ["diff", "--quiet", pins.qq.revision, "--", "extensions"], { cwd: root, stdio: "ignore" });

console.log("pi2dsh compatibility baseline test passed");
