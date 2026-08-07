#!/usr/bin/env node
/**
 * Pure session-start qq role identity policy plus the stock-Pi exec boundary.
 *
 * A normal interactive Herdr launch resolves one role before Pi starts. Nothing
 * in this module observes or changes that role after exec.
 */
import { constants as fsConstants } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MODULE_PATH = fileURLToPath(import.meta.url);
export const ROOT = resolve(dirname(MODULE_PATH), "../..");
export const ROLE_NAMES = Object.freeze([
  "architect", "coordinator", "change_owner", "runner", "implementer",
  "researcher", "reviewer", "observer", "openwiki_maintainer",
]);
const ROLE_SET = new Set(ROLE_NAMES);
const INTERACTIVE_ROLES = new Set(["architect", "coordinator", "change_owner", "runner"]);
const NAMED_TAB_ROLES = new Set(["architect", "coordinator", "change_owner"]);
const PROFILE_ROLES = Object.freeze([
  "architect", "change_owner", "compactor", "coordinator", "implementer",
  "observer", "researcher", "reviewer", "runner",
]);
const CONTRACT_SKILLS = Object.freeze([
  "agent-messaging", "delegate", "diagnosing-bugs", "operator-input",
  "research", "review", "uat-signoff", "writing-for-clients",
]);
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/u;
const POLICY_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PROVIDER_OR_MODEL = /^[a-z0-9][a-z0-9._-]{0,159}$/u;
const EFFORTS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const GENERIC_PI_MARKER = "You are an expert coding assistant operating inside pi";
const MAX_CANONICAL_TEXT = 1024 * 1024;
const MAX_SUBPROCESS_OUTPUT = 512 * 1024;
const GIT_TIMEOUT_MS = 15000;
const METHODOLOGY_KEY = "qq.methodology";
const PINNED_PI_PACKAGE = "@earendil-works/pi-coding-agent";
const PINNED_PI_VERSION = "0.81.1";
const MAX_PINNED_PI_FILE = 2 * 1024 * 1024;
const ADMIN_COMMANDS = new Set(["install", "remove", "uninstall", "update", "list", "config"]);
const CONFLICTING_FLAGS = new Set([
  "--system-prompt", "--append-system-prompt", "--provider", "--model",
  "--models", "--thinking", "--skill", "--no-skills", "-ns",
  "--extension", "-e", "--no-context-files", "-nc",
]);
const BINDING_IDENTITY_FIELDS = Object.freeze([
  "pane_id", "workspace_id", "tab_id", "display_only", "role", "stored_tag",
]);

export class Refusal extends Error {}

function exactObject(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function hasAmbiguousControl(value) {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

async function canonicalText(root, relativePath, label) {
  const canonicalRoot = resolve(root);
  const target = resolve(canonicalRoot, relativePath);
  const rel = relative(canonicalRoot, target);
  if (!rel || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Refusal(`${label} path is not canonical`);
  }
  let state;
  let canonical;
  try {
    [state, canonical] = await Promise.all([lstat(target), realpath(target)]);
  } catch {
    throw new Refusal(`${label} is unsafe or unavailable`);
  }
  if (!state.isFile() || state.isSymbolicLink() || canonical !== target
    || state.uid !== process.getuid() || (state.mode & fsConstants.S_IWOTH) !== 0
    || state.size < 1 || state.size > MAX_CANONICAL_TEXT) {
    throw new Refusal(`${label} is unsafe or unavailable`);
  }
  let value;
  try {
    value = await readFile(target, "utf8");
  } catch {
    throw new Refusal(`${label} is unsafe or unavailable`);
  }
  if (!value.trim() || hasAmbiguousControl(value)) {
    throw new Refusal(`${label} has empty or ambiguous content`);
  }
  return value;
}

/** Minimal strict JSON parser: unlike JSON.parse, duplicate object members are refused. */
class StrictJsonParser {
  constructor(text, label) {
    this.text = text;
    this.label = label;
    this.offset = 0;
  }

  fail(detail = "is malformed JSON") {
    throw new Refusal(`${this.label} ${detail}`);
  }

  whitespace() {
    while (/[\u0020\u000a\u000d\u0009]/u.test(this.text[this.offset] ?? "")) this.offset += 1;
  }

  parse() {
    this.whitespace();
    const value = this.value();
    this.whitespace();
    if (this.offset !== this.text.length) this.fail();
    return value;
  }

  value() {
    const next = this.text[this.offset];
    if (next === "{") return this.object();
    if (next === "[") return this.array();
    if (next === '"') return this.string();
    if (next === "t" && this.text.slice(this.offset, this.offset + 4) === "true") {
      this.offset += 4; return true;
    }
    if (next === "f" && this.text.slice(this.offset, this.offset + 5) === "false") {
      this.offset += 5; return false;
    }
    if (next === "n" && this.text.slice(this.offset, this.offset + 4) === "null") {
      this.offset += 4; return null;
    }
    return this.number();
  }

  object() {
    const result = Object.create(null);
    const seen = new Set();
    this.offset += 1;
    this.whitespace();
    if (this.text[this.offset] === "}") { this.offset += 1; return result; }
    while (true) {
      if (this.text[this.offset] !== '"') this.fail();
      const key = this.string();
      if (seen.has(key)) this.fail(`contains duplicate key ${JSON.stringify(key)}`);
      seen.add(key);
      this.whitespace();
      if (this.text[this.offset] !== ":") this.fail();
      this.offset += 1;
      this.whitespace();
      result[key] = this.value();
      this.whitespace();
      if (this.text[this.offset] === "}") { this.offset += 1; return result; }
      if (this.text[this.offset] !== ",") this.fail();
      this.offset += 1;
      this.whitespace();
    }
  }

  array() {
    const result = [];
    this.offset += 1;
    this.whitespace();
    if (this.text[this.offset] === "]") { this.offset += 1; return result; }
    while (true) {
      result.push(this.value());
      this.whitespace();
      if (this.text[this.offset] === "]") { this.offset += 1; return result; }
      if (this.text[this.offset] !== ",") this.fail();
      this.offset += 1;
      this.whitespace();
    }
  }

  string() {
    const start = this.offset;
    this.offset += 1;
    while (this.offset < this.text.length) {
      const code = this.text.charCodeAt(this.offset);
      if (code === 0x22) {
        this.offset += 1;
        try { return JSON.parse(this.text.slice(start, this.offset)); }
        catch { this.fail(); }
      }
      if (code < 0x20) this.fail();
      if (code === 0x5c) {
        this.offset += 1;
        const escaped = this.text[this.offset];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(this.text.slice(this.offset + 1, this.offset + 5))) this.fail();
          this.offset += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escaped ?? "")) this.fail();
      }
      this.offset += 1;
    }
    this.fail();
  }

  number() {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(this.text.slice(this.offset));
    if (!match) this.fail();
    this.offset += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.fail();
    return value;
  }
}

export function strictJson(text, label) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_CANONICAL_TEXT
    || hasAmbiguousControl(text)) {
    throw new Refusal(`${label} has unsafe or ambiguous bytes`);
  }
  return new StrictJsonParser(text, label).parse();
}

async function canonicalPinnedPiFile(packageRoot, target, relativePath, label, executable = false) {
  const expected = join(packageRoot, relativePath);
  if (target !== expected) throw new Refusal(`${label} is outside the pinned stock Pi package`);
  let state;
  let canonical;
  try { [state, canonical] = await Promise.all([lstat(target), realpath(target)]); }
  catch { throw new Refusal(`${label} is unsafe or unavailable`); }
  if (!state.isFile() || state.isSymbolicLink() || canonical !== target
    || state.uid !== process.getuid() || (state.mode & fsConstants.S_IWOTH) !== 0
    || (executable && (state.mode & fsConstants.S_IXUSR) === 0)
    || state.size < 1 || state.size > MAX_PINNED_PI_FILE) {
    throw new Refusal(`${label} is unsafe or unavailable`);
  }
  return target;
}

export async function loadPinnedPiParser(pointers) {
  if (!exactObject(pointers, ["packageRoot", "manifest", "cli", "parser"])
    || ![pointers.packageRoot, pointers.manifest, pointers.cli, pointers.parser]
      .every((value) => typeof value === "string" && isAbsolute(value))) {
    throw new Refusal("pinned stock Pi package pointers are malformed");
  }
  const packageRoot = pointers.packageRoot;
  let packageState;
  let canonicalPackage;
  try {
    [packageState, canonicalPackage] = await Promise.all([
      lstat(packageRoot), realpath(packageRoot),
    ]);
  } catch {
    throw new Refusal("pinned stock Pi package root is unsafe or unavailable");
  }
  if (!packageState.isDirectory() || packageState.isSymbolicLink()
    || canonicalPackage !== packageRoot || packageState.uid !== process.getuid()
    || (packageState.mode & fsConstants.S_IWOTH) !== 0) {
    throw new Refusal("pinned stock Pi package root is unsafe or unavailable");
  }
  await Promise.all([
    canonicalPinnedPiFile(packageRoot, pointers.manifest, "package.json", "pinned stock Pi manifest"),
    canonicalPinnedPiFile(packageRoot, pointers.cli, join("dist", "cli.js"),
      "pinned stock Pi CLI", true),
    canonicalPinnedPiFile(packageRoot, pointers.parser, join("dist", "cli", "args.js"),
      "pinned stock Pi argument parser"),
  ]);

  let manifestSource;
  try { manifestSource = await readFile(pointers.manifest, "utf8"); }
  catch { throw new Refusal("pinned stock Pi manifest is unsafe or unavailable"); }
  const manifest = strictJson(manifestSource, "pinned stock Pi manifest");
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)
    || manifest.name !== PINNED_PI_PACKAGE || manifest.version !== PINNED_PI_VERSION) {
    throw new Refusal(`stock Pi package must be ${PINNED_PI_PACKAGE}@${PINNED_PI_VERSION}`);
  }

  let parserModule;
  try { parserModule = await import(pathToFileURL(pointers.parser).href); }
  catch { throw new Refusal("pinned stock Pi argument parser module could not be loaded"); }
  if (typeof parserModule?.parseArgs !== "function") {
    throw new Refusal("pinned stock Pi argument parser has no parseArgs export");
  }
  return parserModule.parseArgs;
}

function validateParsedPiArgs(parsed) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
    || !Array.isArray(parsed.messages) || parsed.messages.some((value) => typeof value !== "string")
    || !Array.isArray(parsed.fileArgs) || parsed.fileArgs.some((value) => typeof value !== "string")
    || !(parsed.unknownFlags instanceof Map)
    || [...parsed.unknownFlags].some(([key, value]) =>
      typeof key !== "string" || (typeof value !== "string" && value !== true))
    || !Array.isArray(parsed.diagnostics)
    || parsed.diagnostics.some((diagnostic) =>
      !exactObject(diagnostic, ["type", "message"])
      || !["error", "warning"].includes(diagnostic.type)
      || typeof diagnostic.message !== "string")) {
    throw new Refusal("pinned stock Pi argument parser returned a malformed result");
  }
  for (const field of ["help", "version", "print"]) {
    if (parsed[field] !== undefined && parsed[field] !== true) {
      throw new Refusal("pinned stock Pi argument parser returned a malformed result");
    }
  }
  if (parsed.mode !== undefined && !["text", "json", "rpc"].includes(parsed.mode)) {
    throw new Refusal("pinned stock Pi argument parser returned a malformed result");
  }
  if (parsed.export !== undefined && typeof parsed.export !== "string") {
    throw new Refusal("pinned stock Pi argument parser returned a malformed result");
  }
  if (parsed.listModels !== undefined
    && parsed.listModels !== true && typeof parsed.listModels !== "string") {
    throw new Refusal("pinned stock Pi argument parser returned a malformed result");
  }
  return parsed;
}

function parseCompletePiArgs(parsePiArgs, args) {
  if (typeof parsePiArgs !== "function") {
    throw new Refusal("pinned stock Pi argument parser dependency is unavailable");
  }
  let parsed;
  try { parsed = parsePiArgs(Object.freeze([...args])); }
  catch { throw new Refusal("pinned stock Pi argument parse failed"); }
  return validateParsedPiArgs(parsed);
}

function parsedInvocationIsPassThrough(parsed) {
  return parsed.diagnostics.some((diagnostic) => diagnostic.type === "error")
    || parsed.version === true || parsed.help === true || parsed.listModels !== undefined
    || Boolean(parsed.export) || parsed.print === true
    || parsed.mode === "json" || parsed.mode === "rpc";
}

function manifestBody(source, role) {
  const lines = source.split("\n");
  if (lines[0] !== "---") throw new Refusal(`role manifest for ${role} has malformed frontmatter`);
  const close = lines.indexOf("---", 1);
  if (close < 1) throw new Refusal(`role manifest for ${role} has malformed frontmatter`);
  const names = lines.slice(1, close).filter((line) => line.startsWith("name:"));
  if (names.length !== 1 || names[0] !== `name: ${role}`) {
    throw new Refusal(`role manifest for ${role} has mismatched identity frontmatter`);
  }
  const body = lines.slice(close + 1).join("\n").trim();
  if (!body) throw new Refusal(`role manifest for ${role} has an empty system-prompt body`);
  if (body.includes("# qq methodology kernel") || body.includes(GENERIC_PI_MARKER)) {
    throw new Refusal(`role manifest for ${role} contains a non-canonical identity body`);
  }
  return body;
}

export async function loadRolePrompt(role, options = {}) {
  if (!ROLE_SET.has(role)) throw new Refusal(`unsupported qq role: ${role}`);
  const root = resolve(options.root ?? ROOT);
  const [source, kernel] = await Promise.all([
    canonicalText(root, join("delegation", "manifests", "agents", `${role}.md`), `role manifest for ${role}`),
    canonicalText(root, join("methodology", "KERNEL.md"), "qq methodology kernel"),
  ]);
  if ((kernel.match(/# qq methodology kernel/gu) ?? []).length !== 1
    || kernel.includes(GENERIC_PI_MARKER)) {
    throw new Refusal("qq methodology kernel has a non-canonical identity body");
  }
  return `${manifestBody(source, role)}\n\n${kernel.trim()}`;
}

function validNameList(value, names) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && names.has(item))
    && new Set(value).size === value.length;
}

export async function loadRoleSkillPolicy(options = {}) {
  const root = resolve(options.root ?? ROOT);
  const source = await canonicalText(root, join("delegation", "policies", "role-skills.json"),
    "qq role-skill policy");
  const value = strictJson(source, "qq role-skill policy");
  if (!exactObject(value, ["schema", "version", "inventory", "roles", "assignment_selectable"])
    || value.schema !== "qq.role-skills/v1" || value.version !== 1
    || !Array.isArray(value.inventory)
    || value.inventory.some((name) => typeof name !== "string" || !POLICY_NAME.test(name))
    || value.inventory.join("\0") !== CONTRACT_SKILLS.join("\0")
    || !exactObject(value.roles, ROLE_NAMES)
    || !exactObject(value.assignment_selectable, ["writing-for-clients"])
    || !validNameList(value.assignment_selectable["writing-for-clients"], ROLE_SET)
    || value.assignment_selectable["writing-for-clients"].join("\0") !== "implementer\0reviewer") {
    throw new Refusal("qq role-skill policy has an invalid shape");
  }
  const inventory = new Set(value.inventory);
  for (const role of ROLE_NAMES) {
    if (!validNameList(value.roles[role], inventory)) {
      throw new Refusal(`qq role-skill policy for ${role} is malformed`);
    }
  }
  const skillSourcePromises = [];
  for (const skill of value.inventory) {
    skillSourcePromises.push(canonicalText(root, join("skills", skill, "SKILL.md"),
      `canonical qq Skill ${skill}`));
  }
  const skillSources = await Promise.all(skillSourcePromises);
  for (let index = 0; index < value.inventory.length; index += 1) {
    const skill = value.inventory[index];
    const names = skillSources[index].split("\n").filter((line) => line === `name: ${skill}`);
    if (names.length !== 1) throw new Refusal(`canonical qq Skill ${skill} has mismatched identity`);
  }
  return Object.freeze({
    inventory: Object.freeze([...value.inventory]),
    roles: Object.freeze(Object.fromEntries(ROLE_NAMES.map((role) =>
      [role, Object.freeze([...value.roles[role]])]))),
    assignmentSelectable: Object.freeze({
      "writing-for-clients": Object.freeze([...value.assignment_selectable["writing-for-clients"]]),
    }),
  });
}

export function skillPathsForRole(root, roleMap, role) {
  if (!ROLE_SET.has(role) || !Array.isArray(roleMap?.[role])) {
    throw new Refusal("qq role Skill scope is unresolved");
  }
  const canonicalRoot = resolve(root);
  const paths = roleMap[role].map((skill) => join(canonicalRoot, "skills", skill, "SKILL.md"));
  if (new Set(paths).size !== paths.length) throw new Refusal("qq role Skill paths are duplicated");
  return paths;
}

export async function loadExecutionProfiles(options = {}) {
  const root = resolve(options.root ?? ROOT);
  const source = await canonicalText(root, join("delegation", "policies", "execution-profiles.json"),
    "qq execution-profile policy");
  const value = strictJson(source, "qq execution-profile policy");
  if (!exactObject(value, PROFILE_ROLES)) {
    throw new Refusal("qq execution-profile policy has an invalid role map");
  }
  for (const role of PROFILE_ROLES) {
    const profile = value[role];
    if (!exactObject(profile, ["provider", "model", "effort", "serviceClass"])
      || typeof profile.provider !== "string" || !PROVIDER_OR_MODEL.test(profile.provider)
      || typeof profile.model !== "string" || !PROVIDER_OR_MODEL.test(profile.model)
      || typeof profile.effort !== "string" || !EFFORTS.has(profile.effort)
      || profile.serviceClass !== "provider-default") {
      throw new Refusal(`qq execution profile for ${role} is unsupported`);
    }
  }
  return Object.freeze(Object.fromEntries(PROFILE_ROLES.map((role) =>
    [role, Object.freeze({ ...value[role] })])));
}

function conflictingFlag(args) {
  for (const arg of args) {
    if (CONFLICTING_FLAGS.has(arg)) return arg;
    const name = arg.startsWith("--") && arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : undefined;
    if (name && CONFLICTING_FLAGS.has(name)) return name;
  }
  return undefined;
}

function gitInspectionEnvironment(env) {
  const result = { ...env };
  // Repository identity comes only from cwd discovery, never an inherited
  // Git plumbing override. Stock Pi still receives the original environment.
  delete result.GIT_DIR;
  delete result.GIT_WORK_TREE;
  delete result.GIT_COMMON_DIR;
  return result;
}

function runGit(args, cwd, env) {
  return spawnSync("git", args, {
    cwd, env: gitInspectionEnvironment(env), encoding: "utf8", input: "",
    timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_SUBPROCESS_OUTPUT,
  });
}

function exactGitLine(output) {
  if (typeof output !== "string" || output === "" || output.includes("\0") || output.includes("\r")) {
    return undefined;
  }
  const value = output.endsWith("\n") ? output.slice(0, -1) : output;
  return value !== "" && !value.includes("\n") ? value : undefined;
}

function gitCompleted(result, status) {
  return !result?.error && !result?.signal && result?.status === status
    && typeof result.stdout === "string" && typeof result.stderr === "string";
}

/** Fail-closed classification of the current Repository's common-local link. */
export async function methodologyIsLinked(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  if (typeof cwd !== "string" || !isAbsolute(cwd)) return false;

  const commonResult = runGit(
    ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd, env,
  );
  if (!gitCompleted(commonResult, 0)) return false;
  const common = exactGitLine(commonResult.stdout);
  if (!common || !isAbsolute(common)) return false;
  try {
    const commonState = await stat(common);
    if (!commonState.isDirectory()) return false;
  } catch {
    return false;
  }

  const configResult = runGit([
    `--git-dir=${common}`, "config", "--local", "--no-includes",
    "--type=bool", "--get-all", METHODOLOGY_KEY,
  ], cwd, env);
  if (!gitCompleted(configResult, 0)) return false;
  return exactGitLine(configResult.stdout) === "true";
}

function bindingResult(stdout) {
  const document = strictJson(stdout, "tab-role binding output");
  if (!exactObject(document, ["ok", "schema", "result"])
    || document.ok !== true || document.schema !== "qq.tab-role/v1") {
    throw new Refusal("tab-role binding returned an invalid result");
  }
  const value = document.result;
  if (!exactObject(value,
    ["schema", "version", "pane_id", "workspace_id", "tab_id", "display_only", "role", "stored_tag"])
    || value.schema !== "qq.tab-role/v1" || value.version !== 1
    || ![value.pane_id, value.workspace_id, value.tab_id].every((item) =>
      typeof item === "string" && RESOURCE_ID.test(item))
    || typeof value.display_only !== "boolean") {
    throw new Refusal("tab-role binding returned malformed resource identity");
  }
  if (value.display_only) {
    if (value.role !== null || value.stored_tag !== null) {
      throw new Refusal("display-only Backlog-board tab has an illegal role binding");
    }
    return Object.freeze({ ...value });
  }
  if (!INTERACTIVE_ROLES.has(value.role)
    || (value.role === "runner" ? value.stored_tag !== null : value.stored_tag !== value.role)
    || (value.stored_tag !== null && !NAMED_TAB_ROLES.has(value.stored_tag))) {
    throw new Refusal("interactive tab resolved to an unknown or inconsistent role");
  }
  return Object.freeze({ ...value });
}

async function canonicalExecutable(root, relativePath, label) {
  const target = resolve(root, relativePath);
  let state;
  let canonical;
  try { [state, canonical] = await Promise.all([lstat(target), realpath(target)]); }
  catch { throw new Refusal(`${label} is unsafe or unavailable`); }
  if (!state.isFile() || state.isSymbolicLink() || canonical !== target
    || state.uid !== process.getuid() || (state.mode & fsConstants.S_IWOTH) !== 0
    || (state.mode & fsConstants.S_IXUSR) === 0) {
    throw new Refusal(`${label} is unsafe or unavailable`);
  }
  return target;
}

export async function inspectPaneBinding(pane, options = {}) {
  if (typeof pane !== "string" || !RESOURCE_ID.test(pane)) {
    throw new Refusal("interactive qq role binding requires one exact HERDR_PANE_ID");
  }
  const root = resolve(options.root ?? ROOT);
  const executable = options.bindingBin ?? await canonicalExecutable(root,
    join("bin", "qq-tab-role"), "qq-tab-role inspector");
  let result;
  if (options.run) {
    result = await options.run(executable, ["inspect", "--pane", pane]);
  } else {
    result = spawnSync(executable, ["inspect", "--pane", pane], {
      cwd: process.cwd(), env: process.env, encoding: "utf8", input: "",
      timeout: 15000, maxBuffer: MAX_SUBPROCESS_OUTPUT,
    });
  }
  if (result?.error || result?.signal || result?.status !== 0
    || typeof result?.stdout !== "string" || typeof result?.stderr !== "string") {
    const detail = typeof result?.stderr === "string" ? result.stderr.trim() : "";
    throw new Refusal(`tab-role binding inspection failed${detail ? `: ${detail}` : ""}`);
  }
  if (result.stderr !== "" || Buffer.byteLength(result.stdout, "utf8") > MAX_SUBPROCESS_OUTPUT) {
    throw new Refusal("tab-role binding inspection returned uncertain output");
  }
  return bindingResult(result.stdout);
}

/** Build exactly the argument vector that the production launcher execs. */
export async function buildLaunchSpec(originalArgs, options = {}) {
  if (!Array.isArray(originalArgs) || originalArgs.some((arg) => typeof arg !== "string" || arg.includes("\0"))) {
    throw new Refusal("Pi arguments contain NUL or non-string ambiguity");
  }
  const parsed = parseCompletePiArgs(options.parsePiArgs, originalArgs);
  const env = options.env ?? process.env;
  if (parsedInvocationIsPassThrough(parsed)) {
    return Object.freeze({ bound: false, args: Object.freeze([...originalArgs]) });
  }
  if (!(await methodologyIsLinked({ cwd: options.cwd ?? process.cwd(), env }))) {
    return Object.freeze({ bound: false, args: Object.freeze([...originalArgs]) });
  }
  const conflict = conflictingFlag(originalArgs);
  if (conflict) throw new Refusal(`normal role-bound Pi launch rejects identity override ${conflict}`);

  const root = resolve(options.root ?? ROOT);
  const inspectionOptions = {
    root, bindingBin: options.bindingBin, run: options.run,
  };
  const binding = await inspectPaneBinding(env.HERDR_PANE_ID, inspectionOptions);
  if (binding.display_only) throw new Refusal("display-only Backlog-board tab cannot start Pi");
  const role = binding.role;
  if (!INTERACTIVE_ROLES.has(role)) throw new Refusal("interactive Pi launch resolved an unknown role");

  const [systemPrompt, skillPolicy, profiles] = await Promise.all([
    loadRolePrompt(role, { root }),
    loadRoleSkillPolicy({ root }),
    loadExecutionProfiles({ root }),
  ]);
  const profile = profiles[role];
  if (!profile) throw new Refusal(`qq execution profile for ${role} is unavailable`);
  const skills = skillPathsForRole(root, skillPolicy.roles, role);
  const injected = [
    "--system-prompt", systemPrompt,
    "--model", `${profile.provider}/${profile.model}:${profile.effort}`,
    "--no-skills",
    ...skills.flatMap((path) => ["--skill", path]),
  ];

  // This second full inspection is the startup linearization fence. All role
  // policy and resource work is complete; after equality succeeds, only the
  // already-built vector is frozen and returned for immediate stock-Pi exec.
  const currentBinding = await inspectPaneBinding(env.HERDR_PANE_ID, inspectionOptions);
  if (BINDING_IDENTITY_FIELDS.some((field) => currentBinding[field] !== binding[field])) {
    throw new Refusal("tab-role binding changed before stock Pi exec");
  }
  return Object.freeze({
    bound: true,
    role,
    binding,
    profile,
    skills: Object.freeze([...skills]),
    systemPrompt,
    args: Object.freeze([...injected, ...originalArgs]),
  });
}

async function main(argv) {
  try {
    if (argv.length < 9
      || argv[0] !== "--package" || !isAbsolute(argv[1])
      || argv[2] !== "--manifest" || !isAbsolute(argv[3])
      || argv[4] !== "--cli" || !isAbsolute(argv[5])
      || argv[6] !== "--parser" || !isAbsolute(argv[7])
      || argv[8] !== "--") {
      throw new Refusal("internal stock Pi launch arguments are malformed");
    }
    const pointers = Object.freeze({
      packageRoot: argv[1], manifest: argv[3], cli: argv[5], parser: argv[7],
    });
    const originalArgs = argv.slice(9);
    if (ADMIN_COMMANDS.has(originalArgs[0])) {
      process.execve(pointers.cli, [pointers.cli, ...originalArgs], process.env);
      throw new Refusal("stock Pi exec unexpectedly returned");
    }
    const parsePiArgs = await loadPinnedPiParser(pointers);
    const spec = await buildLaunchSpec(originalArgs, { parsePiArgs });
    process.execve(pointers.cli, [pointers.cli, ...spec.args], process.env);
    throw new Refusal("stock Pi exec unexpectedly returned");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`pi: ${message}\n`);
    process.exitCode = 69;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
