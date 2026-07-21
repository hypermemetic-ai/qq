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
command -v pi >/dev/null 2>&1 || fail "pi 0.80.10 is required"

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
		getSystemPrompt: () => activeTools
			.map((name) => tools.get(name)?.promptSnippet)
			.filter(Boolean)
			.join("\n"),
		sessionManager: {
			getSessionId: () => "session-test-1",
			getSessionFile: () => path.join(temporary, "session.jsonl"),
		},
		ui: {
			notify: (message, level) => notifications.push({ message, level }),
			select: async () => "Deny",
		},
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
fs.writeFileSync(path.join(agentDir, "npm/package-lock.json"), JSON.stringify({
	lockfileVersion: 3,
	packages: {
		"node_modules/pi-code-tool": {
			version: "0.6.1",
			integrity: core.PACKAGE_INTEGRITY,
		},
	},
}));
fs.writeFileSync(path.join(packageRoot, "dist/pi/extension.js"), `
export function createPythonExtension(options) {
  globalThis.__qqTrialOptions = options;
  return async function register(pi) {
    pi.on("session_start", () => { globalThis.__qqTrialSessionStarts = (globalThis.__qqTrialSessionStarts ?? 0) + 1; });
    pi.registerTool({
      name: "code",
      label: "Code",
      description: "Run sandboxed Python.\\nPrefer this tool when you need to chain tool calls, loop, filter large\\nresults, or compute — do the work in code and print only what you need.\\nRules: factual mechanics",
      promptSnippet: "code: run sandboxed Python; host tools are callable as functions; state persists",
      promptGuidelines: ["Use code for multi-step tool workflows."],
      parameters: { type: "object" },
      async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
        if (ctx?.hasUI) {
          await ctx.ui.select("Approve bash('pwd')?", [
            "Approve",
            "Deny",
            "Decide later (suspends the script, resumable any time)",
          ]);
        }
        return { content: [], details: { status: "error", calls: ["bash"] } };
      },
    });
  };
}
`);
const dependencyLockPath = path.join(agentDir, "npm/package-lock.json");
const dependencyLock = JSON.parse(fs.readFileSync(dependencyLockPath, "utf8"));
dependencyLock.packages["node_modules/pi-code-tool"].integrity = "sha512-wrong";
fs.writeFileSync(dependencyLockPath, JSON.stringify(dependencyLock));
assert.throws(() => core.verifyDependency({ env: process.env }), /package-lock provenance mismatch/);
dependencyLock.packages["node_modules/pi-code-tool"].integrity = core.PACKAGE_INTEGRITY;
fs.writeFileSync(dependencyLockPath, JSON.stringify(dependencyLock));

core.activateTrial(paths, { env: process.env });
assert.equal(fs.statSync(paths.activation).mode & 0o777, 0o600);
assert.equal(fs.statSync(paths.ledger).mode & 0o777, 0o600);

// The first schedule position is treatment. Assignment is the pre-treatment
// ledger boundary; exact package/config checks and exposure follow in the same
// cancellable input hook, before Pi can start a provider request.
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
assert.equal(globalThis.__qqTrialSessionStarts, 1, "late package load skipped current session restoration");
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

// Extension messages, steering, follow-ups, and raw-leading slash commands do
// not consume indexes. Interactive shell commands are consumed by Pi before
// this hook; whitespace-leading ! text that reaches it is ordinary work.
for (const event of [
	{ text: "injected", source: "extension", streamingBehavior: undefined },
	{ text: "steer", source: "interactive", streamingBehavior: "steer" },
	{ text: "later", source: "interactive", streamingBehavior: "followUp" },
	{ text: "/skill:thing", source: "interactive", streamingBehavior: undefined },
]) await h.emit("input", event);
assert.equal(core.readEvidence(paths).assignments.size, 2);
assert(!h.activeTools().includes("code"));

// Interrupted/error runs remain assigned. Streaming operator activity counts
// against the current ITT record but does not create a new assignment.
await h.emit("input", { text: "  !pwd", source: "interactive", streamingBehavior: undefined });
await h.emit("before_agent_start", h.promptEvent());
await h.emit("agent_start");
await h.emit("turn_start", { turnIndex: 0, timestamp: Date.now() });
await h.emit("tool_execution_start", { toolCallId: "c1", toolName: "code", args: {} });
const codeResult = await h.tools.get("code").execute("c1", { code: "bash('pwd')" }, undefined, undefined, h.ctx);
await h.emit("tool_result", {
	toolCallId: "c1",
	toolName: "code",
	details: codeResult.details,
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
assert.equal(third.code_inner_calls, 1);
assert.equal(third.code_failures, 1);
assert.equal(third.approval_requests, 1);
assert.equal(third.denials, 1);
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
assert.throws(() => core.analyzeTrial(paths), /not deactivated and sealed.*no causal verdict/);
assert.throws(() => core.deactivateTrial(paths), /collector is still running/);
await h.emit("session_shutdown", { reason: "quit" });
core.deactivateTrial(paths);
assert.equal(fs.existsSync(paths.activation), false);
assert.equal(core.trialStatus(paths).active, false);
assert.throws(() => core.allocateAssignment(paths, {}), /trial is not active/);
assert.equal(core.trialStatus(paths).writer_present, false);

// Fallible exposure runs in Pi's cancellable input hook. If Pi cannot activate
// the exact assigned set, the failure remains accounted in its assigned arm
// and the operator input is handled before a provider request.
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

// A Pi pre-agent rejection is recovered on the next eligible input without
// consuming that new input: the failed assignment is terminalized first, then
// the current input receives the next deterministic assignment.
const rolloverEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "rollover-state") };
process.env.XDG_STATE_HOME = rolloverEnv.XDG_STATE_HOME;
const rolloverPaths = core.statePaths({ env: rolloverEnv, repositoryRoot: root });
const rollover = harness();
extension.default(rollover.pi);
core.activateTrial(rolloverPaths, { env: rolloverEnv });
await rollover.emit("input", { text: "provider preflight will reject", source: "interactive" });
await rollover.emit("input", { text: "next real input", source: "rpc" });
let rolloverEvidence = core.readEvidence(rolloverPaths);
assert.equal(rolloverEvidence.assignments.size, 2);
assert.equal(rolloverEvidence.outcomes.get(1).status, "error");
assert.equal(rolloverEvidence.outcomes.get(1).agent_runs, 0);
assert.equal(rolloverEvidence.exposures.get(1).code_active, true);
await rollover.emit("before_agent_start", rollover.promptEvent());
await rollover.emit("agent_start");
await rollover.emit("message_end", {
	message: { role: "assistant", stopReason: "stop", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } },
});
await rollover.emit("agent_settled");
await rollover.emit("session_shutdown", { reason: "quit" });

// A transient terminal append failure retains the frozen outcome, disables the
// treatment surface, and retries before enrolling the next eligible input.
const retryEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "retry-state") };
process.env.XDG_STATE_HOME = retryEnv.XDG_STATE_HOME;
const retryPaths = core.statePaths({ env: retryEnv, repositoryRoot: root });
const retry = harness();
extension.default(retry.pi);
core.activateTrial(retryPaths, { env: retryEnv });
await retry.emit("input", { text: "outcome append retry", source: "interactive" });
await retry.emit("before_agent_start", retry.promptEvent());
await retry.emit("agent_start");
await retry.emit("message_end", {
	message: { role: "assistant", stopReason: "stop", usage: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0 } },
});
fs.writeFileSync(retryPaths.lock, `${JSON.stringify({
	schema: "qq.pi-code-tool-trial-lock/v1",
	pid: process.pid,
	claimed_at: new Date().toISOString(),
})}\n`, { mode: 0o600 });
await retry.emit("agent_settled");
assert.equal(core.readEvidence(retryPaths).outcomes.has(1), false);
assert(!retry.activeTools().includes("code"));
fs.unlinkSync(retryPaths.lock);
await retry.emit("input", { text: "must still be enrolled", source: "interactive" });
let retryEvidence = core.readEvidence(retryPaths);
assert.equal(retryEvidence.outcomes.get(1).status, "completed");
assert.equal(retryEvidence.assignments.size, 2);
await retry.emit("before_agent_start", retry.promptEvent());
await retry.emit("agent_start");
await retry.emit("message_end", {
	message: { role: "assistant", stopReason: "stop", usage: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0 } },
});
await retry.emit("agent_settled");
await retry.emit("session_shutdown", { reason: "quit" });
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
fs.writeFileSync(lockPaths.lock, `${JSON.stringify({
	schema: "qq.pi-code-tool-trial-lock/v1",
	pid: process.pid,
	claimed_at: new Date().toISOString(),
})}\n`, { mode: 0o600 });
assert.throws(() => core.allocateAssignment(lockPaths, {}), /writer lock is already held/);

const staleLockEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "stale-lock-state") };
const staleLockPaths = core.statePaths({ env: staleLockEnv, repositoryRoot: root });
core.activateTrial(staleLockPaths, { env: staleLockEnv });
fs.writeFileSync(staleLockPaths.lock, `${JSON.stringify({
	schema: "qq.pi-code-tool-trial-lock/v1",
	pid: 99999999,
	claimed_at: new Date().toISOString(),
})}\n`, { mode: 0o600 });
core.unlockWriter(staleLockPaths, { isProcessAlive: () => false });
assert.equal(core.trialStatus(staleLockPaths).lock_present, false);

const orphanLockEnv = { ...process.env, XDG_STATE_HOME: path.join(temporary, "orphan-lock-state") };
const orphanLockPaths = core.statePaths({ env: orphanLockEnv, repositoryRoot: root });
core.activateTrial(orphanLockPaths, { env: orphanLockEnv });
fs.writeFileSync(path.join(orphanLockPaths.root, ".t135-pi-code-tool-v1.lock.crash.tmp"), "", { mode: 0o600 });
core.deactivateTrial(orphanLockPaths);
assert.equal(core.trialStatus(orphanLockPaths).active, false, "pre-link crash artifact blocked the canonical lock");

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
		approval_requests: assignment.arm === "treatment" ? 1 : 0,
		approvals: 0,
		denials: assignment.arm === "treatment" ? 1 : 0,
		suspensions: 0,
		operator_interruptions: 0,
		queued_followups: 0,
		usage_input: assignment.arm === "treatment" ? 80 : 90,
		usage_output: 1,
		usage_cache_read: 0,
		usage_cache_write: assignment.arm === "treatment" ? 5 : 10,
		prompt_code_selected: assignment.arm === "treatment",
		prompt_code_snippet: assignment.arm === "treatment",
	});
}
assert.throws(() => core.analyzeTrial(reportPaths), /not deactivated and sealed/);
core.deactivateTrial(reportPaths);
const report = core.analyzeTrial(reportPaths);
assert.deepEqual(report.first_40_arms, { control: 20, treatment: 20 });
assert.equal(report.arms.treatment.code_uptake, 0);
assert.equal(report.median_reduction_percent.active_wall_ms, 10);
assert.equal(report.median_reduction_percent.uncached_input_tokens, 15);
assert.deepEqual(report.thresholds, {
	active_wall_ms_reduction_percent: 10,
	uncached_input_tokens_reduction_percent: 15,
});
assert.equal(report.external_quality_status, "required");
assert.equal(report.arms.treatment.approval_requests, 20);
assert.equal(report.arms.treatment.denials, 20);
assert.equal(report.causal_verdict, "not_computed");
assert(report.join_required.measures.includes("distinct Changes"));
const sealedLines = fs.readFileSync(reportPaths.ledger, "utf8").trimEnd().split("\n");
fs.writeFileSync(reportPaths.ledger, `${sealedLines.slice(0, -1).join("\n")}\n`);
assert.throws(() => core.analyzeTrial(reportPaths), /not deactivated and sealed/);

assert.equal(h.aborted(), false, "valid prompt surfaces unexpectedly aborted a run");
assert.deepEqual(h.notifications, []);
console.log("node trial harness: pass");
JS

# Pi's real RPC router delivers leading-! text to the input hook as ordinary
# model work; only the interactive shell path consumes raw-leading ! first.
RPC_PROBE_DIR="$(mktemp -d)"
RPC_PROBE_FILE="$RPC_PROBE_DIR/events.jsonl"
printf '%s\n' '{"id":"routing","type":"prompt","message":"!ordinary rpc work"}' \
  | QQ_INPUT_ROUTING_PROBE="$RPC_PROBE_FILE" \
    PI_CODING_AGENT_DIR="$RPC_PROBE_DIR/pi-agent" \
    XDG_STATE_HOME="$RPC_PROBE_DIR/state" \
    timeout 10 pi --mode rpc --no-session --offline --no-extensions --no-skills \
      --no-prompt-templates --no-context-files --approve \
      -e "$ROOT/tests/fixtures/qq-input-routing-probe.ts" \
      >"$RPC_PROBE_DIR/stdout" 2>"$RPC_PROBE_DIR/stderr"
assert_file_contains "$RPC_PROBE_FILE" '"text":"!ordinary rpc work"'
assert_file_contains "$RPC_PROBE_FILE" '"source":"rpc"'
node -e 'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })' "$RPC_PROBE_DIR"

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
fs.writeFileSync(path.join(process.argv[2], "npm/package-lock.json"), JSON.stringify({
  lockfileVersion: 3,
  packages: {
    "node_modules/pi-code-tool": {
      version: "0.6.1",
      integrity: "sha512-IjPo1o5+jjm2KC8IFE2NiXFGY/BCj3L9O4Fi/xqFbovJ6aUmxV7KkMX3YDqY2bBjAVt+2oqtVunJcxDhT7sg6Q=="
    }
  }
}));
JS
XDG_STATE_HOME="$CLI_STATE" PI_CODING_AGENT_DIR="$CLI_STATE/pi-agent" "$ROOT/bin/qq-code-trial" activate >/dev/null
status_output="$(XDG_STATE_HOME="$CLI_STATE" PI_CODING_AGENT_DIR="$CLI_STATE/pi-agent" "$ROOT/bin/qq-code-trial" status)"
assert_contains "$status_output" '"active": true'
XDG_STATE_HOME="$CLI_STATE" PI_CODING_AGENT_DIR="$CLI_STATE/pi-agent" "$ROOT/bin/qq-code-trial" deactivate >/dev/null
status_output="$(XDG_STATE_HOME="$CLI_STATE" PI_CODING_AGENT_DIR="$CLI_STATE/pi-agent" "$ROOT/bin/qq-code-trial" status)"
assert_contains "$status_output" '"active": false'

printf 'test-qq-code-trial: pass\n'
