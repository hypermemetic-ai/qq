// @ts-nocheck

const TASK_ID = /^[A-Za-z]+-[1-9][0-9]*(?:\.[1-9][0-9]*)?$/;

function readableReceipt(stdout) {
	if (typeof stdout !== "string" || stdout.trim() === "") return undefined;
	try {
		const value = JSON.parse(stdout);
		if (
			value === null ||
			typeof value !== "object" ||
			Array.isArray(value) ||
			value.engine !== "qq-handoff" ||
			value.schema !== "qq-handoff/v1" ||
			value.version !== 1 ||
			value.action !== "start" ||
			typeof value.message !== "string" ||
			value.message.length === 0
		) {
			return undefined;
		}
		return value;
	} catch {
		return undefined;
	}
}

export default function register(pi) {
	pi.registerCommand("handoff", {
		description:
			"Transfer an existing aligned Change to a fresh accountable Pi. Usage: /handoff <Task-ID>",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui" || !ctx.hasUI) {
				ctx.ui.notify(
					"/handoff requires an interactive root Pi session.",
					"warning",
				);
				return;
			}
			if (typeof ctx.cwd !== "string" || ctx.cwd.length === 0) {
				ctx.ui.notify(
					"/handoff cannot identify the current Repository context.",
					"error",
				);
				return;
			}
			const taskId = typeof args === "string" ? args : "";
			if (!TASK_ID.test(taskId)) {
				ctx.ui.notify(
					"Usage: /handoff <Task-ID> (for example, /handoff FEAT-12.3)",
					"warning",
				);
				return;
			}

			let execution;
			try {
				execution = await pi.exec(
					"qq-handoff",
					["start", taskId, "--repo", ctx.cwd],
					{ cwd: ctx.cwd },
				);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(
					`Handoff engine could not be executed: ${reason}`,
					"error",
				);
				return;
			}
			if (execution?.killed) {
				ctx.ui.notify(
					"Handoff engine was killed; lifecycle outcome is uncertain. Inspect its Herdr evidence before retrying.",
					"error",
				);
				return;
			}

			const receipt = readableReceipt(execution?.stdout);
			if (receipt === undefined) {
				ctx.ui.notify(
					"Handoff engine returned malformed JSON; lifecycle outcome is uncertain. Inspect Herdr before retrying.",
					"error",
				);
				return;
			}
			if (execution.code === 0 && receipt.status === "done") {
				const tab = receipt.transaction?.created_tab_id;
				const suffix =
					typeof tab === "string" && tab !== "" ? ` New tab: ${tab}.` : "";
				ctx.ui.notify(`Handoff complete: ${receipt.message}${suffix}`, "info");
				return;
			}
			if (execution.code === 2 && receipt.status === "refused") {
				ctx.ui.notify(`Handoff refused: ${receipt.message}`, "warning");
				return;
			}
			if (execution.code === 1 && receipt.status === "error") {
				ctx.ui.notify(`Handoff error: ${receipt.message}`, "error");
				return;
			}
			ctx.ui.notify(
				"Handoff engine exit status and JSON receipt disagree; lifecycle outcome is uncertain.",
				"error",
			);
		},
	});
}
