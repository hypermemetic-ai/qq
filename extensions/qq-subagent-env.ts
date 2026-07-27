// @ts-nocheck
// qq-subagent-env — confined-delegate dispatch env, by construction (T-128).
//
// qq's pi-subagents dispatch must run through bin/qq-dispatch (Landstrip
// confinement) with canonical role manifests. pi-subagents reads the adapter,
// manifest-directory, and trusted-seat variables at dispatch time. This globally
// mounted extension sets them only after its exact qq-governance gate accepts the
// current Repository; unrelated projects remain vanilla.
//
// It also carries QQ_DISPATCH_RUNTIME_ROOT (T-137): pi-subagents places the
// structured-output capture file beneath its own temp root
// ($TMPDIR/pi-subagents-uid-<uid>), while bin/qq-dispatch's runtime root
// defaults to $TMPDIR/qq-delegate-runtime, so the adapter's fail-closed
// guard refused every strict-envelope dispatch (T-129's one-time waiver).
// Setting the runtime root to pi-subagents' temp root keeps the capture
// path inside it by construction.
//
// qq-owned dispatch, trusted-seat, and compute variables replace inherited
// values; only runtime-root placement remains an operator-owned override.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// This globally mounted extension lives at <qq>/extensions. qq worktrees use
// their own dispatcher; linked Repositories whose root AGENTS.md resolves to
// qq's canonical AGENTS.md use the canonical qq checkout.
const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function gitText(cwd: string, ...args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { return undefined; }
}

function governedRoot(): string | undefined {
  const current = gitText(process.cwd(), "rev-parse", "--show-toplevel");
  if (!current) return undefined;
  const root = resolve(current);
  const qqCommon = gitText(QQ_ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const currentCommon = gitText(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (qqCommon && currentCommon && resolve(qqCommon) === resolve(currentCommon)) return root;
  try {
    const agents = join(root, "AGENTS.md");
    if (lstatSync(agents).isSymbolicLink() && realpathSync(agents) === realpathSync(join(QQ_ROOT, "AGENTS.md"))) {
      return QQ_ROOT;
    }
  } catch { /* unrelated or malformed governance link */ }
  return undefined;
}

function applyEnv(repoRoot: string): void {
  const agentDir = join(repoRoot, "delegation", "manifests", "agents");
  const workerPaths = {
    implementer: join(agentDir, "implementer.md"),
    observer: join(agentDir, "observer.md"),
    researcher: join(agentDir, "researcher.md"),
    reviewer: join(agentDir, "reviewer.md"),
  };
  const rootPaths = { orchestrator: join(agentDir, "orchestrator.md"), ...workerPaths };
  const qqCommon = gitText(QQ_ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const currentCommon = gitText(process.cwd(), "rev-parse", "--path-format=absolute", "--git-common-dir");
  const isQqCheckout = qqCommon !== undefined && currentCommon !== undefined
    && resolve(qqCommon) === resolve(currentCommon);
  const rootTrustedPaths = isQqCheckout || process.env.QQ_PI_ROOT_PROFILE === "qq-root-aligner-v1";
  const trustedPaths = Number(process.env.PI_SUBAGENT_DEPTH ?? "0") >= 1 || !rootTrustedPaths
    ? workerPaths
    : rootPaths;

  // These values are qq role and compute authority, not caller preferences.
  process.env.PI_SUBAGENT_PI_BINARY = join(repoRoot, "bin/qq-dispatch");
  process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS = agentDir;
  process.env.PI_SUBAGENT_TRUSTED_AGENT_PATHS = JSON.stringify(trustedPaths);
  // The resolver replaces this poison value with one complete policy snapshot
  // before any governed request. Inherited or caller-supplied compute never wins.
  process.env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES = "__qq_execution_profile_resolver_required__";
  if (process.env.QQ_DISPATCH_RUNTIME_ROOT === undefined) {
    const uid = process.getuid?.() ?? process.geteuid?.();
    if (uid !== undefined) {
      process.env.QQ_DISPATCH_RUNTIME_ROOT = join(os.tmpdir(), `pi-subagents-uid-${uid}`);
    }
  }
}

// Establish the configured pi-subagents session root before dispatch. Mutate only
// a direct pi-subagent-* child of the OS temp directory; the adapter refuses any
// other path. Tightening an owned real directory to 700 is monotonic.
function ensureSessionRoot(): void {
  try {
    let root = "/tmp/pi-subagent-sessions";
    try {
      const cfg = JSON.parse(readFileSync(join(os.homedir(), ".pi/agent/extensions/subagent/config.json"), "utf8"));
      if (typeof cfg.defaultSessionDir === "string" && cfg.defaultSessionDir.trim()) root = cfg.defaultSessionDir;
    } catch { /* keep conventional root; adapter remains authoritative */ }
    const tmp = os.tmpdir();
    const rel = root.startsWith(tmp + "/") ? root.slice(tmp.length + 1) : "";
    if (!rel.startsWith("pi-subagent-") || rel.includes("/")) return;
    if (!existsSync(root)) {
      mkdirSync(root, { mode: 0o700 });
      return;
    }
    const st = lstatSync(root);
    if (st.isDirectory() && !st.isSymbolicLink() && st.uid === process.geteuid() && (st.mode & 0o777) !== 0o700) {
      chmodSync(root, 0o700);
    }
  } catch { /* bin/qq-dispatch enforces the contract fail-closed */ }
}

function activate(): void {
  const root = governedRoot();
  if (root === undefined) return;
  applyEnv(root);
  ensureSessionRoot();
}

export default function (pi: ExtensionAPI) {
  activate();
  pi.on("session_start", activate);
}
