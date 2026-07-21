#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-code-trial"
# shellcheck source=tests/helpers.sh
# shellcheck disable=SC1091
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"

command -v node >/dev/null 2>&1 || fail "node is required"

PI_ENTRY="$(readlink -f "$(command -v pi)")"
ROOT="$ROOT" PI_ENTRY="$PI_ENTRY" node --experimental-strip-types --input-type=module - <<'JS'
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.ROOT;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "qq-code-trial-test-"));
process.on("exit", () => fs.rmSync(temporary, { recursive: true, force: true }));

const stateBase = path.join(temporary, "state");
const agentDir = path.join(temporary, "pi-agent");
process.env.XDG_STATE_HOME = stateBase;
process.env.PI_CODING_AGENT_DIR = agentDir;

const core = await import(pathToFileURL(path.join(root, "lib/qq-code-trial.mjs")));
const piEntryUrl = pathToFileURL(path.join(path.dirname(process.env.PI_ENTRY), "index.js")).href;
const piImportHook = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "@earendil-works/pi-coding-agent") {
			return { url: piEntryUrl, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
});
const extension = await import(pathToFileURL(path.join(root, ".pi/extensions/qq-code-tool-trial.ts")));
piImportHook.deregister();
const paths = core.statePaths({ env: process.env, repositoryRoot: root });

// Fixed schedule: every pair is split and the first 40 are exactly 20/20.
const arms = [];
for (let index = 1; index <= 40; index += 1) arms.push(core.armForIndex(index));
assert.equal(arms.filter((arm) => arm === "control").length, 20);
assert.equal(arms.filter((arm) => arm === "treatment").length, 20);
for (let index = 0; index < 40; index += 2) {
	assert.deepEqual(new Set(arms.slice(index, index + 2)), new Set(["control", "treatment"]));
}
assert.deepEqual(arms, Array.from({ length: 40 }, (_, offset) => core.armForIndex(offset + 1)));

function harness() {
	const handlers = new Map();
	const tools = new Map([
		["read", { name: "read", promptSnippet: "read files" }],
		["bash", { name: "bash", promptSnippet: "run commands" }],
		["edit", { name: "edit", promptSnippet: "edit files" }],
		["write", { name: "write", promptSnippet: "write files" }],
	]);
	let activeTools = ["read", "bash", "edit", "write"];
	const notifications = [];
	let aborted = false;
	const pi = {
		on(name, handler) {
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
		},
		registerTool(tool) {
			assert(!tools.has(tool.name), `duplicate tool ${tool.name}`);
			tools.set(tool.name, tool);
		},
		getAllTools() {
			return [...tools.values()];
		},
		getActiveTools() {
			return [...activeTools];
		},
		setActiveTools(names) {
			activeTools = [...new Set(names)].filter((name) => tools.has(name));
		},
	};
	const ctx = {
		cwd: root,
		hasUI: true,
		model: { provider: "example-provider", id: "example-model" },
		sessionManager: {
			getSessionId: () => "session-test-1",
			getSessionFile: () => path.join(temporary, "session.jsonl"),
		},
		ui: { notify: (message, level) => notifications.push({ message, level }) },
		abort: () => { aborted = true; },
	};
	async function emit(name, event = {}) {
		let result;
		for (const handler of [...(handlers.get(name) ?? [])]) {
			const candidate = await handler({ type: name, ...event }, ctx);
			if (candidate !== undefined) result = candidate;
		}
		return result;
	}
	function promptEvent() {
		const selectedTools = [...activeTools];
		const toolSnippets = {};
		for (const name of selectedTools) {
			const snippet = tools.get(name)?.promptSnippet;
			if (snippet) toolSnippets[name] = snippet;
		}
		return { systemPromptOptions: { selectedTools, toolSnippets }, systemPrompt: "test" };
	}
	return {
		pi,
		ctx,
		emit,
		promptEvent,
		tools,
		notifications,
		activeTools: () => [...activeTools],
		aborted: () => aborted,
	};
}

const h = harness();
extension.default(h.pi);
const secretPrompt = "TOP-SECRET-PROMPT-CONTENT";

// Inertness: no package or state exists, yet an otherwise eligible input passes
// through without registration, assignment, or filesystem creation.
assert.equal((await h.emit("input", {
	text: secretPrompt,
	images: [],
	source: "interactive",
	streamingBehavior: undefined,
})).action, "continue");
assert(!h.tools.has("code"));
assert.equal(fs.existsSync(paths.root), false);

// A fake exact dependency in an isolated Pi tree lets the real wrapper and
// config path run without touching the operator-owned Pi installation.
const packageRoot = path.join(agentDir, "npm/node_modules/pi-code-tool");
fs.mkdirSync(path.join(packageRoot, "dist/pi"), { recursive: true });
fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({
	name: "pi-code-tool",
	version: "0.6.1",
	type: "module",
}));
fs.writeFileSync(path.join(packageRoot, "dist/pi/extension.js"), `
export function createPythonExtension(options) {
  globalThis.__qqTrialOptions = options;
  return async function register(pi) {
    pi.on("session_start", () => {});
    pi.registerTool({
      name: "code",
      label: "Code",
      description: "Run sandboxed Python.\\nPrefer this tool when you need to chain tool calls, loop, filter large\\nresults, or compute — do the work in code and print only what you need.\\nRules: factual mechanics",
      promptSnippet: "code: run sandboxed Python; host tools are callable as functions; state persists",
      promptGuidelines: ["Use code for multi-step tool workflows."],
      parameters: { type: "object" },
      async execute() { return { content: [], details: { status: "ok", calls: [] } }; },
    });
  };
}
`);

core.activateTrial(paths, { env: process.env });
assert.equal(fs.statSync(paths.activation).mode & 0o777, 0o600);
assert.equal(fs.statSync(paths.ledger).mode & 0o777, 0o600);

// The first schedule position is treatment. Assignment is the pre-treatment
// ledger boundary; exposure follows only after exact package/config checks.
assert.equal((await h.emit("input", {
	text: secretPrompt,
	images: [{ type: "image" }],
	source: "interactive",
	streamingBehavior: undefined,
})).action, "continue");
let evidence = core.readEvidence(paths);
assert.equal(evidence.assignments.size, 1);
assert.equal(evidence.assignments.get(1).arm, "treatment");
assert.equal(evidence.exposures.get(1).code_active, true);
assert(h.activeTools().includes("code"));
assert.deepEqual(globalThis.__qqTrialOptions, {
	toolName: "code",
	root,
	toolStore: false,
	noBuiltins: true,
	mountWorkspace: true,
	bridgePiTools: true,
	typeCheck: true,
	autoApprove: false,
	limits: { maxDurationSecs: 5, maxMemory: 64 * 1024 * 1024 },
});
await assert.rejects(
	import("@earendil-works/pi-coding-agent"),
	(error) => error?.code === "ERR_MODULE_NOT_FOUND",
	"temporary Pi peer resolver leaked after treatment import",
);
assert.deepEqual(h.tools.get("code").promptGuidelines, []);
assert(!h.tools.get("code").description.includes("Prefer this tool"));
assert(!h.tools.get("code").description.includes("Use code"));

await h.emit("before_agent_start", h.promptEvent());
assert(h.activeTools().includes("code"));
await h.emit("agent_start");
await h.emit("turn_start", { turnIndex: 0, timestamp: Date.now() });
await h.emit("message_end", {
	message: {
		role: "assistant",
		stopReason: "stop",
		usage: { input: 11, output: 2, cacheRead: 3, cacheWrite: 0 },
	},
});
await h.emit("agent_settled");
evidence = core.readEvidence(paths);
assert.equal(evidence.outcomes.get(1).status, "completed");
assert.equal(evidence.outcomes.get(1).code_invocations, 0, "treatment non-use disappeared");
assert.equal(evidence.outcomes.get(1).prompt_code_selected, true);
assert.equal(evidence.outcomes.get(1).prompt_code_snippet, true);
assert.equal(core.trialStatus(paths).writer_present, true);
assert.throws(() => core.unlockWriter(paths), /is still alive; refusing unlock/);

// The paired control assignment removes code before current prompt assembly.
assert.equal((await h.emit("input", {
	text: "second ordinary input",
	source: "rpc",
	streamingBehavior: undefined,
})).action, "continue");
assert(!h.activeTools().includes("code"));
await h.emit("before_agent_start", h.promptEvent());
assert(!h.activeTools().includes("code"));
await h.emit("agent_start");
await h.emit("turn_start", { turnIndex: 0, timestamp: Date.now() });
await h.emit("message_end", {
	message: {
		role: "assistant",
		stopReason: "stop",
		usage: { input: 13, output: 3, cacheRead: 0, cacheWrite: 1 },
	},
});
await h.emit("agent_settled");
evidence = core.readEvidence(paths);
assert.equal(evidence.assignments.get(2).arm, "control");
assert.equal(evidence.exposures.get(2).code_active, false);
assert.equal(evidence.outcomes.get(2).prompt_code_selected, false);
assert.equal(evidence.outcomes.get(2).prompt_code_snippet, false);

// A second live Pi collector is refused for the lifetime of the first
// extension runtime, even between enrolled inputs.
const concurrent = harness();
extension.default(concurrent.pi);
assert.equal((await concurrent.emit("input", {
	text: "concurrent collector input",
	source: "interactive",
	streamingBehavior: undefined,
})).action, "handled");
assert.match(concurrent.notifications[0].message, /already has a live writer/);
assert.equal(core.readEvidence(paths).assignments.size, 2);

// Extension messages, steering, follow-ups, slash commands, and shell commands
// do not consume indexes. An idle slash input also leaves code inactive.
for (const event of [
	{ text: "injected", source: "extension", streamingBehavior: undefined },
	{ text: "steer", source: "interactive", streamingBehavior: "steer" },
	{ text: "later", source: "interactive", streamingBehavior: "followUp" },
	{ text: "/skill:thing", source: "interactive", streamingBehavior: undefined },
	{ text: "  !pwd", source: "interactive", streamingBehavior: undefined },
]) await h.emit("input", event);
assert.equal(core.readEvidence(paths).assignments.size, 2);
assert(!h.activeTools().includes("code"));

// Interrupted/error runs remain assigned. Streaming operator activity counts
// against the current ITT record but does not create a new assignment.
await h.emit("input", { text: "third input", source: "interactive", streamingBehavior: undefined });
await h.emit("before_agent_start", h.promptEvent());
await h.emit("agent_start");
await h.emit("turn_start", { turnIndex: 0, timestamp: Date.now() });
await h.emit("tool_execution_start", { toolCallId: "c1", toolName: "code", args: {} });
await h.emit("tool_result", {
	toolCallId: "c1",
	toolName: "code",
	details: { status: "error", calls: ["read", "grep"] },
	isError: false,
});
await h.emit("tool_execution_end", { toolCallId: "c1", toolName: "code", isError: false });
await h.emit("input", { text: "please stop", source: "interactive", streamingBehavior: "steer" });
await h.emit("input", { text: "then summarize", source: "interactive", streamingBehavior: "followUp" });
await h.emit("message_end", {
	message: {
		role: "assistant",
		stopReason: "aborted",
		usage: { input: 17, output: 1, cacheRead: 0, cacheWrite: 0 },
	},
});
await h.emit("agent_settled");
let third = core.readEvidence(paths).outcomes.get(3);
assert.equal(third.status, "aborted");
assert.equal(third.code_invocations, 1);
assert.equal(third.code_inner_calls, 2);
assert.equal(third.code_failures, 1);
assert.equal(third.operator_interruptions, 1);
assert.equal(third.queued_followups, 1);
assert.equal(core.readEvidence(paths).assignments.size, 3);

await h.emit("input", { text: "fourth input", source: "interactive", streamingBehavior: undefined });
await h.emit("before_agent_start", h.promptEvent());
await h.emit("session_shutdown", { reason: "quit" });
assert.equal(core.readEvidence(paths).outcomes.get(4).status, "aborted");
assert.match(core.readEvidence(paths).outcomes.get(4).terminal_reason, /session_shutdown/);

await h.emit("input", { text: "fifth input", source: "interactive", streamingBehavior: undefined });
await h.emit("before_agent_start", h.promptEvent());
await h.emit("agent_start");
await h.emit("message_end", {
	message: {
		role: "assistant",
		stopReason: "length",
		usage: { input: 19, output: 4, cacheRead: 0, cacheWrite: 0 },
	},
});
await h.emit("agent_settled");
assert.equal(core.readEvidence(paths).outcomes.get(5).status, "error");

// The ledger stores only a digest and length, never the raw prompt.
const ledgerText = fs.readFileSync(paths.ledger, "utf8");
assert(!ledgerText.includes(secretPrompt));
assert(ledgerText.includes(core.digest(secretPrompt)));

// Status remains usable during collection; analysis refuses incomplete data.
assert.equal(core.trialStatus(paths).assignments, 5);
assert.throws(() => core.analyzeTrial(paths), /incomplete trial.*no causal verdict/);
core.deactivateTrial(paths);
assert.equal(fs.existsSync(paths.activation), false);
assert.equal(core.trialStatus(paths).active, false);
assert.throws(() => core.allocateAssignment(paths, {}), /trial is not active/);
await h.emit("session_shutdown", { reason: "quit" });
assert.equal(core.trialStatus(paths).writer_present, false);

// Surface validation is an input preflight: if Pi cannot activate the exact
// assigned set, the input is handled before any agent event and the treatment
// failure remains accounted in its assigned arm.
const originalStateHome = process.env.XDG_STATE_HOME;
const preflightEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "preflight-state") };
process.env.XDG_STATE_HOME = preflightEnv.XDG_STATE_HOME;
const preflightPaths = core.statePaths({ env: preflightEnv, repositoryRoot: root });
const brokenSurface = harness();
brokenSurface.pi.setActiveTools = () => {};
extension.default(brokenSurface.pi);
core.activateTrial(preflightPaths, { env: preflightEnv });
assert.equal((await brokenSurface.emit("input", {
	text: "preflight must fail",
	source: "interactive",
	streamingBehavior: undefined,
})).action, "handled");
const failedPreflight = core.readEvidence(preflightPaths);
assert.equal(failedPreflight.assignments.size, 1);
assert.equal(failedPreflight.exposures.size, 0);
assert.equal(failedPreflight.outcomes.get(1).status, "error");
assert.equal(failedPreflight.outcomes.get(1).agent_runs, 0);
await brokenSurface.emit("session_shutdown", { reason: "quit" });
assert.equal(core.trialStatus(preflightPaths).writer_present, false);
process.env.XDG_STATE_HOME = originalStateHome;

// Exact version enforcement occurs before activation or treatment registration.
fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({
	name: "pi-code-tool",
	version: "0.6.2",
	type: "module",
}));
assert.throws(() => core.verifyDependency({ env: process.env }), /expected pi-code-tool@0\.6\.1/);
fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({
	name: "pi-code-tool",
	version: "0.6.1",
	type: "module",
}));

// Unsafe leaves, symlink escapes, loose permissions, and a concurrent writer
// lock are refused rather than followed or repaired.
const unsafeEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "unsafe-state") };
const unsafePaths = core.statePaths({ env: unsafeEnv, repositoryRoot: root });
fs.mkdirSync(unsafePaths.root, { recursive: true });
const target = path.join(temporary, "ledger-target");
fs.writeFileSync(target, "", { mode: 0o600 });
fs.symlinkSync(target, unsafePaths.ledger);
assert.throws(() => core.activateTrial(unsafePaths, { env: unsafeEnv }), /unsafe trial state leaf/);

const looseEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "loose-state") };
const loosePaths = core.statePaths({ env: looseEnv, repositoryRoot: root });
core.activateTrial(loosePaths, { env: looseEnv });
fs.chmodSync(loosePaths.ledger, 0o644);
assert.throws(() => core.readEvidence(loosePaths), /expected mode 600/);

const lockEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "lock-state") };
const lockPaths = core.statePaths({ env: lockEnv, repositoryRoot: root });
core.activateTrial(lockPaths, { env: lockEnv });
fs.writeFileSync(lockPaths.lock, "other\n", { mode: 0o600 });
assert.throws(() => core.allocateAssignment(lockPaths, {}), /writer lock is already held/);

const staleEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "stale-writer-state") };
const stalePaths = core.statePaths({ env: staleEnv, repositoryRoot: root });
core.activateTrial(stalePaths, { env: staleEnv });
core.claimWriter(stalePaths, "stale-test-owner");
core.unlockWriter(stalePaths, { isProcessAlive: () => false });
assert.equal(core.trialStatus(stalePaths).writer_present, false);

const escapeBase = path.join(temporary, "escape-base");
const escapeTarget = path.join(temporary, "escape-target");
fs.mkdirSync(escapeBase);
fs.mkdirSync(escapeTarget);
fs.symlinkSync(escapeTarget, path.join(escapeBase, "qq"));
const escapePaths = core.statePaths({ env: { ...process.env, XDG_STATE_HOME: escapeBase }, repositoryRoot: root });
assert.throws(() => core.readEvidence(escapePaths), /unsafe trial state directory component/);

// A corrupt/partial append is evidence failure, never a plausible report.
const corruptEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "corrupt-state") };
const corruptPaths = core.statePaths({ env: corruptEnv, repositoryRoot: root });
core.activateTrial(corruptPaths, { env: corruptEnv });
fs.appendFileSync(corruptPaths.ledger, "{");
assert.throws(() => core.analyzeTrial(corruptPaths), /partial final line/);

// A complete synthetic ledger exercises reporting only (not a performance
// benchmark): every assigned input remains in its arm and no adoption verdict
// is emitted before the external quality join.
const reportEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "report-state") };
const reportPaths = core.statePaths({ env: reportEnv, repositoryRoot: root });
core.activateTrial(reportPaths, { env: reportEnv });
for (let offset = 0; offset < 40; offset += 1) {
	const assignment = core.allocateAssignment(reportPaths, {
		input_sha256: core.digest(`synthetic-${offset}`),
		input_chars: 12,
		image_count: 0,
		source: "interactive",
		session_id: `session-${offset}`,
		session_file_sha256: core.digest(`/session/${offset}`),
		t127_join_key: `pi-session:session-${offset}`,
		provider: "provider",
		model: "model",
	});
	core.appendExposure(reportPaths, {
		index: assignment.index,
		arm: assignment.arm,
		active_tools_sha256: core.digest(`surface-${assignment.arm}`),
		code_active: assignment.arm === "treatment",
		package_version: assignment.arm === "treatment" ? "0.6.1" : null,
	});
	core.appendOutcome(reportPaths, {
		index: assignment.index,
		arm: assignment.arm,
		status: "completed",
		terminal_reason: "assistant:stop",
		active_wall_ms: assignment.arm === "treatment" ? 90 : 100,
		agent_runs: 1,
		model_turns: 1,
		direct_tool_calls: 0,
		total_tool_calls: 0,
		tool_failures: 0,
		code_invocations: 0,
		code_inner_calls: 0,
		code_failures: 0,
		operator_interruptions: 0,
		queued_followups: 0,
		usage_input: assignment.arm === "treatment" ? 85 : 100,
		usage_output: 1,
		usage_cache_read: 0,
		usage_cache_write: 0,
		prompt_code_selected: assignment.arm === "treatment",
		prompt_code_snippet: assignment.arm === "treatment",
	});
}
const report = core.analyzeTrial(reportPaths);
assert.deepEqual(report.first_40_arms, { control: 20, treatment: 20 });
assert.equal(report.arms.treatment.code_uptake, 0);
assert.equal(report.median_reduction_percent.active_wall_ms, 10);
assert.equal(report.median_reduction_percent.uncached_input_tokens, 15);
assert.equal(report.causal_verdict, "not_computed");
assert(report.join_required.measures.includes("distinct Changes"));

assert.equal(h.aborted(), false, "valid prompt surfaces unexpectedly aborted a run");
assert.deepEqual(h.notifications, []);
console.log("node trial harness: pass");
JS

# The narrow CLI reads the same isolated status and fails closed on analysis.
CLI_STATE="$(mktemp -d)"
trap 'node -e '\''require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })'\'' "$CLI_STATE"' EXIT
status_output="$(XDG_STATE_HOME="$CLI_STATE" PI_CODING_AGENT_DIR="$CLI_STATE/pi-agent" "$ROOT/bin/qq-code-trial" status)"
assert_contains "$status_output" '"active": false'
assert_contains "$status_output" '"assignments": 0'
if XDG_STATE_HOME="$CLI_STATE" PI_CODING_AGENT_DIR="$CLI_STATE/pi-agent" "$ROOT/bin/qq-code-trial" analyze >/dev/null 2>&1; then
  fail "analyzer accepted missing evidence"
fi

node - "$CLI_STATE/pi-agent" <<'JS'
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(process.argv[2], "npm/node_modules/pi-code-tool");
fs.mkdirSync(path.join(root, "dist/pi"), { recursive: true });
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "pi-code-tool", version: "0.6.1" }));
fs.writeFileSync(path.join(root, "dist/pi/extension.js"), "export function createPythonExtension() {}\n");
JS
XDG_STATE_HOME="$CLI_STATE" PI_CODING_AGENT_DIR="$CLI_STATE/pi-agent" "$ROOT/bin/qq-code-trial" activate >/dev/null
status_output="$(XDG_STATE_HOME="$CLI_STATE" PI_CODING_AGENT_DIR="$CLI_STATE/pi-agent" "$ROOT/bin/qq-code-trial" status)"
assert_contains "$status_output" '"active": true'
XDG_STATE_HOME="$CLI_STATE" PI_CODING_AGENT_DIR="$CLI_STATE/pi-agent" "$ROOT/bin/qq-code-trial" deactivate >/dev/null
status_output="$(XDG_STATE_HOME="$CLI_STATE" PI_CODING_AGENT_DIR="$CLI_STATE/pi-agent" "$ROOT/bin/qq-code-trial" status)"
assert_contains "$status_output" '"active": false'

printf 'test-qq-code-trial: pass\n'
