import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AGENT_HANDLE = Symbol.for("@hypermemetic-ai/qq/agent-handle");

/** Isolated projectsRoot with one immediate child used as boot cwd. */
export function makeProjectsHome(name = "qq") {
  const root = mkdtempSync(join(tmpdir(), "qq-projects."));
  const cwd = join(root, name);
  mkdirSync(cwd);
  return {
    root,
    cwd,
    name,
    remove() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function addProject(root, name) {
  const cwd = join(root, name);
  mkdirSync(cwd);
  return cwd;
}

export function qqConfig(projects, sessionId, extra = {}) {
  return {
    sessionId,
    cwd: projects.cwd,
    projectsRoot: projects.root,
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
    ...extra,
  };
}

export function attachHandle(agent, dispose) {
  const handle = { agent, dispose };
  Object.defineProperty(agent, AGENT_HANDLE, {
    value: handle,
    configurable: true,
  });
  return handle;
}
