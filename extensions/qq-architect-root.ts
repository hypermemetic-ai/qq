// @ts-nocheck

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import registerArchitect from "./qq-architect.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPT_PATH = resolve(ROOT, "delegation/manifests/roots/architect.md");
const PROFILE = "qq-root-architect-v1";
const TOOLS = ["architect_disposition"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameSet(left, right) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

export default async function register(pi, deps = {}) {
  if (process.env.QQ_PI_ROOT_PROFILE !== PROFILE) throw new Error("qq architect extension loaded without the immutable architect profile marker");
  const load = deps.readFile ?? readFile;
  const prompt = await load(PROMPT_PATH, "utf8");
  if (!prompt) throw new Error("qq architect root prompt is missing");
  const promptDigest = sha256(prompt);

  registerArchitect(pi, deps.architectDependencies ?? {});

  pi.on("session_start", (_event, ctx) => {
    try { pi.setActiveTools(TOOLS); }
    catch (error) {
      ctx.ui.notify(`qq architect fail-closed: ${error instanceof Error ? error.message : String(error)}`, "error");
      ctx.shutdown();
    }
  });

  pi.on("before_agent_start", async (event) => {
    if (process.env.QQ_PI_ROOT_PROFILE !== PROFILE) throw new Error("qq architect role marker drifted");
    if (sha256(await load(PROMPT_PATH, "utf8")) !== promptDigest) throw new Error("qq architect prompt source drifted during the session");
    if (!sameSet(pi.getActiveTools(), TOOLS)) throw new Error("qq architect active-tool drift");
    const options = event.systemPromptOptions ?? {};
    if ((options.contextFiles?.length ?? 0) !== 0 || (options.skills?.length ?? 0) !== 0 || options.customPrompt || (options.appendSystemPrompt?.length ?? 0) !== 0) {
      throw new Error("qq architect inherited forbidden prompt/context resources");
    }
    return { systemPrompt: prompt };
  });
}

export const qqArchitectRootProfile = Object.freeze({ profile: PROFILE, promptPath: PROMPT_PATH, tools: TOOLS });
