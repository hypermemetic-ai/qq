// qq-subagent-env — confined-delegate dispatch env, by construction (T-128).
//
// qq's pi-subagents dispatch must run through bin/qq-dispatch (Landstrip
// confinement) with the production role manifests as extra agent dirs
// (README, Install). pi-subagents reads PI_SUBAGENT_PI_BINARY and
// PI_SUBAGENT_EXTRA_AGENT_DIRS from process.env at dispatch time, so this
// project-local extension sets them in-process: any pi session in this
// repository (and its worktrees, which carry this file on branches that
// include it) dispatches confined delegates by construction, while sessions
// in other projects never load this file and keep the vanilla dispatcher.
//
// Explicitly-set variables always win — an operator may override either one
// deliberately for a session, including to an empty value (pi-subagents
// treats an empty value as selecting its vanilla fallback). Only a truly
// absent variable is set here.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// This file lives at <repo>/.pi/extensions/qq-subagent-env.ts; the repo root
// is two levels up. In a worktree, that resolves to the worktree root, whose
// bin/qq-dispatch and manifests travel with the branch — still confined.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function applyEnv(): void {
	if (process.env.PI_SUBAGENT_PI_BINARY === undefined) {
		process.env.PI_SUBAGENT_PI_BINARY = join(REPO_ROOT, "bin", "qq-dispatch");
	}
	if (process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS === undefined) {
		process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS = join(
			REPO_ROOT,
			"delegation",
			"manifests",
			"agents",
		);
	}
}

export default function (pi: ExtensionAPI) {
	applyEnv();
	pi.on("session_start", () => applyEnv());
}
