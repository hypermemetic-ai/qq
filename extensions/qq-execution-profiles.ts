// @ts-nocheck

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const ROLES = [
  "architect",
  "implementer",
  "observer",
  "orchestrator",
  "researcher",
  "reviewer",
] as const;
export type ExecutionRole = (typeof ROLES)[number];

const PROFILE_KEYS = ["effort", "model", "provider", "serviceClass"] as const;
const EFFORTS = new Set(["provider-default", "minimal", "low", "medium", "high", "xhigh", "max"]);
const SERVICE_CLASSES = new Set(["provider-default", "auto", "default", "flex", "priority"]);
const MAX_POLICY_BYTES = 64 * 1024;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHITECT_LAUNCHER = join(REPO_ROOT, "bin", "qq-pi-role");
export const PROFILE_PATH = join(REPO_ROOT, "delegation", "policies", "execution-profiles.json");

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

function parseProfiles(raw: string): ExecutionProfiles {
  if (raw.length === 0 || Buffer.byteLength(raw, "utf8") > MAX_POLICY_BYTES) {
    throw new Error("execution-profile policy is empty or too large");
  }
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
      if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
        throw new Error(`execution profile field ${role}.${field} must be one non-empty trimmed string`);
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

export async function readExecutionProfiles(path = PROFILE_PATH): Promise<ExecutionProfiles> {
  const raw = await readFile(path, "utf8");
  return parseProfiles(raw);
}

export function resolveExecutionRole(
  env: NodeJS.ProcessEnv = process.env,
  architectLauncher = ARCHITECT_LAUNCHER,
): ExecutionRole {
  const rootRole = env.QQ_EXECUTION_PROFILE_LAUNCHER_ROLE;
  const launcher = env.QQ_EXECUTION_PROFILE_LAUNCHER;

  if (rootRole !== undefined || launcher !== undefined) {
    if (rootRole !== "architect" || launcher !== architectLauncher) {
      throw new Error("invalid architect launcher assertion");
    }
    return "architect";
  }
  return "orchestrator";
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

export function getExecutionProfileDisplay(): Readonly<ProfileTelemetry> | undefined {
  return latestTelemetry ?? latestSelection;
}

export default function register(pi: ExtensionAPI, deps: { profilePath?: string; env?: NodeJS.ProcessEnv } = {}): void {
  const api = pi as ExecutionProfileApi;
  const env = deps.env ?? process.env;
  const profilePath = deps.profilePath ?? PROFILE_PATH;
  async function loadSnapshot(modelRegistry: { validateExecutionProfile(profile: ExecutionProfile): void }): Promise<Readonly<ExecutionProfile>> {
    latestSelection = undefined;
    latestTelemetry = undefined;

    const profiles = await readExecutionProfiles(profilePath);
    for (const role of ROLES) modelRegistry.validateExecutionProfile(profiles[role]);
    const profile = Object.freeze({ ...profiles[resolveExecutionRole(env)] });
    latestSelection = profile;
    return profile;
  }

  api.registerExecutionProfileResolver(async (_request, ctx) => ({ ...await loadSnapshot(ctx.modelRegistry) }));

  pi.on("session_start", async (_event, ctx) => {
    await loadSnapshot(ctx.modelRegistry);
  });
}
