import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const ROLE_NAMES = Object.freeze(["runner", "architect"]);
export const ROLE_SET = new Set(ROLE_NAMES);
export const DEFAULT_ROLE = "runner";

export function isActivatedRepository(cwd, qqRoot, env = process.env) {
  const location = resolve(cwd);
  const runtimeRoot = resolve(qqRoot);
  if (location === runtimeRoot || location.startsWith(`${runtimeRoot}/`)) return true;
  const gitEnv = { ...env };
  delete gitEnv.GIT_DIR;
  delete gitEnv.GIT_WORK_TREE;
  delete gitEnv.GIT_COMMON_DIR;
  const result = spawnSync("git", ["config", "--local", "--bool", "--get", "qq.methodology"], {
    cwd: location, env: gitEnv, encoding: "utf8", input: "", timeout: 5_000, maxBuffer: 16_384,
  });
  return result.status === 0 && result.stdout.trim() === "true";
}

export function validateRole(value) {
  if (typeof value !== "string" || !ROLE_SET.has(value)) throw new Error(`unknown qq role: ${String(value)}`);
  return value;
}

export function roleForRepository(cwd, qqRoot, env = process.env, configuredRole) {
  if (configuredRole !== undefined) return validateRole(configuredRole);
  return isActivatedRepository(cwd, qqRoot, env) ? DEFAULT_ROLE : undefined;
}
