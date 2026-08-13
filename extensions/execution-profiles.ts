// @ts-nocheck
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { profileFor, readExecutionPolicy } from "../bin/lib/execution-profiles.mjs";
import { DEFAULT_ROLE, isActivatedRepository, ROLE_NAMES, validateRole } from "../bin/lib/roles.mjs";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function composeSystemPrompt(rolePrompt, options = {}) {
  const tools = options.selectedTools ?? [];
  const snippets = options.toolSnippets ?? {};
  const visible = tools.filter((name) => snippets[name]);
  const toolsList = visible.length ? visible.map((name) => `- ${name}: ${snippets[name]}`).join("\n") : "(none)";
  const guidelines = [];
  const seen = new Set();
  const addGuideline = (line) => {
    const trimmed = typeof line === "string" ? line.trim() : "";
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    guidelines.push(trimmed);
  };
  if (tools.includes("bash") && !tools.includes("grep") && !tools.includes("find") && !tools.includes("ls")) {
    addGuideline("Use bash for file operations like ls, rg, find");
  }
  for (const line of options.promptGuidelines ?? []) addGuideline(line);
  addGuideline("Be concise in your responses");
  addGuideline("Show file paths clearly when working with files");

  let prompt = `${rolePrompt.trim()}\n\nAvailable tools:\n${toolsList}\n\nIn addition to the tools above, you may have access to other custom tools depending on the project.\n\nGuidelines:\n${guidelines.map((line) => `- ${line}`).join("\n")}`;
  if (options.appendSystemPrompt) prompt += `\n\n${options.appendSystemPrompt}`;
  if (options.contextFiles?.length) {
    prompt += "\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n";
    for (const file of options.contextFiles) {
      prompt += `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
    }
    prompt += "</project_context>\n";
  }
  const visibleSkills = tools.includes("read")
    ? (options.skills ?? []).filter((skill) => !skill.disableModelInvocation)
    : [];
  if (visibleSkills.length) {
    prompt += "\n\nThe following skills provide specialized instructions for specific tasks.\nUse the read tool to load a skill's file when the task matches its description.\nWhen a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.\n\n<available_skills>\n";
    for (const skill of visibleSkills) {
      prompt += `  <skill>\n    <name>${escapeXml(skill.name)}</name>\n    <description>${escapeXml(skill.description)}</description>\n    <location>${escapeXml(skill.filePath)}</location>\n  </skill>\n`;
    }
    prompt += "</available_skills>";
  }
  if (options.cwd) prompt += `\nCurrent working directory: ${String(options.cwd).replaceAll("\\", "/")}`;
  return prompt;
}

export default function registerExecutionProfiles(pi, deps = {}) {
  const env = deps.env ?? process.env;
  let activated = false;
  let startupError;
  let policy;
  let prompts = {};
  let currentRole = DEFAULT_ROLE;
  let activeProfileName;
  let currentContext;

  function resolveDeclaredProfile(roleName, provider, model, effort) {
    if (!policy?.roles[roleName]) return undefined;
    for (const [name, profile] of Object.entries(policy.roles[roleName].profiles)) {
      if (profile.provider === provider && profile.model === model && profile.effort === effort) return name;
    }
    return undefined;
  }

  function validateRuntimeProfiles(ctx) {
    const check = (label, profile) => {
      const model = ctx.modelRegistry.find(profile.provider, profile.model);
      if (!model) throw new Error(`${label} model is unavailable: ${profile.provider}/${profile.model}`);
      if (!Number.isInteger(model.contextWindow) || model.contextWindow > policy.contextWindowCeiling) {
        throw new Error(`${label} exceeds the ${policy.contextWindowCeiling} context cap; run qq-profile context install`);
      }
    };
    for (const [roleName, role] of Object.entries(policy.roles)) {
      for (const [name, profile] of Object.entries(role.profiles)) check(`${roleName} profile ${name}`, profile);
    }
    check("compactor", policy.compactor);
    check("qa", policy.qa);
  }

  async function applyRoleProfile(roleName, profileName, ctx, notify = true) {
    const selected = profileFor(policy, roleName, profileName);
    const model = ctx.modelRegistry.find(selected.profile.provider, selected.profile.model);
    if (!model) throw new Error(`profile model is unavailable: ${selected.profile.provider}/${selected.profile.model}`);
    if (model.contextWindow > policy.contextWindowCeiling) throw new Error(`profile exceeds the ${policy.contextWindowCeiling} context cap; run qq-profile context install`);
    if (!await pi.setModel(model)) throw new Error(`profile model has no configured authentication: ${selected.profile.provider}/${selected.profile.model}`);
    pi.setThinkingLevel(selected.profile.effort);
    const actualEffort = pi.getThinkingLevel();
    if (actualEffort !== selected.profile.effort) throw new Error(`profile effort ${selected.profile.effort} is unsupported by ${selected.profile.provider}/${selected.profile.model}; Pi selected ${actualEffort}`);
    currentRole = roleName;
    activeProfileName = selected.name;
    ctx.ui.setStatus?.("qq-profile", `${currentRole}:${selected.name}`);
    pi.events.emit("qq:role-selected", { role: currentRole, profile: selected.name });
    if (notify) ctx.ui.notify(`${currentRole}: ${selected.name} — ${selected.profile.provider}/${selected.profile.model} · ${selected.profile.effort}`, "info");
  }

  async function chooseProfile(roleName, ctx, requestedProfile) {
    const role = policy.roles[roleName];
    if (!role) throw new Error(`unknown execution-profile role: ${roleName}`);
    if (requestedProfile) return requestedProfile;
    const names = Object.keys(role.profiles);
    if (names.length === 1) return names[0];
    const labels = names.map((candidate) => {
      const profile = role.profiles[candidate];
      const markers = [roleName === currentRole && candidate === activeProfileName ? "current" : "", candidate === role.default ? "default" : ""].filter(Boolean).join(", ");
      return `${candidate}${markers ? ` (${markers})` : ""} — ${profile.provider}/${profile.model} · ${profile.effort}`;
    });
    const chosen = await ctx.ui.select(`${roleName} execution profile (session only)`, labels);
    return chosen ? names[labels.indexOf(chosen)] : undefined;
  }

  async function start(_event, ctx) {
    currentContext = ctx;
    startupError = undefined;
    const forcedRole = env.QQ_AGENT_ROLE === undefined ? undefined : validateRole(env.QQ_AGENT_ROLE);
    activated = forcedRole !== undefined || isActivatedRepository(ctx.cwd, QQ_ROOT, env);
    currentRole = forcedRole ?? DEFAULT_ROLE;
    activeProfileName = undefined;
    if (!activated) return;
    try {
      const policyPromise = readExecutionPolicy(deps.policyPath);
      const promptEntries = await Promise.all(ROLE_NAMES.map(async (role) => [
        role,
        await readFile(deps.promptPaths?.[role] ?? join(QQ_ROOT, "prompts", "roles", `${role}.md`), "utf8"),
      ]));
      policy = await policyPromise;
      prompts = Object.fromEntries(promptEntries);
      validateRuntimeProfiles(ctx);
      await applyRoleProfile(currentRole, policy.roles[currentRole].default, ctx, false);
    } catch (error) {
      startupError = error instanceof Error ? error.message : String(error);
      ctx.ui.setStatus?.("qq-profile", `${DEFAULT_ROLE}:refused`);
      ctx.ui.notify?.(`qq startup refused: ${startupError}`, "error");
    }
  }

  async function stop() {
    currentContext?.ui?.setStatus?.("qq-profile", undefined);
    activated = false;
    startupError = undefined;
    policy = undefined;
    prompts = {};
    currentRole = DEFAULT_ROLE;
    activeProfileName = undefined;
    currentContext = undefined;
  }

  pi.registerCommand("profile", {
    description: "Select this session's qq role and execution profile without changing durable defaults",
    handler: async (args, ctx) => {
      if (!activated) { ctx.ui.notify("This repository is not qq-linked.", "warning"); return; }
      if (startupError || !policy) { ctx.ui.notify(`qq profiles unavailable: ${startupError ?? "policy is unavailable"}`, "error"); return; }
      const parts = args.trim() ? args.trim().split(/\s+/) : [];
      if (parts.length > 2) { ctx.ui.notify("Usage: /profile [role] [profile]", "warning"); return; }
      let roleName = parts[0];
      if (!roleName) {
        const labels = ROLE_NAMES.map((role) => `${role}${role === currentRole ? " (current)" : ""}`);
        const chosen = await ctx.ui.select("qq role (session only)", labels);
        if (!chosen) return;
        roleName = ROLE_NAMES[labels.indexOf(chosen)];
      }
      if (!policy.roles[roleName]) { ctx.ui.notify(`Unknown qq role: ${roleName}`, "warning"); return; }
      try {
        const profileName = await chooseProfile(roleName, ctx, parts[1]);
        if (profileName) await applyRoleProfile(roleName, profileName, ctx);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.on("session_start", start);
  pi.on("session_shutdown", stop);
  pi.on("input", async () => {
    if (!activated || !startupError) return { action: "continue" };
    currentContext?.ui?.notify?.(`qq startup refused: ${startupError}`, "error");
    return { action: "handled" };
  });
  pi.on("before_agent_start", async (event) => {
    const prompt = prompts[currentRole];
    if (!activated || startupError || !prompt) return;
    return { systemPrompt: composeSystemPrompt(prompt, event.systemPromptOptions) };
  });
  pi.on("model_select", async (event, ctx) => {
    if (!activated || !policy || startupError) return;
    activeProfileName = resolveDeclaredProfile(currentRole, event.model.provider, event.model.id, pi.getThinkingLevel());
    ctx.ui.setStatus?.("qq-profile", `${currentRole}:${activeProfileName ?? "custom"}`);
  });
  pi.on("thinking_level_select", async (_event, ctx) => {
    if (!activated || !policy || startupError) return;
    const model = ctx.model;
    activeProfileName = model ? resolveDeclaredProfile(currentRole, model.provider, model.id, pi.getThinkingLevel()) : undefined;
    ctx.ui.setStatus?.("qq-profile", `${currentRole}:${activeProfileName ?? "custom"}`);
  });
}
