#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME=test-qq-role-prompts
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
command -v npm >/dev/null 2>&1 || fail 'npm is required to locate stock Pi'
NPM_ROOT="$(npm root -g)"
SYSTEM_PROMPT="$NPM_ROOT/@earendil-works/pi-coding-agent/dist/core/system-prompt.js"
[ -f "$SYSTEM_PROMPT" ] || fail "stock Pi system-prompt builder is missing: $SYSTEM_PROMPT"

node --input-type=module - "$ROOT" "$SYSTEM_PROMPT" <<'JS'
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL as fileUrl } from "node:url";
const [root, builderPath] = process.argv.slice(2);
const roleModule = await import(fileUrl(join(root, "bin/lib/qq_role_identity.mjs")));
const { buildSystemPrompt } = await import(fileUrl(builderPath));
const { ROLE_NAMES, loadRolePrompt, loadRoleSkillPolicy } = roleModule;
const genericMarker = "You are an expert coding assistant operating inside pi";

function xml(value) {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
}
function expectedSkills(skills) {
  if (!skills.length) return "";
  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "", "<available_skills>",
  ];
  for (const skill of skills) {
    lines.push("  <skill>", `    <name>${xml(skill.name)}</name>`,
      `    <description>${xml(skill.description)}</description>`,
      `    <location>${xml(skill.filePath)}</location>`, "  </skill>");
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}
function expectedStockPrompt(customPrompt, options) {
  let result = `${customPrompt}\n\n${options.appendSystemPrompt}`;
  if (options.contextFiles.length) {
    result += "\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n";
    for (const file of options.contextFiles) {
      result += `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
    }
    result += "</project_context>\n";
  }
  result += expectedSkills(options.skills);
  result += `\nCurrent working directory: ${options.cwd}`;
  return result;
}
const generic = buildSystemPrompt({ cwd: "/fixture", contextFiles: [], skills: [] });
assert.match(generic, new RegExp(genericMarker));

assert.deepEqual(ROLE_NAMES, [
  "architect", "coordinator", "change_owner", "runner", "implementer",
  "researcher", "reviewer", "observer", "openwiki_maintainer",
]);
const policy = await loadRoleSkillPolicy({ root });
const interactive = new Set(["architect", "coordinator", "change_owner", "runner"]);
const expectations = {
  architect: ["Product intake and investigation", "mark one Aligned only after explicit operator approval", "do not execute a Change", "bin/qq-observe architect-context"],
  coordinator: ["transport and supervision role", "atomically admit ready work without a concurrency cap", "Never conduct, interpret, translate, or proxy operator dialogue", "exactly `Continue.` once"],
  change_owner: ["exactly one admitted Change", "independently verify every envelope claim", "fresh-context review for every non-trivial Change", "Never merge; the operator's merge is the gate", "retire through the engine"],
  runner: ["non-critical labor only", "Nothing you do may carry consequential stakes", "approve-or-open-comment shape", "local `runner/<label>` branch", "operator's merge click closes the loop"],
  implementer: ["bounded qq Implementer", "not the Change Owner", "only result surface is `$QQ_DISPATCH_RUN_DIR/ENVELOPE.md`", "do not restart alignment"],
  researcher: ["bounded qq Researcher", "Remain read-only", "Context7 first", "only result surface is `$QQ_DISPATCH_RUN_DIR/ENVELOPE.md`"],
  reviewer: ["fresh-context bounded qq Reviewer", "Remain read-only", "context gaps, never findings or passes", "only result surface is `$QQ_DISPATCH_RUN_DIR/ENVELOPE.md`"],
  observer: ["bounded qq Observer", "qq-observer.analysis` v2", "Remain read-only", "only result surface is `$QQ_DISPATCH_RUN_DIR/ENVELOPE.md`"],
  openwiki_maintainer: ["one explicitly scheduled run", "schedule—not the operator, a manual prompt, a source Change, or a Skill invocation", "semantic no-change as success", "must not self-schedule"],
};

for (const role of ROLE_NAMES) {
  const manifestPath = join(root, "delegation/manifests/agents", `${role}.md`);
  const manifest = await readFile(manifestPath, "utf8");
  assert.match(manifest, new RegExp(`^---\\nname: ${role}\\n`, "u"), role);
  assert.equal((manifest.match(/^---$/gmu) ?? []).length, 2, role);
  for (const phrase of expectations[role]) assert.ok(manifest.includes(phrase), `${role}: ${phrase}`);
  assert.equal(manifest.includes(genericMarker), false, role);
  assert.equal(manifest.includes("generic coding assistant"), false, role);

  const customPrompt = await loadRolePrompt(role, { root });
  assert.equal(customPrompt.includes("name: " + role), false, `${role}: frontmatter leaked`);
  assert.equal((customPrompt.match(/# qq methodology kernel/gu) ?? []).length, 1, role);
  const contextFiles = interactive.has(role)
    ? [{ path: "/project/AGENTS.md", content: "PROJECT ORIENTATION" }]
    : [];
  const skills = policy.roles[role].map((name) => ({
    name, description: `Description for ${name}`,
    filePath: join(root, "skills", name, "SKILL.md"), disableModelInvocation: false,
  }));
  const options = {
    selectedTools: ["read", "bash"], cwd: `/work/${role}`,
    appendSystemPrompt: "APPENDED ROLE-SAFE GUIDANCE", contextFiles, skills,
  };
  const actual = buildSystemPrompt({ customPrompt, ...options });
  const expected = expectedStockPrompt(customPrompt, options);
  assert.equal(actual, expected, `${role}: stock Pi 0.81.1 custom-prompt behavior drifted`);
  assert.equal(actual.includes(genericMarker), false, role);
  assert.equal((actual.match(/# qq methodology kernel/gu) ?? []).length, 1, role);
  assert.equal((actual.match(new RegExp(`Current working directory: /work/${role}`, "gu")) ?? []).length, 1, role);
  assert.equal((actual.match(/APPENDED ROLE-SAFE GUIDANCE/gu) ?? []).length, 1, role);
  assert.equal(actual.includes("<project_context>"), interactive.has(role), role);
  assert.equal(actual.includes("PROJECT ORIENTATION"), interactive.has(role), role);
  for (const name of policy.roles[role]) {
    assert.equal((actual.match(new RegExp(`<name>${name}</name>`, "gu")) ?? []).length, 1, `${role}:${name}`);
  }
}
console.log("test-qq-role-prompts: pass");
JS
