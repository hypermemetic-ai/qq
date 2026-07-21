// T-135 prospective pi-code-tool trial control.
//
// This project-local extension is deliberately inert until bin/qq-code-trial
// creates the private activation record. Eligible inputs are assigned and
// durably appended before treatment is loaded or the active tool set changes.
import {
	VERSION as PI_VERSION,
	getPackageDir,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	LIMITS,
	PACKAGE_VERSION,
	TrialEvidenceError,
	allocateAssignment,
	appendExposure,
	appendOutcome,
	claimWriter,
	digest,
	loadTreatmentFactory,
	readActivation,
	releaseWriter,
	statePaths,
} from "../../lib/qq-code-trial.mjs";
import { randomUUID } from "node:crypto";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENCOURAGING_DESCRIPTION =
	"Prefer this tool when you need to chain tool calls, loop, filter large\n" +
	"results, or compute — do the work in code and print only what you need.";
const NEUTRAL_DESCRIPTION =
	"It supports chained host-tool calls, loops, filters, aggregation, and computation.";
const CODE_PROMPT_SNIPPET =
	"code: run sandboxed Python; host tools are callable as functions; state persists";

type Arm = "control" | "treatment";

interface OutcomeMetrics {
	agent_runs: number;
	model_turns: number;
	direct_tool_calls: number;
	total_tool_calls: number;
	tool_failures: number;
	code_invocations: number;
	code_inner_calls: number;
	code_failures: number;
	approval_requests: number;
	approvals: number;
	denials: number;
	suspensions: number;
	operator_interruptions: number;
	queued_followups: number;
	usage_input: number;
	usage_output: number;
	usage_cache_read: number;
	usage_cache_write: number;
	prompt_code_selected: boolean | null;
	prompt_code_snippet: boolean | null;
}

interface ActiveTrialInput {
	index: number;
	arm: Arm;
	startedAt: bigint;
	exposed: boolean;
	lastStopReason: string | null;
	metrics: OutcomeMetrics;
	terminal: {
		status: "completed" | "error" | "aborted";
		reason: string;
		activeWallMs: number;
	} | null;
}

function eligibleOperatorInput(event: {
	text: string;
	source: string;
	streamingBehavior?: string;
}): boolean {
	return event.source !== "extension" &&
		event.streamingBehavior === undefined &&
		event.text[0] !== "/";
}

function toolSurfaceDigest(names: string[]): string {
	return digest(JSON.stringify([...new Set(names)].sort()));
}

function sanitizedPiApi(
	pi: ExtensionAPI,
	recordApproval: (metric: "approval_requests" | "approvals" | "denials" | "suspensions", count?: number) => void,
): { api: ExtensionAPI; initializeCurrentSession: (ctx: any) => Promise<void> } {
	let registered = false;
	let sessionStartHandler: ((event: any, ctx: any) => unknown) | null = null;
	const api = new Proxy(pi, {
		get(target, property) {
			if (property === "on") {
				return (event: string, handler: (event: any, ctx: any) => unknown) => {
					if (event !== "session_start" || sessionStartHandler) {
						throw new TrialEvidenceError("pi-code-tool registered an unexpected event surface");
					}
					sessionStartHandler = handler;
					target.on("session_start", ((sessionEvent, ctx) => handler(sessionEvent, ctx)) as never);
				};
			}
			if (property === "registerTool") {
				return (tool: Record<string, unknown>) => {
					if (registered || tool.name !== "code") {
						throw new TrialEvidenceError("pi-code-tool registered an unexpected tool surface");
					}
					if (typeof tool.description !== "string" || !tool.description.includes(ENCOURAGING_DESCRIPTION)) {
						throw new TrialEvidenceError("pi-code-tool prompt shape does not match the verified 0.6.1 wrapper");
					}
					if (!Array.isArray(tool.promptGuidelines) || tool.promptGuidelines.length === 0) {
						throw new TrialEvidenceError("pi-code-tool prompt guidance shape does not match version 0.6.1");
					}
					if (tool.promptSnippet !== CODE_PROMPT_SNIPPET) {
						throw new TrialEvidenceError("pi-code-tool prompt snippet does not match version 0.6.1");
					}
					if (typeof tool.execute !== "function") {
						throw new TrialEvidenceError("pi-code-tool did not expose the expected execute handler");
					}
					const execute = tool.execute;
					registered = true;
					target.registerTool({
						...tool,
						description: tool.description.replace(ENCOURAGING_DESCRIPTION, NEUTRAL_DESCRIPTION),
						promptGuidelines: [],
						async execute(...args: any[]) {
							const executionCtx = args[4];
							const approvalChoices = [
								"Approve",
								"Deny",
								"Decide later (suspends the script, resumable any time)",
							];
							if (executionCtx?.hasUI && executionCtx.ui) {
								const originalUi = executionCtx.ui;
								const wrappedUi = new Proxy(originalUi, {
									get(uiTarget, uiProperty) {
										if (uiProperty !== "select") {
											const value = Reflect.get(uiTarget, uiProperty, uiTarget);
											return typeof value === "function" ? value.bind(uiTarget) : value;
										}
										return async (title: string, choices: string[], options?: unknown) => {
											const isApproval = title.startsWith("Approve ") &&
												choices.length === approvalChoices.length &&
												choices.every((choice, index) => choice === approvalChoices[index]);
											if (!isApproval) return uiTarget.select(title, choices, options as never);
											recordApproval("approval_requests");
											const choice = await uiTarget.select(title, choices, options as never);
											if (choice === approvalChoices[0]) recordApproval("approvals");
											else if (choice === approvalChoices[2]) recordApproval("suspensions");
											else recordApproval("denials");
											return choice;
										};
									},
								});
								args[4] = new Proxy(executionCtx, {
									get(ctxTarget, ctxProperty) {
										if (ctxProperty === "ui") return wrappedUi;
										const value = Reflect.get(ctxTarget, ctxProperty, ctxTarget);
										return typeof value === "function" ? value.bind(ctxTarget) : value;
									},
								});
							}
							const result = await Reflect.apply(execute, tool, args);
							if (!executionCtx?.hasUI) {
								const calls = (result as { details?: { calls?: unknown[] } })?.details?.calls;
								const denied = Array.isArray(calls)
									? calls.filter((call) => typeof call === "string" && ["bash", "edit", "write"].includes(call)).length
									: 0;
								if (denied > 0) {
									recordApproval("approval_requests", denied);
									recordApproval("denials", denied);
								}
							}
							return result;
						},
					} as never);
				};
			}
			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as ExtensionAPI;
	return {
		api,
		async initializeCurrentSession(ctx: any): Promise<void> {
			if (!registered || !sessionStartHandler) {
				throw new TrialEvidenceError("pi-code-tool did not register the expected runtime surface");
			}
			await sessionStartHandler({ type: "session_start", reason: "startup" }, ctx);
		},
	};
}

function freshMetrics(index: number, arm: Arm): ActiveTrialInput {
	return {
		index,
		arm,
		startedAt: process.hrtime.bigint(),
		exposed: false,
		lastStopReason: null,
		terminal: null,
		metrics: {
			agent_runs: 0,
			model_turns: 0,
			direct_tool_calls: 0,
			total_tool_calls: 0,
			tool_failures: 0,
			code_invocations: 0,
			code_inner_calls: 0,
			code_failures: 0,
			approval_requests: 0,
			approvals: 0,
			denials: 0,
			suspensions: 0,
			operator_interruptions: 0,
			queued_followups: 0,
			usage_input: 0,
			usage_output: 0,
			usage_cache_read: 0,
			usage_cache_write: 0,
			prompt_code_selected: null,
			prompt_code_snippet: null,
		},
	};
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export default function (pi: ExtensionAPI) {
	const paths = statePaths({ repositoryRoot: REPO_ROOT });
	const writerOwner = randomUUID();
	let codeRegistered = false;
	let writerClaimed = false;
	let active: ActiveTrialInput | null = null;
	type ApprovalMetric = "approval_requests" | "approvals" | "denials" | "suspensions";

	function recordApproval(metric: ApprovalMetric, count = 1): void {
		if (active && !active.terminal) active.metrics[metric] += count;
	}

	function notify(ctx: any, message: string): void {
		if (ctx?.hasUI) ctx.ui.notify(message, "error");
		else console.error(`qq code trial: ${message}`);
	}

	function disableCodeSafely(ctx: any): void {
		if (!codeRegistered) return;
		try {
			setCodeActive(false);
		} catch (error) {
			notify(ctx, `could not disable code after the run: ${errorText(error)}`);
		}
	}

	function setCodeActive(enabled: boolean): string[] {
		const withoutCode = pi.getActiveTools().filter((name) => name !== "code");
		pi.setActiveTools(enabled ? [...withoutCode, "code"] : withoutCode);
		const current = pi.getActiveTools();
		if (current.includes("code") !== enabled) {
			throw new TrialEvidenceError(`failed to make code ${enabled ? "active" : "inactive"}`);
		}
		return current;
	}

	async function registerTreatment(ctx: any): Promise<void> {
		if (codeRegistered) return;
		if (PI_VERSION !== "0.80.10") {
			throw new TrialEvidenceError(`expected Pi 0.80.10, found ${PI_VERSION}`);
		}
		if (pi.getAllTools().some((tool) => tool.name === "code")) {
			throw new TrialEvidenceError("a pre-existing code tool would contaminate the trial");
		}
		const { createPythonExtension } = await loadTreatmentFactory({
			env: process.env,
			piPackageRoot: getPackageDir(),
		});
		const sanitized = sanitizedPiApi(pi, recordApproval);
		await createPythonExtension({
			toolName: "code",
			root: ctx.cwd,
			toolStore: false,
			noBuiltins: true,
			mountWorkspace: true,
			bridgePiTools: true,
			typeCheck: true,
			autoApprove: false,
			limits: { ...LIMITS },
		})(sanitized.api);
		if (!pi.getAllTools().some((tool) => tool.name === "code")) {
			throw new TrialEvidenceError("pi-code-tool did not register code");
		}
		codeRegistered = true;
		setCodeActive(false);
		await sanitized.initializeCurrentSession(ctx);
	}

	function finish(status: "completed" | "error" | "aborted", terminalReason: string): void {
		if (!active) return;
		if (!active.terminal) {
			active.terminal = {
				status,
				reason: terminalReason,
				activeWallMs: Number(process.hrtime.bigint() - active.startedAt) / 1_000_000,
			};
		}
		const completed = active;
		const terminal = completed.terminal;
		appendOutcome(paths, {
			index: completed.index,
			arm: completed.arm,
			status: terminal.status,
			terminal_reason: terminal.reason,
			active_wall_ms: terminal.activeWallMs,
			...completed.metrics,
		});
		active = null;
	}

	pi.on("input", async (event, ctx) => {
		if (active && !active.terminal && event.source !== "extension" && event.streamingBehavior === "steer") {
			active.metrics.operator_interruptions += 1;
		}
		if (active && !active.terminal && event.source !== "extension" && event.streamingBehavior === "followUp") {
			active.metrics.queued_followups += 1;
		}
		if (!eligibleOperatorInput(event)) {
			if (
				codeRegistered &&
				event.source !== "extension" &&
				event.streamingBehavior === undefined
			) setCodeActive(false);
			return { action: "continue" };
		}

		let activation;
		try {
			activation = readActivation(paths);
			if (!activation) {
				if (codeRegistered) setCodeActive(false);
				if (writerClaimed) {
					releaseWriter(paths, writerOwner);
					writerClaimed = false;
				}
				return { action: "continue" };
			}
			if (active?.terminal) {
				finish(active.terminal.status, active.terminal.reason);
				disableCodeSafely(ctx);
			}
			if (active && (!active.exposed || active.metrics.agent_runs === 0)) {
				finish("error", "pre_agent_start_failure");
				disableCodeSafely(ctx);
			}
			if (active) throw new TrialEvidenceError("an eligible input arrived before the prior trial input settled");
			if (!ctx.model) throw new TrialEvidenceError("no model is selected; input was not enrolled");

			const sessionId = ctx.sessionManager.getSessionId();
			if (typeof sessionId !== "string" || !sessionId) {
				throw new TrialEvidenceError("Pi did not expose a stable session id; input was not enrolled");
			}
			if (!writerClaimed) {
				claimWriter(paths, writerOwner);
				writerClaimed = true;
			}
			const sessionFile = ctx.sessionManager.getSessionFile();
			const assignment = allocateAssignment(paths, {
				input_sha256: digest(event.text),
				input_chars: [...event.text].length,
				image_count: event.images?.length ?? 0,
				source: event.source,
				session_id: sessionId,
				session_file_sha256: sessionFile ? digest(sessionFile) : null,
				t127_join_key: `pi-session:${sessionId}`,
				provider: ctx.model.provider,
				model: ctx.model.id,
			});
			active = freshMetrics(assignment.index, assignment.arm);

			if (assignment.arm === "treatment") await registerTreatment(ctx);
			const activeTools = setCodeActive(assignment.arm === "treatment");
			appendExposure(paths, {
				index: assignment.index,
				arm: assignment.arm,
				active_tools_sha256: toolSurfaceDigest(activeTools),
				code_active: assignment.arm === "treatment",
				package_version: assignment.arm === "treatment" ? PACKAGE_VERSION : null,
			});
			active.exposed = true;
			return { action: "continue" };
		} catch (error) {
			try {
				if (active) finish("error", "pre_agent_start_failure");
			} catch (ledgerError) {
				notify(ctx, `trial evidence failure: ${errorText(ledgerError)}`);
			}
			disableCodeSafely(ctx);
			notify(ctx, `${errorText(error)}. The operator input was stopped; fix the trial state and resubmit it.`);
			return { action: "handled" };
		}
	});

	function increment(metric: "model_turns"): void {
		if (active && !active.terminal) active.metrics[metric] += 1;
	}
	pi.on("agent_start", (_event, ctx) => {
		if (!active || active.terminal) return;
		active.metrics.agent_runs += 1;
		try {
			const expected = active.arm === "treatment";
			const selected = pi.getActiveTools().includes("code");
			const snippet = ctx.getSystemPrompt().includes(CODE_PROMPT_SNIPPET);
			active.metrics.prompt_code_selected = selected;
			active.metrics.prompt_code_snippet = snippet;
			if (!active.exposed || selected !== expected || snippet !== expected) {
				throw new TrialEvidenceError("agent prompt did not match the assigned trial surface");
			}
		} catch (error) {
			try {
				ctx.abort();
				finish("error", "agent_start_surface_mismatch");
				disableCodeSafely(ctx);
			} catch (ledgerError) {
				notify(ctx, `trial evidence failure: ${errorText(ledgerError)}`);
			}
			notify(ctx, errorText(error));
		}
	});
	pi.on("turn_start", () => increment("model_turns"));

	pi.on("tool_execution_start", (event) => {
		if (!active || active.terminal) return;
		active.metrics.total_tool_calls += 1;
		if (event.toolName === "code") active.metrics.code_invocations += 1;
		else active.metrics.direct_tool_calls += 1;
	});

	pi.on("tool_execution_end", (event) => {
		if (!active || active.terminal) return;
		if (event.isError) active.metrics.tool_failures += 1;
		if (event.toolName === "code" && event.isError) active.metrics.code_failures += 1;
	});

	pi.on("tool_result", (event) => {
		if (!active || active.terminal || event.toolName !== "code") return;
		const details = event.details as { calls?: unknown[]; status?: string } | undefined;
		if (Array.isArray(details?.calls)) active.metrics.code_inner_calls += details.calls.length;
		if (details?.status === "error" && !event.isError) active.metrics.code_failures += 1;
	});

	pi.on("message_end", (event) => {
		if (!active || active.terminal || event.message.role !== "assistant") return;
		active.lastStopReason = event.message.stopReason;
		active.metrics.usage_input += event.message.usage.input;
		active.metrics.usage_output += event.message.usage.output;
		active.metrics.usage_cache_read += event.message.usage.cacheRead;
		active.metrics.usage_cache_write += event.message.usage.cacheWrite;
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (!active) return;
		try {
			const reason = active.lastStopReason ?? "agent_settled_without_assistant_message";
			const status = reason === "stop" ? "completed" : reason === "aborted" ? "aborted" : "error";
			finish(status, `assistant:${reason}`);
		} catch (error) {
			notify(ctx, `could not append terminal trial evidence: ${errorText(error)}`);
		} finally {
			disableCodeSafely(ctx);
		}
	});

	pi.on("session_shutdown", (event, ctx) => {
		try {
			if (active) finish("aborted", `session_shutdown:${event.reason}`);
		} catch (error) {
			notify(ctx, `could not append interrupted trial evidence: ${errorText(error)}`);
		} finally {
			if (writerClaimed) {
				try {
					releaseWriter(paths, writerOwner);
					writerClaimed = false;
				} catch (error) {
					notify(ctx, `could not release trial writer claim: ${errorText(error)}`);
				}
			}
		}
	});
}
