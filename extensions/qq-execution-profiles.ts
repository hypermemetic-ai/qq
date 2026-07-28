// @ts-nocheck

import { randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const ROLES = [
  "aligner",
  "architect",
  "implementer",
  "observer",
  "orchestrator",
  "researcher",
  "reviewer",
] as const;
export type ExecutionRole = (typeof ROLES)[number];

const DELEGATED_ROLES = ["implementer", "observer", "orchestrator", "researcher", "reviewer"] as const;
const PROFILE_KEYS = ["effort", "model", "provider", "serviceClass"] as const;
const EFFORTS = new Set(["provider-default", "minimal", "low", "medium", "high", "xhigh", "max"]);
const SERVICE_CLASSES = new Set(["provider-default", "auto", "default", "flex", "priority"]);
const MAX_POLICY_BYTES = 64 * 1024;
const UNRESOLVED_PROFILES = "__qq_execution_profile_resolver_required__";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALIGNER_LAUNCHER = join(REPO_ROOT, "bin", "pi");
const ARCHITECT_LAUNCHER = join(REPO_ROOT, "bin", "qq-pi-role");
export const PROFILE_PATH = join(homedir(), ".config", "qq", "execution-profiles.json");

export interface ExecutionProfile {
  provider: string;
  model: string;
  effort: string;
  serviceClass: string;
}

export type ExecutionProfiles = Record<ExecutionRole, ExecutionProfile>;

interface ExecutionProfileApi extends ExtensionAPI {
  registerExecutionProfileResolver(
    resolver: (
      request: { readonly purpose: "agent" | "compaction" | "branch-summary" },
      ctx: ExtensionContext,
    ) => ExecutionProfile | Promise<ExecutionProfile>,
  ): void;
}

interface ProfileTelemetry extends ExecutionProfile {
  acknowledgedServiceClass?: string;
  accountedServiceClass?: string;
}

let latestSelection: Readonly<ExecutionProfile> | undefined;
let latestTelemetry: Readonly<ProfileTelemetry> | undefined;

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function rejectDuplicateObjectKeys(raw: string): void {
  const stack: Array<{ kind: "object" | "array"; keys?: Set<string> }> = [];
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === "{") {
      stack.push({ kind: "object", keys: new Set() });
      continue;
    }
    if (character === "[") {
      stack.push({ kind: "array" });
      continue;
    }
    if (character === "}" || character === "]") {
      stack.pop();
      continue;
    }
    if (character !== '"') continue;

    const start = index;
    index += 1;
    while (index < raw.length) {
      if (raw[index] === "\\") {
        index += 2;
        continue;
      }
      if (raw[index] === '"') break;
      index += 1;
    }
    if (index >= raw.length) return;
    let next = index + 1;
    while (/\s/u.test(raw[next] ?? "")) next += 1;
    const frame = stack.at(-1);
    if (raw[next] !== ":" || frame?.kind !== "object") continue;
    const key = JSON.parse(raw.slice(start, index + 1)) as string;
    if (frame.keys?.has(key)) throw new Error(`duplicate object key ${JSON.stringify(key)}`);
    frame.keys?.add(key);
  }
}

function isWellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function parseProfiles(raw: string): ExecutionProfiles {
  if (raw.length === 0 || Buffer.byteLength(raw, "utf8") > MAX_POLICY_BYTES) {
    throw new Error("execution-profile policy is empty or too large");
  }
  rejectDuplicateObjectKeys(raw);
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw new Error(`execution-profile policy is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!exactKeys(document, ROLES)) {
    throw new Error(`execution-profile policy must contain exactly these roles: ${ROLES.join(", ")}`);
  }

  const profiles = {} as ExecutionProfiles;
  for (const role of ROLES) {
    const candidate = document[role];
    if (!exactKeys(candidate, PROFILE_KEYS)) {
      throw new Error(`execution profile for ${role} must contain exactly: ${PROFILE_KEYS.join(", ")}`);
    }
    for (const field of PROFILE_KEYS) {
      const value = candidate[field];
      if (typeof value !== "string" || value.length === 0 || value !== value.trim() || !isWellFormed(value)) {
        throw new Error(`execution profile field ${role}.${field} must be one non-empty well-formed string`);
      }
    }
    if (!EFFORTS.has(candidate.effort as string)) {
      throw new Error(`execution profile effort for ${role} is invalid`);
    }
    if (!SERVICE_CLASSES.has(candidate.serviceClass as string)) {
      throw new Error(`execution profile service class for ${role} is invalid`);
    }
    profiles[role] = {
      provider: candidate.provider as string,
      model: candidate.model as string,
      effort: candidate.effort as string,
      serviceClass: candidate.serviceClass as string,
    };
  }
  return profiles;
}

function stableStat(before: BigIntStats, after: BigIntStats): boolean {
  return before.dev === after.dev
    && before.ino === after.ino
    && before.size === after.size
    && before.mtimeNs === after.mtimeNs
    && before.ctimeNs === after.ctimeNs;
}

export async function readExecutionProfiles(path = PROFILE_PATH): Promise<ExecutionProfiles> {
  const directory = dirname(path);
  const resolvedDirectory = await realpath(directory);
  if (resolvedDirectory !== directory) throw new Error("execution-profile policy directory must not be a symlink");
  const directoryStat = await lstat(directory);
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error("execution-profile policy requires an attributable Unix owner");
  if (!directoryStat.isDirectory() || directoryStat.uid !== uid || (directoryStat.mode & 0o077) !== 0) {
    throw new Error("execution-profile policy directory must be operator-owned and private");
  }

  const pathStat = await lstat(path);
  if (pathStat.isSymbolicLink()) throw new Error("execution-profile policy must not be a symlink");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if ((before.mode & BigInt(constants.S_IFMT)) !== BigInt(constants.S_IFREG)
      || before.uid !== BigInt(uid)
      || (before.mode & 0o777n) !== 0o600n
      || before.nlink !== 1n) {
      throw new Error("execution-profile policy must be one operator-owned mode-600 regular file");
    }
    const raw = await handle.readFile({ encoding: "utf8" });
    const after = await handle.stat({ bigint: true });
    if (!stableStat(before, after)) throw new Error("execution-profile policy changed while being read");
    return parseProfiles(raw);
  } finally {
    await handle.close();
  }
}

export function resolveExecutionRole(
  env: NodeJS.ProcessEnv = process.env,
  architectLauncher = ARCHITECT_LAUNCHER,
  alignerLauncher = ALIGNER_LAUNCHER,
): ExecutionRole {
  const delegated = env.PI_SUBAGENT_TRUSTED_EXECUTION_ROLE;
  const child = env.PI_SUBAGENT_CHILD_AGENT;
  const receipt = env.PI_SUBAGENT_EXECUTION_PROFILE_RECEIPT;
  const rootRole = env.QQ_EXECUTION_PROFILE_LAUNCHER_ROLE;
  const launcher = env.QQ_EXECUTION_PROFILE_LAUNCHER;

  if (delegated !== undefined) {
    if (rootRole !== undefined || launcher !== undefined) throw new Error("conflicting delegated and root role assertions");
    if (!(DELEGATED_ROLES as readonly string[]).includes(delegated)) {
      throw new Error(`untrusted delegated execution role: ${delegated}`);
    }
    if (child !== delegated || typeof receipt !== "string" || receipt.length === 0) {
      throw new Error("trusted delegated role, child identity, and receipt assertion must agree");
    }
    return delegated as ExecutionRole;
  }
  if (child !== undefined || receipt !== undefined) {
    throw new Error("delegated child is missing its trusted execution-role assertion");
  }
  if (rootRole === undefined || launcher === undefined) {
    throw new Error("root is missing its trusted launcher assertion");
  }
  if (rootRole === "aligner" && launcher === alignerLauncher) return "aligner";
  if (rootRole === "architect" && launcher === architectLauncher) return "architect";
  throw new Error("invalid root launcher assertion");
}

function delegatedProfilesJson(profiles: ExecutionProfiles): string {
  return JSON.stringify(Object.fromEntries(DELEGATED_ROLES.map((role) => [role, profiles[role]])));
}

function profileMatches(left: ExecutionProfile, right: ExecutionProfile): boolean {
  return PROFILE_KEYS.every((key) => left[key] === right[key]);
}

export function acceptExecutionProfileTelemetry(message: unknown): Readonly<ProfileTelemetry> | undefined {
  if (message === null || typeof message !== "object" || (message as { role?: unknown }).role !== "assistant") return;
  const telemetry = (message as { executionProfile?: unknown }).executionProfile;
  if (telemetry === null || typeof telemetry !== "object" || latestSelection === undefined) return;
  const candidate = telemetry as Record<string, unknown>;
  if (!PROFILE_KEYS.every((key) => typeof candidate[key] === "string")) return;
  const selected = {
    provider: candidate.provider as string,
    model: candidate.model as string,
    effort: candidate.effort as string,
    serviceClass: candidate.serviceClass as string,
  };
  if (!profileMatches(selected, latestSelection)) return;
  latestTelemetry = Object.freeze({
    ...selected,
    ...(typeof candidate.acknowledgedServiceClass === "string"
      ? { acknowledgedServiceClass: candidate.acknowledgedServiceClass }
      : {}),
    ...(typeof candidate.accountedServiceClass === "string"
      ? { accountedServiceClass: candidate.accountedServiceClass }
      : {}),
  });
  return latestTelemetry;
}

async function writeExecutionProfileReceipt(path: string, telemetry: Readonly<ProfileTelemetry>): Promise<void> {
  const directory = dirname(path);
  const uid = process.getuid?.();
  if (uid === undefined || await realpath(directory) !== directory) {
    throw new Error("execution-profile receipt directory is not attributable or canonical");
  }
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.uid !== uid || (directoryStat.mode & 0o077) !== 0) {
    throw new Error("execution-profile receipt directory must be operator-owned and private");
  }
  try {
    const existing = await lstat(path);
    if (!existing.isFile() || existing.isSymbolicLink() || existing.uid !== uid
      || (existing.mode & 0o777) !== 0o600 || existing.nlink !== 1) {
      throw new Error("execution-profile receipt target is not one private regular file");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporary = join(directory, `.execution-profile-receipt.${process.pid}.${randomUUID()}`);
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(telemetry)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export function getExecutionProfileDisplay(): Readonly<ProfileTelemetry> | undefined {
  return latestTelemetry ?? latestSelection;
}

export default function register(pi: ExtensionAPI, deps: { profilePath?: string; env?: NodeJS.ProcessEnv } = {}): void {
  const api = pi as ExecutionProfileApi;
  const env = deps.env ?? process.env;
  const profilePath = deps.profilePath ?? PROFILE_PATH;
  let pinnedDelegatedProfiles: string | undefined;
  let receiptPath: string | undefined;

  async function loadSnapshot(modelRegistry: { validateExecutionProfile(profile: ExecutionProfile): void }): Promise<Readonly<ExecutionProfile>> {
    latestSelection = undefined;
    latestTelemetry = undefined;
    pinnedDelegatedProfiles = undefined;
    receiptPath = undefined;
    env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES = UNRESOLVED_PROFILES;

    const profiles = await readExecutionProfiles(profilePath);
    for (const role of ROLES) modelRegistry.validateExecutionProfile(profiles[role]);
    const role = resolveExecutionRole(env);
    const profile = Object.freeze({ ...profiles[role] });
    latestSelection = profile;
    pinnedDelegatedProfiles = delegatedProfilesJson(profiles);
    env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES = pinnedDelegatedProfiles;
    if ((DELEGATED_ROLES as readonly string[]).includes(role)) {
      receiptPath = env.PI_SUBAGENT_EXECUTION_PROFILE_RECEIPT;
    }
    return profile;
  }

  api.registerExecutionProfileResolver(async (_request, ctx) => ({ ...await loadSnapshot(ctx.modelRegistry) }));

  pi.on("session_start", async (_event, ctx) => {
    await loadSnapshot(ctx.modelRegistry);
  });

  pi.on("message_end", async (event) => {
    if (receiptPath === undefined || event.message?.role !== "assistant") return;
    const telemetry = acceptExecutionProfileTelemetry(event.message);
    if (!telemetry) throw new Error("trusted delegated response omitted or conflicted with execution-profile telemetry");
    await writeExecutionProfileReceipt(receiptPath, telemetry);
  });

  pi.on("tool_call", () => {
    if (pinnedDelegatedProfiles !== undefined) {
      env.PI_SUBAGENT_TRUSTED_EXECUTION_PROFILES = pinnedDelegatedProfiles;
    }
  });
}
