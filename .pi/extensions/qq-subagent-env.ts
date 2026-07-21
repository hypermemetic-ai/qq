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
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// This file lives at <repo>/.pi/extensions/qq-subagent-env.ts; the repo root
// is two levels up. In a worktree, that resolves to the worktree root, whose
// bin/qq-dispatch and manifests travel with the branch — still confined.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function applyEnv(): void {
	if (process.env.PI_SUBAGENT_PI_BINARY === undefined) {
		process.env.PI_SUBAGENT_PI_BINARY = join(REPO_ROOT, "bin/qq-dispatch");
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

// pi-subagents creates its session root (defaultSessionDir) with the parent
// process umask before the adapter runs, and the adapter refuses a root that
// is not mode 700. Establish the configured root here — at parent session
// start, before any dispatch — so a fresh install never deadlocks. Absent:
// create at 700. Present, operator-owned, not a symlink, wrong mode: tighten
// to 700 (this path is qq-managed; tightening is monotonic). Anything else is
// left for the adapter's fail-closed check to refuse loudly.
function ensureSessionRoot(): void {
	try {
		let root = "/tmp/pi-subagent-sessions";
		try {
			const cfg = JSON.parse(
				readFileSync(
					join(os.homedir(), ".pi/agent/extensions/subagent/config.json"),
					"utf8",
				),
			);
			if (
				typeof cfg.defaultSessionDir === "string" &&
				cfg.defaultSessionDir.trim()
			) {
				root = cfg.defaultSessionDir;
			}
		} catch {
			// No readable config: the adapter will refuse dispatch with a
			// pointer to README; still keep the conventional root healthy.
		}
		// Mutate only inside the adapter-accepted set (a direct pi-subagent-*
		// child of the OS temp dir); anything else is the adapter's
		// fail-closed refusal, not a path this extension should touch.
		const tmp = os.tmpdir();
		const rel = root.startsWith(tmp + "/") ? root.slice(tmp.length + 1) : "";
		if (!rel.startsWith("pi-subagent-") || rel.includes("/")) return;
		if (!existsSync(root)) {
			mkdirSync(root, { mode: 0o700 });
			return;
		}
		const st = lstatSync(root);
		if (
			st.isDirectory() &&
			!st.isSymbolicLink() &&
			st.uid === process.geteuid() &&
			(st.mode & 0o777) !== 0o700
		) {
			chmodSync(root, 0o700);
		}
	} catch {
		// Best effort; bin/qq-dispatch enforces the contract fail-closed.
	}
}

export default function (pi: ExtensionAPI) {
	applyEnv();
	ensureSessionRoot();
	pi.on("session_start", () => {
		applyEnv();
		ensureSessionRoot();
	});
}
