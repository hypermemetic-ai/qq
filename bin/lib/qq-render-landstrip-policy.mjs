#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message) {
  process.stderr.write(`[qq-dispatch] policy error: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) fail("arguments must be --name value pairs");
    if (parsed.has(name)) fail(`duplicate argument ${name}`);
    parsed.set(name, value);
  }
  return parsed;
}

function required(args, name) {
  const value = args.get(name);
  if (!value) fail(`missing ${name}`);
  return value;
}

function canonicalDirectory(input, label) {
  let resolved;
  try {
    resolved = fs.realpathSync(input);
  } catch (error) {
    fail(`${label} is unavailable: ${error.message}`);
  }
  if (!fs.statSync(resolved).isDirectory()) fail(`${label} is not a directory`);
  return resolved;
}

function pathIsStrictlyWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function writePrivateJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

const args = parseArgs(process.argv.slice(2));
const rolesPath = required(args, "--roles");
const role = required(args, "--role");
const runId = required(args, "--run-id");
const worktree = canonicalDirectory(required(args, "--worktree"), "worktree");
const gitCommonDir = canonicalDirectory(required(args, "--git-common-dir"), "Git common directory");
const gitWorktreeDir = canonicalDirectory(required(args, "--git-worktree-dir"), "worktree Git directory");
const runtimeRoot = canonicalDirectory(required(args, "--runtime-root"), "runtime root");
const piAuthInput = required(args, "--pi-auth");
if (!path.isAbsolute(piAuthInput)) fail("Pi auth path must be absolute");
const piConfigDir = canonicalDirectory(path.dirname(piAuthInput), "Pi config directory");
const piAuthPath = path.join(piConfigDir, path.basename(piAuthInput));
if (!pathIsStrictlyWithin(piAuthPath, runtimeRoot)) fail("Pi auth path must stay beneath the runtime root");
const piSubagentTempInput = required(args, "--pi-subagent-temp-prefix");
if (!path.isAbsolute(piSubagentTempInput)) fail("pi-subagents temporary prefix must be absolute");
if (path.basename(piSubagentTempInput) !== "pi-subagent-*") {
  fail("pi-subagents temporary prefix must end in pi-subagent-*");
}
const piSubagentTempDir = canonicalDirectory(
  path.dirname(piSubagentTempInput),
  "pi-subagents temporary directory",
);
const piSubagentTempPrefix = path.join(piSubagentTempDir, "pi-subagent-*");
const captureInput = args.get("--structured-output-capture") ?? "";
let structuredOutputCapture = "";
if (captureInput) {
  if (!path.isAbsolute(captureInput)) fail("structured-output capture path must be absolute");
  const captureLeaf = path.basename(captureInput);
  if (!captureLeaf || captureLeaf === "." || captureLeaf === "..") fail("structured-output capture filename is invalid");
  const captureParent = canonicalDirectory(path.dirname(captureInput), "structured-output capture directory");
  structuredOutputCapture = path.join(captureParent, captureLeaf);
  if (!pathIsStrictlyWithin(structuredOutputCapture, runtimeRoot)
    && !pathIsStrictlyWithin(structuredOutputCapture, worktree)) {
    fail("structured-output capture path must stay beneath the runtime root or assigned worktree");
  }
  try {
    if (fs.lstatSync(structuredOutputCapture).isSymbolicLink()) fail("structured-output capture path may not be a symlink");
  } catch (error) {
    if (error?.code !== "ENOENT") fail(`cannot inspect structured-output capture path: ${error.message}`);
  }
}
const policyPath = required(args, "--policy");
const eventLogPath = required(args, "--event-log");
const timeout = required(args, "--timeout");
const landstripVersion = required(args, "--landstrip-version");

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(rolesPath, "utf8"));
} catch (error) {
  fail(`cannot read role manifest: ${error.message}`);
}
if (manifest?.schemaVersion !== 1) fail("role manifest has an unsupported schema version");
const definition = manifest?.roles?.[role];
if (!definition || typeof definition !== "object") fail(`role '${role}' is not declared`);
if (!["read-only", "workspace-write"].includes(definition.access)) fail(`role '${role}' has an invalid access scope`);
if (typeof definition.policyIdentity !== "string" || !definition.policyIdentity) fail(`role '${role}' has no policy identity`);

const allowWrite = [];
if (definition.access === "workspace-write") {
  allowWrite.push(runtimeRoot, worktree, gitCommonDir, gitWorktreeDir, "/dev/null");
} else if (structuredOutputCapture) {
  allowWrite.push(structuredOutputCapture);
}
allowWrite.push(piSubagentTempPrefix);

const policy = {
  enabled: true,
  network: {
    allowNetwork: false,
    allowLocalBinding: false,
    allowAllUnixSockets: false,
    allowUnixSockets: [],
    allowedDomains: [],
    deniedDomains: [],
  },
  filesystem: {
    allowWrite: [...new Set(allowWrite)],
    denyWrite: [piAuthPath],
  },
};
writePrivateJson(policyPath, policy);

fs.mkdirSync(path.dirname(eventLogPath), { recursive: true, mode: 0o700 });
fs.appendFileSync(eventLogPath, `${JSON.stringify({
  type: "qq.dispatch.adapter.launch",
  timestamp: new Date().toISOString(),
  pid: process.ppid,
  runId,
  role,
  policyIdentity: definition.policyIdentity,
  access: definition.access,
  allowWrite: policy.filesystem.allowWrite,
  worktree,
  gitCommonDir,
  gitWorktreeDir,
  runtimeRoot,
  structuredOutputCapture: structuredOutputCapture || null,
  timeout,
  landstripVersion,
})}\n`, { mode: 0o600 });

process.stdout.write(`${definition.policyIdentity}\t${definition.access}\n`);
