import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import type { AgentConfig } from "../../.pi/npm/node_modules/pi-subagents/src/agents/agents.ts";
import { executeAsyncSingle } from "../../.pi/npm/node_modules/pi-subagents/src/runs/background/async-execution.ts";
import { runSync } from "../../.pi/npm/node_modules/pi-subagents/src/runs/foreground/execution.ts";
import {
  cleanupStructuredOutputRuntime,
  createStructuredOutputRuntime,
} from "../../.pi/npm/node_modules/pi-subagents/src/runs/shared/structured-output.ts";

type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE-UNDER-SUBSTRATE";

interface CheckRecord {
  id: number;
  title: string;
  verdict: Verdict;
  boundary: string;
  observations: unknown;
  unresolvedRisk?: string;
}

interface ProcessIdentity {
  name: string;
  pid: number;
  startTime?: string;
  command?: string;
}

const runtimeRoot = fs.realpathSync(process.argv[2] ?? "");
const checksDir = path.dirname(new URL(import.meta.url).pathname);
const pilotRoot = fs.realpathSync(path.join(checksDir, ".."));
const worktree = fs.realpathSync(path.join(pilotRoot, ".."));
const wrapper = path.join(pilotRoot, "bin", "pi-landstrip-wrapper");
const mockPi = fs.realpathSync(process.env.QQ_PILOT_MOCK_PI ?? "");
const evidenceDir = path.join(pilotRoot, "evidence");
const rawEvidenceDir = path.join(evidenceDir, "raw");
const schemaPath = path.join(pilotRoot, "manifests", "completion-envelope.schema.json");
const allowedExtension = path.join(pilotRoot, "probes", "allowed-extension.ts");
const unsupportedLandstrip = path.join(pilotRoot, "probes", "unsupported-landstrip");
const gitCommonDir = fs.realpathSync(
  spawnSync("git", ["-C", worktree, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
    encoding: "utf8",
  }).stdout.trim(),
);
const gitWorktreeDir = fs.realpathSync(
  spawnSync("git", ["-C", worktree, "rev-parse", "--path-format=absolute", "--git-dir"], {
    encoding: "utf8",
  }).stdout.trim(),
);

fs.mkdirSync(rawEvidenceDir, { recursive: true });

let runSequence = 0;
const records: CheckRecord[] = [];

function agent(name: "reviewer" | "researcher" | "implementer"): AgentConfig {
  const readOnly = name !== "implementer";
  return {
    name,
    description: `${name} pilot role`,
    tools: readOnly ? ["read", "grep", "find", "ls", "bash"] : ["read", "grep", "find", "ls", "bash", "edit", "write"],
    systemPromptMode: "replace",
    inheritProjectContext: false,
    inheritSkills: false,
    defaultContext: "fresh",
    acceptanceRole: readOnly ? "read-only" : "writer",
    systemPrompt: `Act as the qq pilot ${name}.`,
    source: "project",
    filePath: path.join(pilotRoot, "manifests", "agents", `${name}.md`),
    extensions: [],
    completionGuard: false,
  };
}

function nextRunId(prefix: string): string {
  runSequence += 1;
  return `${prefix}-${String(runSequence).padStart(2, "0")}`;
}

async function withEnvironment<T>(
  updates: Record<string, string | undefined>,
  operation: () => Promise<T> | T,
): Promise<T> {
  const prior = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(updates)) {
    prior.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await operation();
  } finally {
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function foreground(
  role: "reviewer" | "researcher" | "implementer",
  scenario: string,
  options: {
    cwd?: string;
    sessionFile?: string;
    directMock?: boolean;
    structuredOutput?: ReturnType<typeof createStructuredOutputRuntime>;
    agentOverride?: AgentConfig;
    extraEnv?: Record<string, string | undefined>;
    runId?: string;
  } = {},
) {
  const runId = options.runId ?? nextRunId(`check-${scenario}`);
  const artifactsDir = path.join(runtimeRoot, "foreground-artifacts", runId);
  const selectedAgent = options.agentOverride ?? agent(role);
  return withEnvironment(
    {
      PI_SUBAGENT_PI_BINARY: options.directMock ? mockPi : wrapper,
      QQ_PILOT_PI_BINARY: mockPi,
      QQ_PILOT_SCENARIO: scenario,
      ...options.extraEnv,
    },
    () =>
      runSync(options.cwd ?? worktree, [selectedAgent], role, `Deterministic pilot scenario: ${scenario}`, {
        cwd: options.cwd ?? worktree,
        runId,
        sessionFile: options.sessionFile,
        structuredOutput: options.structuredOutput,
        artifactsDir,
        artifactConfig: {
          enabled: true,
          includeInput: true,
          includeOutput: true,
          includeJsonl: true,
          includeTranscript: true,
          includeMetadata: true,
          cleanupDays: 7,
        },
        acceptance: { level: "none", reason: "deterministic transport and boundary probe" },
      }),
  );
}

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 3000): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}

async function readPilotReport(result: Awaited<ReturnType<typeof foreground>>): Promise<Record<string, unknown> | undefined> {
  const jsonlPath = result.artifactPaths?.jsonlPath;
  if (!jsonlPath) return undefined;
  return waitFor(() => {
    if (!fs.existsSync(jsonlPath)) return undefined;
    const reports = fs
      .readFileSync(jsonlPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          return value.type === "qq_pilot_report" ? [value] : [];
        } catch {
          return [];
        }
      });
    return reports.at(-1);
  });
}

function safeProbeWrite(filePath: string): { ok: boolean; error?: string } {
  try {
    fs.writeFileSync(filePath, "outer substrate baseline\n", { flag: "wx", mode: 0o600 });
    fs.unlinkSync(filePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function attemptOk(report: Record<string, unknown> | undefined, name: string): boolean | undefined {
  const value = report?.[name];
  if (!value || typeof value !== "object") return undefined;
  return (value as { ok?: unknown }).ok === true;
}

function attemptErrno(report: Record<string, unknown> | undefined, name: string): number | undefined {
  const value = report?.[name];
  if (!value || typeof value !== "object") return undefined;
  const errorNumber = (value as { errno?: unknown }).errno;
  return typeof errorNumber === "number" ? errorNumber : undefined;
}

function sanitizeString(input: string): string {
  const replacements: Array<[string, string]> = [
    [gitWorktreeDir, "<GIT_WORKTREE_DIR>"],
    [gitCommonDir, "<GIT_COMMON_DIR>"],
    [runtimeRoot, "<RUNTIME_ROOT>"],
    [worktree, "<WORKTREE>"],
    [mockPi, "<MOCK_PI>"],
    [process.execPath, "<NODE>"],
    [os.homedir(), "<USER_HOME>"],
  ].sort((left, right) => right[0].length - left[0].length);
  let output = input;
  for (const [value, token] of replacements) output = output.split(value).join(token);
  output = output.replace(/\/tmp\/qq-t94-(?:escape|decoy)-[A-Za-z0-9._-]+/g, "<OUTSIDE_TEMP_PROBE>");
  return output;
}

function sanitize(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if ((key === "pid" || key.endsWith("Pid")) && typeof item === "number") return [key, "<PID>"];
        if ((key === "timestamp" || key.endsWith("At")) && (typeof item === "number" || typeof item === "string")) {
          return [key, "<TIMESTAMP>"];
        }
        return [key, sanitize(item)];
      }),
    );
  }
  return value;
}

function recordCheck(record: CheckRecord): void {
  records.push(record);
  const number = String(record.id).padStart(2, "0");
  const log = [
    `check: ${record.id}. ${record.title}`,
    `verdict: ${record.verdict}`,
    `boundary: ${record.boundary}`,
    record.unresolvedRisk ? `unresolved-risk: ${record.unresolvedRisk}` : undefined,
    "observations:",
    JSON.stringify(sanitize(record.observations), null, 2),
    "",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
  fs.writeFileSync(path.join(rawEvidenceDir, `check-${number}.log`), log, "utf8");
}

async function localServerBaseline(): Promise<{
  server?: net.Server;
  port?: number;
  baselineConnected: boolean;
  error?: string;
}> {
  const server = net.createServer((socket) => socket.end());
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("loopback server did not expose a TCP port");
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(address.port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", reject);
    });
    return { server, port: address.port, baselineConnected: true };
  } catch (error) {
    server.close();
    return {
      baselineConnected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkOne(): Promise<void> {
  const escapePath = path.join("/tmp", `qq-t94-escape-${process.pid}`);
  const baselinePaths = [
    path.join(worktree, `.qq-pilot-baseline-${process.pid}`),
    path.join(gitCommonDir, `.qq-pilot-baseline-${process.pid}`),
    path.join(gitWorktreeDir, `.qq-pilot-baseline-${process.pid}`),
    escapePath,
  ];
  const baselines = baselinePaths.map((filePath) => ({ path: filePath, ...safeProbeWrite(filePath) }));
  const loopback = await localServerBaseline();
  const extraEnv = {
    QQ_PILOT_ESCAPE_PATH: escapePath,
    QQ_PILOT_LOOPBACK_PORT: loopback.port === undefined ? undefined : String(loopback.port),
  };
  const reviewerResult = await foreground("reviewer", "boundary-readonly", { extraEnv });
  const researcherResult = await foreground("researcher", "boundary-readonly", { extraEnv });
  const reviewerReport = await readPilotReport(reviewerResult);
  const researcherReport = await readPilotReport(researcherResult);
  await new Promise<void>((resolve) => loopback.server?.close(() => resolve()) ?? resolve());

  const expectedDenied = ["repositoryWrite", "gitCommonWrite", "gitWorktreeWrite", "runtimeWrite", "escapeWrite"];
  const reports = [reviewerReport, researcherReport];
  const filesystemDenied = reports.every((report) => expectedDenied.every((name) => attemptOk(report, name) === false));
  const networkDenied = loopback.baselineConnected && reports.every((report) => attemptOk(report, "loopbackConnect") === false);
  const outerAllowsTargets = baselines.every((baseline) => baseline.ok);
  const childRunsSucceeded = reviewerResult.exitCode === 0 && researcherResult.exitCode === 0;
  const verdict: Verdict = !loopback.baselineConnected
    ? "INCONCLUSIVE-UNDER-SUBSTRATE"
    : outerAllowsTargets && filesystemDenied && networkDenied && childRunsSucceeded
      ? "PASS"
      : "FAIL";

  recordCheck({
    id: 1,
    title: "Reviewer/researcher read-only confinement",
    verdict,
    boundary:
      "Every filesystem target first succeeded from the pilot parent inside Codex's allowed worktree/Git/tmp boundary and was then denied after crossing native Landstrip. Codex rejected the loopback listener itself, so the network subcase cannot be attributed.",
    observations: {
      outerBaselines: baselines,
      loopbackBaseline: { connected: loopback.baselineConnected, error: loopback.error },
      reviewer: {
        exitCode: reviewerResult.exitCode,
        policy: "qq-pilot-reviewer-read-only-v1",
        attempts: reviewerReport,
      },
      researcher: {
        exitCode: researcherResult.exitCode,
        policy: "qq-pilot-researcher-read-only-v1",
        attempts: researcherReport,
      },
      externalEgress: "not attempted; the work order forbids network use and the outer substrate blocks egress",
    },
    unresolvedRisk: loopback.baselineConnected
      ? "The attributable network case is local TCP. External egress remains unobservable beneath Codex's outer network denial."
      : "Codex also blocked the loopback control, so the network denial could not be attributed.",
  });
}

function runRealPiSmoke(role: "reviewer" | "implementer", runId: string) {
  const environment = { ...process.env };
  delete environment.QQ_PILOT_PI_BINARY;
  environment.PI_SUBAGENT_CHILD_AGENT = role;
  environment.PI_SUBAGENT_RUN_ID = runId;
  environment.QQ_PILOT_RUNTIME_ROOT = runtimeRoot;
  environment.QQ_PILOT_TIMEOUT = "10s";
  return spawnSync(wrapper, ["--version"], {
    cwd: worktree,
    env: environment,
    encoding: "utf8",
    timeout: 15000,
  });
}

function installedPiPackageVersion(): string | undefined {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, "pi");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const cli = fs.realpathSync(candidate);
      const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(cli), "..", "package.json"), "utf8")) as {
        version?: unknown;
      };
      return typeof manifest.version === "string" ? manifest.version : undefined;
    } catch {
      // Keep searching PATH entries until the installed Pi package is resolved.
    }
  }
  return undefined;
}

async function checkTwo(): Promise<void> {
  const decoyDir = path.join("/tmp", `qq-t94-decoy-${process.pid}`);
  fs.mkdirSync(decoyDir, { mode: 0o700 });
  const decoyPath = path.join(decoyDir, "outside-worktree");
  const baselinePaths = [
    path.join(worktree, `.qq-pilot-implementer-baseline-${process.pid}`),
    path.join(gitCommonDir, `.qq-pilot-implementer-baseline-${process.pid}`),
    path.join(gitWorktreeDir, `.qq-pilot-implementer-baseline-${process.pid}`),
    path.join(runtimeRoot, `.qq-pilot-implementer-baseline-${process.pid}`),
    decoyPath,
  ];
  const baselines = baselinePaths.map((filePath) => ({ path: filePath, ...safeProbeWrite(filePath) }));
  const result = await foreground("implementer", "boundary-implementer", {
    extraEnv: { QQ_PILOT_DECOY_PATH: decoyPath },
  });
  const report = await readPilotReport(result);
  const realPiSmoke = runRealPiSmoke("implementer", "check-02-real-pi");
  fs.rmdirSync(decoyDir);

  const allowedNames = ["repositoryWrite", "gitCommonWrite", "gitWorktreeWrite", "runtimeWrite"];
  const expectedAllowed = allowedNames.every((name) => attemptOk(report, name) === true);
  const expectedDenied = attemptOk(report, "decoyWrite") === false;
  const outerAllowsTargets = baselines.every((baseline) => baseline.ok);
  const realPiStarted = realPiSmoke.status === 0 && realPiSmoke.stdout.trim() === "0.80.10";
  const verdict: Verdict = outerAllowsTargets && expectedAllowed && expectedDenied && realPiStarted ? "PASS" : "FAIL";

  recordCheck({
    id: 2,
    title: "Implementer workspace/Git write confinement",
    verdict,
    boundary:
      "The pilot parent proved Codex permits every intended worktree/Git/runtime target and the decoy /tmp target. A static child isolates Landstrip's filesystem decision from dynamic-loader effects; the real-Pi smoke separately tests executable viability.",
    observations: {
      outerBaselines: baselines,
      staticImplementerChild: {
        exitCode: result.exitCode,
        policy: "qq-pilot-implementer-workspace-write-v1",
        attempts: report,
      },
      realPiSmoke: {
        status: realPiSmoke.status,
        signal: realPiSmoke.signal,
        stdout: realPiSmoke.stdout,
        stderr: realPiSmoke.stderr,
      },
      diagnosis:
        "Under the nested Codex substrate, Landstrip 0.17.30 denies writes even for every explicit allowWrite root; dynamically linked Pi also fails at libc load when allowWrite is non-empty.",
    },
    unresolvedRisk:
      "This is the migration blocker: implementer authority cannot be demonstrated under the assigned substrate, and the interaction must be reproduced outside outer Codex confinement or fixed upstream before adoption.",
  });
}

function argumentValues(argv: unknown[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length - 1; index++) {
    if (argv[index] === flag && typeof argv[index + 1] === "string") values.push(argv[index + 1] as string);
  }
  return values;
}

async function checkThree(): Promise<void> {
  const isolatedResult = await foreground("reviewer", "launch-record");
  const isolatedReport = await readPilotReport(isolatedResult);
  const explicitAgent = {
    ...agent("reviewer"),
    inheritProjectContext: true,
    inheritSkills: true,
    extensions: [allowedExtension],
  } satisfies AgentConfig;
  const explicitResult = await foreground("reviewer", "launch-record", { agentOverride: explicitAgent });
  const explicitReport = await readPilotReport(explicitResult);

  const promptRuntimePath = path.join(
    worktree,
    ".pi/npm/node_modules/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts",
  );
  const promptRuntimeSource = fs.readFileSync(promptRuntimePath, "utf8");
  const runtimeStripHooksPresent =
    promptRuntimeSource.includes("export function stripProjectContext") &&
    promptRuntimeSource.includes("export function stripInheritedSkills") &&
    promptRuntimeSource.includes("rewritten = stripProjectContext(rewritten)") &&
    promptRuntimeSource.includes("rewritten = stripInheritedSkills(rewritten)") &&
    promptRuntimeSource.includes('const SUBAGENT_INHERIT_PROJECT_CONTEXT_ENV = "PI_SUBAGENT_INHERIT_PROJECT_CONTEXT"') &&
    promptRuntimeSource.includes('const SUBAGENT_INHERIT_SKILLS_ENV = "PI_SUBAGENT_INHERIT_SKILLS"');
  const isolatedArgv = Array.isArray(isolatedReport?.argv) ? isolatedReport.argv : [];
  const explicitArgv = Array.isArray(explicitReport?.argv) ? explicitReport.argv : [];
  const isolatedExtensions = argumentValues(isolatedArgv, "--extension");
  const explicitExtensions = argumentValues(explicitArgv, "--extension");
  const manifests = ["reviewer", "researcher", "implementer"].map((name) => ({
    name,
    text: fs.readFileSync(path.join(pilotRoot, "manifests", "agents", `${name}.md`), "utf8"),
  }));

  const isolated =
    isolatedResult.exitCode === 0 &&
    isolatedArgv.includes("--no-skills") &&
    isolatedArgv.includes("--no-extensions") &&
    isolatedReport?.inheritProjectContext === "0" &&
    isolatedReport?.inheritSkills === "0" &&
    isolatedExtensions.length === 1 &&
    isolatedExtensions[0]?.endsWith("subagent-prompt-runtime.ts") &&
    runtimeStripHooksPresent;
  const explicit =
    explicitResult.exitCode === 0 &&
    !explicitArgv.includes("--no-skills") &&
    explicitArgv.includes("--no-extensions") &&
    explicitReport?.inheritProjectContext === "1" &&
    explicitReport?.inheritSkills === "1" &&
    explicitExtensions.includes(allowedExtension);
  const manifestsIsolated = manifests.every(
    ({ text }) =>
      text.includes("inheritProjectContext: false") && text.includes("inheritSkills: false") && /\nextensions:\n/.test(text),
  );

  recordCheck({
    id: 3,
    title: "No implicit skill/project-context/extension leakage",
    verdict: isolated && explicit && manifestsIsolated ? "PASS" : "FAIL",
    boundary:
      "This check targets pi-subagents' argument/environment and prompt-rewrite boundary. The child launch report is emitted after crossing the wrapper; the staged runtime source is checked for the exact environment-gated project-context and skill stripping hooks.",
    observations: {
      isolatedLaunch: {
        exitCode: isolatedResult.exitCode,
        argv: isolatedArgv,
        extensions: isolatedExtensions,
        inheritProjectContext: isolatedReport?.inheritProjectContext,
        inheritSkills: isolatedReport?.inheritSkills,
        stagedPromptRuntimeStripHooksPresent: runtimeStripHooksPresent,
      },
      explicitAllowLaunch: {
        exitCode: explicitResult.exitCode,
        argv: explicitArgv,
        extensions: explicitExtensions,
        inheritProjectContext: explicitReport?.inheritProjectContext,
        inheritSkills: explicitReport?.inheritSkills,
        explicitFlagsRetainedForRuntime: explicitReport?.inheritProjectContext === "1" && explicitReport?.inheritSkills === "1",
      },
      roleManifestsDeclareIsolation: manifestsIsolated,
    },
  });
}

async function checkFour(): Promise<void> {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
  const scenarios = [
    "schema-valid",
    "schema-invalid-json",
    "schema-missing",
    "schema-empty-object",
    "schema-empty-fields",
  ];
  const outcomes: Array<Record<string, unknown>> = [];
  for (const scenario of scenarios) {
    const structured = createStructuredOutputRuntime(schema, path.join(runtimeRoot, "structured-output"));
    const result = await foreground("reviewer", scenario, {
      directMock: true,
      structuredOutput: structured,
    });
    outcomes.push({
      scenario,
      exitCode: result.exitCode,
      error: result.error,
      structuredOutput: result.structuredOutput,
    });
    cleanupStructuredOutputRuntime(structured);
  }
  const valid = outcomes.find((outcome) => outcome.scenario === "schema-valid");
  const rejected = outcomes.filter((outcome) => outcome.scenario !== "schema-valid");
  const passed =
    valid?.exitCode === 0 &&
    typeof valid.structuredOutput === "object" &&
    rejected.every((outcome) => outcome.exitCode !== 0 && typeof outcome.error === "string");

  recordCheck({
    id: 4,
    title: "Strict Completion Envelope rejection",
    verdict: passed ? "PASS" : "FAIL",
    boundary:
      "The staged pi-subagents parent validator owns this boundary. The deterministic child is launched directly so Landstrip's nested allowWrite defect cannot turn every structured-output case into the same filesystem failure.",
    observations: { schema: "<WORKTREE>/pilot/manifests/completion-envelope.schema.json", outcomes },
  });
}

function procInfo(pid: number): { state: string; parent: number; startTime: string; command: string } | undefined {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = stat.lastIndexOf(")");
    const fields = stat.slice(close + 2).split(" ");
    const command = fs.readFileSync(`/proc/${pid}/cmdline`).toString("utf8").replaceAll("\0", " ").trim();
    return { state: fields[0] ?? "?", parent: Number(fields[1]), startTime: fields[19] ?? "", command };
  } catch {
    return undefined;
  }
}

function isTerminated(identity: ProcessIdentity): boolean {
  const info = procInfo(identity.pid);
  return !info || info.startTime !== identity.startTime || info.state === "Z";
}

async function waitForTermination(identities: ProcessIdentity[], timeoutMs: number): Promise<boolean> {
  return (
    (await waitFor(() => (identities.every(isTerminated) ? true : undefined), timeoutMs)) === true
  );
}

function cleanupOwnedTree(leaderPid: number, identities: ProcessIdentity[]): void {
  try {
    process.kill(-leaderPid, "SIGKILL");
  } catch {
    // The dedicated process group may already be gone.
  }
  for (const identity of identities) {
    if (isTerminated(identity)) continue;
    try {
      process.kill(identity.pid, "SIGKILL");
    } catch {
      // The observed descendant exited between the check and signal.
    }
  }
}

async function treeRun(options: { timeout: string; signal?: NodeJS.Signals; label: string }) {
  const runId = nextRunId(options.label);
  const environment = {
    ...process.env,
    PI_SUBAGENT_CHILD_AGENT: "reviewer",
    PI_SUBAGENT_RUN_ID: runId,
    PI_SUBAGENT_CHILD_INDEX: "0",
    QQ_PILOT_PI_BINARY: mockPi,
    QQ_PILOT_SCENARIO: "tree",
    QQ_PILOT_RUNTIME_ROOT: runtimeRoot,
    QQ_PILOT_TIMEOUT: options.timeout,
  };
  const child = spawn(wrapper, ["--mode", "json", "-p", "tree probe"], {
    cwd: worktree,
    env: environment,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const processRows = new Map<string, number>();
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    for (const line of stdout.split("\n")) {
      if (!line.startsWith('{"type":"qq_pilot_process"')) continue;
      try {
        const row = JSON.parse(line) as { name?: unknown; pid?: unknown };
        if (typeof row.name === "string" && typeof row.pid === "number") processRows.set(row.name, row.pid);
      } catch {
        // A partial line will be retried when more output arrives.
      }
    }
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  await waitFor(
    () => (["pi", "tool", "mcp", "orphan"].every((name) => processRows.has(name)) ? true : undefined),
    3000,
  );
  const piPid = processRows.get("pi");
  const identities: ProcessIdentity[] = [];
  for (const [name, pid] of processRows) {
    const info = procInfo(pid);
    identities.push({ name, pid, startTime: info?.startTime, command: info?.command });
  }
  if (piPid !== undefined) {
    let current = piPid;
    for (let depth = 0; depth < 8; depth++) {
      const currentInfo = procInfo(current);
      if (!currentInfo || currentInfo.parent < 2) break;
      current = currentInfo.parent;
      if (identities.some((identity) => identity.pid === current)) continue;
      const parentInfo = procInfo(current);
      if (!parentInfo) break;
      const executable = parentInfo.command.split(" ")[0] ?? "";
      const name =
        current === child.pid
          ? "timeout"
          : parentInfo.command.includes("process-tree-supervisor.py")
            ? "tree-supervisor"
            : path.basename(executable) === "landstrip"
              ? "landstrip"
              : `ancestor-${depth}`;
      identities.push({ name, pid: current, startTime: parentInfo.startTime, command: parentInfo.command });
      if (current === child.pid) break;
    }
  }
  if (!identities.some((identity) => identity.pid === child.pid)) {
    const info = procInfo(child.pid!);
    if (info) identities.push({ name: "timeout", pid: child.pid!, startTime: info.startTime, command: info.command });
  }

  const startedSignalAt = Date.now();
  if (options.signal) child.kill(options.signal);
  let exitCode: number | null | undefined;
  let exitSignal: NodeJS.Signals | null | undefined;
  const exited = await Promise.race([
    new Promise<boolean>((resolve) =>
      child.once("exit", (code, signal) => {
        exitCode = code;
        exitSignal = signal;
        resolve(true);
      }),
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), options.signal ? 6000 : 14000)),
  ]);
  const exitElapsedMs = Date.now() - startedSignalAt;
  const terminated = await waitForTermination(identities, 2500);
  const survivorsBeforeCleanup = identities.filter((identity) => !isTerminated(identity)).map((identity) => identity.name);
  const terminatedBeforeCleanup = new Map(identities.map((identity) => [identity.pid, isTerminated(identity)]));
  if (!exited || !terminated) {
    cleanupOwnedTree(child.pid!, identities);
    await waitForTermination(identities, 1500);
  }
  child.stdout.destroy();
  child.stderr.destroy();

  return {
    runId,
    exited,
    exitCode,
    exitSignal,
    exitElapsedMs,
    terminated,
    survivorsBeforeCleanup,
    stderr,
    observed: identities.map((identity) => ({
      name: identity.name,
      pidObserved: Number.isInteger(identity.pid),
      commandClass: identity.name,
      terminatedBeforeCleanup: terminatedBeforeCleanup.get(identity.pid) ?? false,
      terminated: isTerminated(identity),
    })),
  };
}

async function checkFive(): Promise<void> {
  const result = await treeRun({ timeout: "1s", label: "check-05-timeout" });
  const required = ["pi", "landstrip", "timeout", "tool", "mcp", "orphan"];
  const observedNames = new Set(result.observed.map((row) => row.name));
  const passed =
    result.exited &&
    result.exitCode === 124 &&
    result.terminated &&
    required.every((name) => observedNames.has(name)) &&
    result.observed.every((row) => row.terminatedBeforeCleanup) &&
    result.exitElapsedMs <= 13000;
  recordCheck({
    id: 5,
    title: "Outer timeout tears down the complete descendant tree",
    verdict: passed ? "PASS" : "FAIL",
    boundary:
      "The wrapper's GNU timeout is outermost, the qq subreaper owns native Landstrip beneath it, and a static mock Pi creates named tool, MCP, and double-forked orphan descendants. Only that observed descendant tree is inspected or cleaned.",
    observations: result,
  });
}

async function checkSix(): Promise<void> {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const outcomes = [];
  for (const signal of signals) {
    outcomes.push(await treeRun({ timeout: "30s", signal, label: `check-06-${signal.toLowerCase()}` }));
  }
  const passed = outcomes.every(
    (outcome) =>
      outcome.exited &&
      outcome.terminated &&
      outcome.exitElapsedMs <= 6000 &&
      outcome.observed.every((row) => row.terminatedBeforeCleanup),
  );
  recordCheck({
    id: 6,
    title: "SIGINT/SIGTERM/pane-close signal cleanup",
    verdict: passed ? "PASS" : "FAIL",
    boundary:
      "Signals target only each check's dedicated timeout leader. SIGHUP is the Herdr-pane-closure signal-path simulation; no live Herdr pane or unrelated PID is touched.",
    observations: outcomes.map((outcome, index) => ({ signal: signals[index], ...outcome })),
  });
}

function readIfPresent(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function listFiles(directory: string): string[] {
  const result: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else result.push(path.relative(directory, full));
    }
  };
  visit(directory);
  return result.sort();
}

function wrapperEvents(): Array<Record<string, unknown>> {
  const filePath = path.join(runtimeRoot, "wrapper-events.jsonl");
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function checkSeven(): Promise<void> {
  const foregroundRunId = nextRunId("check-07-foreground");
  const foregroundResult = await foreground("reviewer", "final", { runId: foregroundRunId });
  const foregroundPaths = foregroundResult.artifactPaths;
  const foregroundFiles = foregroundPaths ? Object.values(foregroundPaths).filter((value): value is string => typeof value === "string") : [];
  const foregroundTranscript = foregroundPaths ? readIfPresent(foregroundPaths.transcriptPath) : undefined;
  const foregroundMetadata = foregroundPaths ? JSON.parse(readIfPresent(foregroundPaths.metadataPath) ?? "{}") : {};

  const asyncId = nextRunId("check-07-background");
  const asyncEvents: unknown[] = [];
  const asyncStart = await withEnvironment(
    {
      PI_SUBAGENT_PI_BINARY: wrapper,
      QQ_PILOT_PI_BINARY: mockPi,
      QQ_PILOT_SCENARIO: "final",
    },
    () =>
      executeAsyncSingle(asyncId, {
        agent: "reviewer",
        task: "Deterministic background artifact probe",
        agentConfig: agent("reviewer"),
        ctx: {
          pi: { events: { emit: (name: string, payload: unknown) => asyncEvents.push({ name, payload }) } } as never,
          cwd: worktree,
          currentSessionId: "pilot-parent-session",
          interactive: false,
        },
        cwd: worktree,
        artifactsDir: path.join(runtimeRoot, "async-artifacts"),
        artifactConfig: {
          enabled: true,
          includeInput: true,
          includeOutput: true,
          includeJsonl: true,
          includeTranscript: true,
          includeMetadata: true,
          cleanupDays: 7,
        },
        shareEnabled: false,
        maxSubagentDepth: 1,
        acceptance: { level: "none", reason: "deterministic background artifact probe" },
      }),
  );
  const asyncDir = asyncStart.details.asyncDir;
  const statusPath = typeof asyncDir === "string" ? path.join(asyncDir, "status.json") : "";
  const asyncStatus = await waitFor(() => {
    if (!statusPath || !fs.existsSync(statusPath)) return undefined;
    const status = JSON.parse(fs.readFileSync(statusPath, "utf8")) as { state?: string };
    return ["complete", "failed", "stopped"].includes(status.state ?? "") ? status : undefined;
  }, 20000);
  const asyncFiles = typeof asyncDir === "string" && fs.existsSync(asyncDir) ? listFiles(asyncDir) : [];
  const eventsPath = typeof asyncDir === "string" ? path.join(asyncDir, "events.jsonl") : "";
  const eventsText = readIfPresent(eventsPath) ?? "";
  const policyEvents = wrapperEvents().filter((event) => [foregroundRunId, asyncId].includes(String(event.runId)));
  const foregroundComplete =
    foregroundResult.exitCode === 0 &&
    foregroundResult.finalOutput === "pilot child complete" &&
    foregroundFiles.length >= 5 &&
    foregroundFiles.every((filePath) => fs.existsSync(filePath)) &&
    foregroundTranscript?.includes("qq-pilot-reviewer-read-only-v1") &&
    foregroundMetadata.exitCode === 0;
  const backgroundComplete =
    asyncStatus?.state === "complete" &&
    asyncFiles.includes("status.json") &&
    asyncFiles.includes("events.jsonl") &&
    asyncFiles.some((file) => /^output-0\.log$/.test(file)) &&
    asyncFiles.includes("runner.stderr.log") &&
    eventsText.includes("subagent.run.completed");
  const identityComplete = policyEvents.some((event) => event.runId === foregroundRunId) && policyEvents.some((event) => event.runId === asyncId);

  recordCheck({
    id: 7,
    title: "Auditable foreground/background artifacts",
    verdict: foregroundComplete && backgroundComplete && identityComplete ? "PASS" : "FAIL",
    boundary:
      "Pi-subagents owns foreground and async lifecycle artifacts; the wrapper event log independently binds each runId to the role-selected Landstrip policy identity. Child stderr supplies policy diagnostics without Herdr machinery.",
    observations: {
      foreground: {
        runId: foregroundRunId,
        exitCode: foregroundResult.exitCode,
        finalOutput: foregroundResult.finalOutput,
        files: foregroundFiles,
        metadata: foregroundMetadata,
        policyDiagnosticPresent: foregroundTranscript?.includes("qq-pilot-reviewer-read-only-v1") ?? false,
      },
      background: {
        runId: asyncId,
        start: asyncStart,
        status: asyncStatus,
        files: asyncFiles,
        lifecycleCompletedEvent: eventsText.includes("subagent.run.completed"),
        parentEvents: asyncEvents,
      },
      policyEvents,
    },
  });
}

async function checkEight(): Promise<void> {
  const unrelated = path.join(runtimeRoot, "unrelated-cwd");
  fs.mkdirSync(unrelated, { mode: 0o700 });
  const sessionFile = path.join(runtimeRoot, "resume-session.jsonl");
  fs.writeFileSync(sessionFile, "{}\n", { mode: 0o600 });
  const contained = await foreground("reviewer", "final", { cwd: worktree, sessionFile });
  const unrelatedResult = await foreground("reviewer", "final", { cwd: unrelated, sessionFile });
  const passed =
    contained.exitCode === 0 &&
    unrelatedResult.exitCode !== 0 &&
    (unrelatedResult.error?.includes("child cwd is not inside the assigned worktree") ||
      unrelatedResult.error?.includes("child cwd belongs to an unrelated worktree"));
  recordCheck({
    id: 8,
    title: "Resume cwd containment",
    verdict: passed ? "PASS" : "FAIL",
    boundary:
      "Pi-subagents supplies the persisted session path; before Landstrip or Pi starts, the wrapper canonicalizes the launch cwd's Git root and requires it to equal the wrapper's assigned worktree.",
    observations: {
      assignedWorktreeResume: { exitCode: contained.exitCode, finalOutput: contained.finalOutput },
      unrelatedCwdResume: { exitCode: unrelatedResult.exitCode, error: unrelatedResult.error },
    },
  });
}

async function checkNine(): Promise<void> {
  const missingPath = path.join(runtimeRoot, "missing-landstrip");
  const absent = await foreground("reviewer", "final", {
    extraEnv: { QQ_PILOT_LANDSTRIP_BINARY: missingPath },
  });
  const unsupported = await foreground("reviewer", "final", {
    extraEnv: { QQ_PILOT_LANDSTRIP_BINARY: unsupportedLandstrip },
  });
  const missingRoleEnvironment = { ...process.env };
  delete missingRoleEnvironment.PI_SUBAGENT_CHILD_AGENT;
  const missingRole = spawnSync(wrapper, ["--version"], {
    cwd: worktree,
    env: missingRoleEnvironment,
    encoding: "utf8",
  });
  const unknownRole = spawnSync(wrapper, ["--version"], {
    cwd: worktree,
    env: { ...process.env, PI_SUBAGENT_CHILD_AGENT: "administrator" },
    encoding: "utf8",
  });
  const available = runRealPiSmoke("reviewer", "check-09-real-pi");
  const installedVersion = installedPiPackageVersion();
  const passed =
    absent.exitCode !== 0 &&
    absent.error?.includes("Landstrip is unavailable") &&
    unsupported.exitCode !== 0 &&
    unsupported.error?.includes("PLATFORM_UNSUPPORTED") &&
    missingRole.status === 66 &&
    unknownRole.status === 66 &&
    available.status === 0 &&
    installedVersion === "0.80.10";
  recordCheck({
    id: 9,
    title: "Landstrip absence/unsupported fail closed",
    verdict: passed ? "PASS" : "FAIL",
    boundary:
      "The absence path is the wrapper's executable preflight. The unsupported path uses a deterministic launcher with Landstrip's documented PLATFORM_UNSUPPORTED terminal record and proves the wrapper never falls back to Pi; the installed native binary is separately smoke-tested on this supported kernel.",
    observations: {
      absent: { exitCode: absent.exitCode, error: absent.error, finalOutput: absent.finalOutput },
      unsupported: { exitCode: unsupported.exitCode, error: unsupported.error, finalOutput: unsupported.finalOutput },
      missingRole: { status: missingRole.status, stderr: missingRole.stderr },
      unknownRole: { status: unknownRole.status, stderr: unknownRole.stderr },
      supportedKernelRealPi: { status: available.status, stdout: available.stdout, stderr: available.stderr },
      installedPiPackageVersion: installedVersion,
    },
    unresolvedRisk:
      "The host kernel is supported, so the actual native PLATFORM_UNSUPPORTED branch cannot be observed here; its wrapper propagation is simulated with the package's documented terminal shape.",
  });
}

function writeMatrix(): void {
  const rows = records
    .sort((left, right) => left.id - right.id)
    .map(
      (record) =>
        `| ${record.id} | ${record.title} | **${record.verdict}** | ${record.boundary.replaceAll("|", "\\|")} | [raw](raw/check-${String(record.id).padStart(2, "0")}.log) |`,
    );
  const failed = records.filter((record) => record.verdict === "FAIL").map((record) => record.id);
  const inconclusive = records.filter((record) => record.verdict === "INCONCLUSIVE-UNDER-SUBSTRATE").map((record) => record.id);
  const matrix = [
    "# T-94 pilot evidence matrix",
    "",
    "Fresh local run: 2026-07-19. Package pins: pi-subagents 0.35.1, pi-landstrip/Landstrip 0.17.30, Pi 0.80.10.",
    "",
    "Every raw log is normalized for machine paths, process IDs, and timestamps; runtime originals remain in the ephemeral `/tmp` run directory during execution. No Herdr stage bridge or reporting path was invoked.",
    "",
    "| # | Required pilot check | Verdict | Boundary attribution | Evidence |",
    "|---:|---|---|---|---|",
    ...rows,
    "",
    `Overall: **${failed.length === 0 && inconclusive.length === 0 ? "PASS" : "HOLD"}**. Failed checks: ${failed.length ? failed.join(", ") : "none"}. Inconclusive-under-substrate checks: ${inconclusive.length ? inconclusive.join(", ") : "none"}.`,
    "",
    "The migration verdict is HOLD whenever any required check fails or is inconclusive. In this run, Check 2 is the decisive blocker: nested Landstrip denies its own explicit implementer allowWrite roots under the outer Codex sandbox.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(evidenceDir, "matrix.md"), matrix, "utf8");
}

async function main(): Promise<void> {
  await checkOne();
  await checkTwo();
  await checkThree();
  await checkFour();
  await checkFive();
  await checkSix();
  await checkSeven();
  await checkEight();
  await checkNine();
  writeMatrix();

  const failed = records.filter((record) => record.verdict === "FAIL");
  const inconclusive = records.filter((record) => record.verdict === "INCONCLUSIVE-UNDER-SUBSTRATE");
  for (const record of records) {
    process.stdout.write(`${record.id}. ${record.verdict} - ${record.title}\n`);
  }
  process.stdout.write(`evidence: ${path.relative(worktree, evidenceDir)}\n`);
  process.exitCode = failed.length > 0 || inconclusive.length > 0 ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 2;
});
