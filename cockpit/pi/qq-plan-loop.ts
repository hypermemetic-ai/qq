import { execFile, execFileSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, parse, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PLANNING_WRITE_REASON =
  "plan-loop: planning phase — writes limited to .pi/plans/";
const PLANNING_BASH_REASON =
  "plan-loop: planning phase — bash is disabled; use read, grep, find, ls, or fff tools";
// Review convergence circuit-breaker (rounds 1–3): argument-level vetting of
// an allowlist kept producing new writers (sort -o, git branch, find -delete,
// date -s, uniq OUTPUT, git diff/log/show --output, file -C, git status index
// refresh, printf -v). The invariant moved to a stronger layer: NO bash at
// all during planning. Exploration uses pi's builtin read-only tools and the
// fff search tools, so there is no command surface left to vet.
const BASE_ALLOWED_TOOLS = new Set(["read", "bash", "grep", "find", "ls"]);
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const ROUND_FILE = /^round-(\d+)\.md$/;
const COMMAND_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 30 * 60 * 1_000;

function resolvePiPath(cwd, rawPath) {
  let normalized = rawPath.replace(UNICODE_SPACES, " ");
  if (normalized.startsWith("@")) {
    normalized = normalized.slice(1);
  }
  if (normalized === "~") {
    normalized = homedir();
  } else if (
    normalized.startsWith("~/") ||
    (process.platform === "win32" && normalized.startsWith("~\\"))
  ) {
    normalized = join(homedir(), normalized.slice(2));
  } else if (/^file:\/\//.test(normalized)) {
    normalized = fileURLToPath(normalized);
  }
  return resolve(cwd, normalized);
}

function checkoutRoot(cwd) {
  try {
    const root = execFileSync(
      "git",
      ["-C", cwd, "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return root === "" ? undefined : resolve(root);
  } catch {
    return undefined;
  }
}

function isWithin(root, target) {
  return target === root || target.startsWith(`${root}${sep}`);
}

// Review round 1 (finding 2): lexical `resolve` is not containment. A symlink
// inside .pi/plans could escape the gate, so containment is decided on
// realpaths — the plans root's realpath against the realpath of the target's
// nearest existing ancestor (the target file itself may not exist yet).
async function nearestExistingRealpath(target) {
  let cursor = target;
  const tail = [];
  for (;;) {
    try {
      const real = await realpath(cursor);
      let rebuilt = real;
      for (let i = tail.length - 1; i >= 0; i -= 1) {
        rebuilt = join(rebuilt, tail[i]);
      }
      return rebuilt;
    } catch {
      // realpath fails both for simply-absent components (walk up) and for
      // dangling symlinks (a symlink whose target does not exist). lstat
      // distinguishes them: a component that exists as a link but cannot be
      // resolved is refused outright — containment is undecidable there.
      let componentExists = false;
      try {
        await lstat(cursor);
        componentExists = true;
      } catch {
        componentExists = false;
      }
      if (componentExists) {
        throw new Error("plan-loop: plan path contains an unresolvable link");
      }
      const parent = parse(cursor).dir;
      if (parent === cursor) {
        throw new Error("plan-loop: could not resolve plan path target");
      }
      tail.push(parse(cursor).base);
      cursor = parent;
    }
  }
}

export async function gateToolCall(event, ctx, phase) {
  if (phase !== "planning") {
    return undefined;
  }

  if (event.toolName === "write" || event.toolName === "edit") {
    const root = checkoutRoot(ctx.cwd);
    const rawPath = event.input?.path;
    if (root === undefined || typeof rawPath !== "string" || rawPath === "") {
      return { block: true, reason: PLANNING_WRITE_REASON };
    }

    try {
      const plansRoot = resolve(root, ".pi/plans");
      const realPlans = await realpath(plansRoot);
      const target = resolvePiPath(ctx.cwd, rawPath);
      const realTarget = await nearestExistingRealpath(target);
      if (isWithin(realPlans, realTarget)) {
        return undefined;
      }
    } catch {
      // Unresolvable or symlink-escaping paths are refused, never rewritten.
    }
    return { block: true, reason: PLANNING_WRITE_REASON };
  }

  if (event.toolName === "bash") {
    return { block: true, reason: PLANNING_BASH_REASON };
  }

  if (
    BASE_ALLOWED_TOOLS.has(event.toolName) ||
    event.toolName === "ask_user_question" ||
    event.toolName === "plan_loop_submit" ||
    event.toolName === "fffind" ||
    event.toolName === "ffgrep" ||
    event.toolName === "fff-multi-grep" ||
    event.toolName?.startsWith("hunk")
  ) {
    return undefined;
  }

  return {
    block: true,
    reason: `plan-loop: planning phase — tool is not allowed: ${event.toolName}`,
  };
}

async function canonicalPath(path, description) {
  try {
    return await realpath(path);
  } catch {
    throw new Error(`plan-loop: ${description} does not exist`);
  }
}

async function listRoundFiles(roundsPath) {
  const entries = await readdir(roundsPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && ROUND_FILE.test(entry.name))
    .map((entry) => entry.name);
}

export async function snapshotPlan(root, rawPath, cwd = root) {
  if (
    typeof root !== "string" ||
    root === "" ||
    typeof rawPath !== "string" ||
    rawPath === "" ||
    typeof cwd !== "string" ||
    cwd === ""
  ) {
    throw new Error("plan-loop: a non-empty plan path is required");
  }

  const resolvedRoot = resolve(root);
  const plansRoot = resolve(resolvedRoot, ".pi/plans");
  let planPath;
  try {
    planPath = resolvePiPath(cwd, rawPath);
  } catch {
    throw new Error("plan-loop: plan path is invalid");
  }
  if (!isWithin(plansRoot, planPath)) {
    throw new Error("plan-loop: plan path must resolve under .pi/plans/");
  }

  let planStat;
  try {
    planStat = await stat(planPath);
  } catch {
    throw new Error("plan-loop: plan path does not exist");
  }
  if (!planStat.isFile()) {
    throw new Error("plan-loop: plan path must name a file");
  }

  const canonicalRoot = await canonicalPath(resolvedRoot, "checkout root");
  const canonicalPlansRoot = await canonicalPath(plansRoot, ".pi/plans directory");
  const canonicalPlan = await canonicalPath(planPath, "plan path");
  if (
    !isWithin(canonicalRoot, canonicalPlansRoot) ||
    !isWithin(canonicalPlansRoot, canonicalPlan)
  ) {
    throw new Error("plan-loop: plan path escapes .pi/plans/");
  }

  const planName = parse(planPath).name;
  if (planName === "" || planName === "." || planName === "..") {
    throw new Error("plan-loop: plan filename cannot identify a round directory");
  }

  const roundsRoot = join(plansRoot, "rounds");
  const planRoundsRoot = join(roundsRoot, planName);
  await mkdir(planRoundsRoot, { recursive: true });

  const canonicalRoundsRoot = await canonicalPath(roundsRoot, "rounds directory");
  const canonicalPlanRoundsRoot = await canonicalPath(
    planRoundsRoot,
    "plan rounds directory",
  );
  if (
    !isWithin(canonicalPlansRoot, canonicalRoundsRoot) ||
    !isWithin(canonicalRoundsRoot, canonicalPlanRoundsRoot)
  ) {
    throw new Error("plan-loop: round directory escapes .pi/plans/");
  }

  let roundFiles = await listRoundFiles(planRoundsRoot);
  const baselinePath = join(planRoundsRoot, "round-0.md");
  if (roundFiles.length === 0) {
    try {
      await writeFile(baselinePath, "", { flag: "wx" });
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
    }
    roundFiles = await listRoundFiles(planRoundsRoot);
  }

  if (!roundFiles.includes("round-0.md")) {
    throw new Error("plan-loop: existing rounds are missing round-0.md");
  }
  const baselineStat = await stat(baselinePath);
  if (!baselineStat.isFile() || baselineStat.size !== 0) {
    throw new Error("plan-loop: round-0.md must remain an empty baseline");
  }

  const round = roundFiles.length;
  for (let number = 0; number < round; number += 1) {
    if (!roundFiles.includes(`round-${number}.md`)) {
      throw new Error("plan-loop: existing round sequence is not contiguous");
    }
  }

  const snapshotPath = join(planRoundsRoot, `round-${round}.md`);
  const previousPath = join(planRoundsRoot, `round-${round - 1}.md`);
  try {
    await copyFile(canonicalPlan, snapshotPath, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`plan-loop: round-${round}.md already exists`);
    }
    throw error;
  }

  return { round, previousPath, snapshotPath };
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function hunkDiffCommand(previousPath, snapshotPath) {
  return `hunk diff ${shellQuote(previousPath)} ${shellQuote(snapshotPath)}`;
}

async function runCommand(command, args, cwd, signal) {
  return execFileAsync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    signal,
    timeout: COMMAND_TIMEOUT_MS,
  });
}

async function launchReview(root, round, previousPath, snapshotPath, ctx, signal) {
  const command = hunkDiffCommand(previousPath, snapshotPath);
  try {
    const tabResult = await runCommand(
      "herdr",
      [
        "tab",
        "create",
        "--cwd",
        root,
        "--label",
        `plan review round ${round}`,
        "--no-focus",
        "--json",
      ],
      root,
      signal,
    );
    const response = JSON.parse(tabResult.stdout);
    const paneId = response?.result?.root_pane?.pane_id;
    if (typeof paneId !== "string" && typeof paneId !== "number") {
      throw new Error("herdr response did not include a root pane id");
    }
    await runCommand(
      "herdr",
      ["pane", "run", String(paneId), command],
      root,
      signal,
    );
    return { command, launched: true };
  } catch {
    if (ctx.hasUI) {
      ctx.ui.notify(command, "warning");
    }
    return { command, launched: false };
  }
}

function collectStrings(value, strings = []) {
  if (typeof value === "string") {
    strings.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, strings);
    }
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStrings(item, strings);
    }
  }
  return strings;
}

function directSessionId(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  for (const key of ["id", "session_id", "sessionId", "sessionID"]) {
    if (typeof value[key] === "string" || typeof value[key] === "number") {
      return String(value[key]);
    }
  }
  return undefined;
}

function sessionRecords(value) {
  const records = [];
  const seen = new Set();

  function visit(candidate) {
    if (candidate === null || typeof candidate !== "object") {
      return;
    }
    if (!seen.has(candidate) && directSessionId(candidate) !== undefined) {
      seen.add(candidate);
      records.push(candidate);
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item);
      }
    } else {
      for (const item of Object.values(candidate)) {
        visit(item);
      }
    }
  }

  visit(value);
  return records;
}

function normalizeListedPath(root, value) {
  try {
    if (/^file:\/\//.test(value)) {
      return resolve(fileURLToPath(value));
    }
    return resolve(root, value);
  } catch {
    return undefined;
  }
}

function findMatchingSession(value, root, previousPath, snapshotPath) {
  const expectedPrevious = resolve(previousPath);
  const expectedSnapshot = resolve(snapshotPath);
  for (const record of sessionRecords(value)) {
    const paths = collectStrings(record).map((item) =>
      normalizeListedPath(root, item),
    );
    if (paths.includes(expectedPrevious) && paths.includes(expectedSnapshot)) {
      return { id: directSessionId(record), record };
    }
  }
  return undefined;
}

function findSessionById(value, id) {
  return sessionRecords(value).find((record) => directSessionId(record) === id);
}

function parseJsonOutput(output) {
  const trimmed = output.trim();
  if (trimmed === "") {
    throw new Error("empty JSON output");
  }
  return JSON.parse(trimmed);
}

async function readComments(root, sessionId, signal) {
  try {
    const result = await runCommand(
      "hunk",
      ["session", "comment", "list", sessionId, "--type", "all", "--json"],
      root,
      signal,
    );
    parseJsonOutput(result.stdout);
    return result.stdout;
  } catch {
    const result = await runCommand(
      "hunk",
      ["session", "comment", "list", sessionId, "--type", "all"],
      root,
      signal,
    );
    return result.stdout;
  }
}

function wait(milliseconds, signal) {
  return new Promise((resolveWait, rejectWait) => {
    if (signal?.aborted) {
      const error = new Error("plan-loop: review polling aborted");
      error.name = "AbortError";
      rejectWait(error);
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolveWait();
    }, milliseconds);
    function onAbort() {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      const error = new Error("plan-loop: review polling aborted");
      error.name = "AbortError";
      rejectWait(error);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function pollForReview(root, previousPath, snapshotPath, signal) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let sessionId;
  let lastComments = "";
  let lastCommentsAt;

  while (Date.now() < deadline) {
    let sessions;
    try {
      const result = await runCommand(
        "hunk",
        ["session", "list", "--json"],
        root,
        signal,
      );
      sessions = parseJsonOutput(result.stdout);
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      await wait(Math.min(POLL_INTERVAL_MS, deadline - Date.now()), signal);
      continue;
    }

    let record;
    if (sessionId === undefined) {
      const match = findMatchingSession(
        sessions,
        root,
        previousPath,
        snapshotPath,
      );
      if (match !== undefined) {
        sessionId = match.id;
        record = match.record;
      }
    } else {
      record = findSessionById(sessions, sessionId);
      if (record === undefined) {
        // The operator quit hunk. Review round 1 (finding 3): a note added in
        // the final poll window could be missed, so attempt one last read
        // before settling for the previous snapshot. The final-read catch
        // must not swallow cancellation. Residual: hunk keeps comments only
        // in the live daemon, so a final-note loss remains possible until
        // hunk grows an export-on-quit; the decision text tells the operator
        // how to re-state a missing note. capturedAt always carries the TRUE
        // time of the comments being returned, never the return time.
        try {
          const finalComments = await readComments(root, sessionId, signal);
          lastComments = finalComments;
          lastCommentsAt = new Date().toISOString();
        } catch (error) {
          if (signal?.aborted) {
            throw error;
          }
          // session is gone; keep the previous snapshot and its true timestamp
        }
        return {
          comments: lastComments,
          timedOut: false,
          capturedAt: lastCommentsAt,
        };
      }
    }

    if (sessionId !== undefined && record !== undefined) {
      try {
        lastComments = await readComments(root, sessionId, signal);
        lastCommentsAt = new Date().toISOString();
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
      }
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await wait(Math.min(POLL_INTERVAL_MS, remaining), signal);
    }
  }

  return { comments: lastComments, timedOut: true };
}

function toolResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

export default function (pi) {
  // v1 limitation: phase and round state live only in this extension process.
  let phase = "idle";
  let roundState = { planPath: undefined, round: 0 };

  function setPhase(nextPhase, ctx) {
    phase = nextPhase;
    if (ctx.hasUI) {
      ctx.ui.setStatus(
        "plan-loop",
        phase === "planning" ? "⏸ plan-loop" : undefined,
      );
    }
  }

  pi.registerCommand("plan-loop", {
    description: "Toggle the plan/review loop",
    handler: async (_args, ctx) => {
      if (phase === "idle") {
        roundState = { planPath: undefined, round: 0 };
        // The write gate refuses while the plans root is unresolvable, so the
        // plans home must exist (and be realpath-able) before planning starts.
        const root = checkoutRoot(ctx.cwd);
        if (root !== undefined) {
          await mkdir(resolve(root, ".pi/plans"), { recursive: true });
        }
        setPhase("planning", ctx);
      } else {
        roundState = { planPath: undefined, round: 0 };
        setPhase("idle", ctx);
      }
    },
  });

  pi.on("tool_call", (event, ctx) => gateToolCall(event, ctx, phase));

  pi.registerTool({
    name: "plan_loop_submit",
    label: "Submit Plan for Review",
    description:
      "Call plan_loop_submit when the plan file is complete and ready for human review.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the completed plan file under .pi/plans/",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    executionMode: "sequential",

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (phase !== "planning") {
        throw new Error(
          "plan-loop: plan_loop_submit is available only in the planning phase",
        );
      }

      const root = checkoutRoot(ctx.cwd);
      if (root === undefined) {
        throw new Error("plan-loop: could not resolve the checkout root");
      }

      const snapshot = await snapshotPlan(root, params.path, ctx.cwd);
      roundState = {
        planPath: resolvePiPath(ctx.cwd, params.path),
        round: snapshot.round,
      };
      const launch = await launchReview(
        root,
        snapshot.round,
        snapshot.previousPath,
        snapshot.snapshotPath,
        ctx,
        signal,
      );

      if (!launch.launched && (ctx.mode !== "tui" || !ctx.hasUI)) {
        return toolResult({
          round: roundState.round,
          comments: "",
          decision:
            `No decision recorded outside TUI. Run ${launch.command} manually, ` +
            "then reopen the session in TUI and resubmit for operator review.",
        });
      }

      const review = await pollForReview(
        root,
        snapshot.previousPath,
        snapshot.snapshotPath,
        signal,
      );
      if (review.timedOut) {
        return toolResult({
          round: roundState.round,
          comments: review.comments,
          decision:
            `Review polling timed out after 30 minutes. Continue with ${launch.command}; ` +
            "remain in planning until the operator completes review.",
        });
      }

      if (ctx.mode !== "tui" || !ctx.hasUI) {
        return toolResult({
          round: roundState.round,
          comments: review.comments,
          decision:
            "No decision recorded outside TUI. Reopen the session in TUI and " +
            "resubmit for an explicit operator decision; do not execute yet.",
        });
      }

      const choice = await ctx.ui.select("Plan review complete. Choose the next phase:", [
        "Approve plan",
        "Request changes",
        "Abandon plan-loop",
      ]);

      if (choice === "Approve plan") {
        setPhase("executing", ctx);
        return toolResult({
          round: roundState.round,
          comments: review.comments,
          decision:
            "The plan is approved for execution; plan-loop is now in the executing phase.",
        });
      }
      if (choice === "Abandon plan-loop") {
        roundState = { planPath: undefined, round: 0 };
        setPhase("idle", ctx);
        return toolResult({
          round: snapshot.round,
          comments: review.comments,
          decision: "Plan-loop abandoned; phase returned to idle.",
        });
      }
      if (choice === "Request changes") {
        return toolResult({
          round: roundState.round,
          comments: review.comments,
          commentsCapturedAt: review.capturedAt,
          decision:
            "Changes requested. Apply the review comments verbatim, revise the plan, " +
            "then call plan_loop_submit again. Comments were captured when the review " +
            "session closed; if the operator added a note in the final moment before " +
            "exiting hunk, it may be missing — they can re-state it in chat.",
        });
      }

      return toolResult({
        round: roundState.round,
        comments: review.comments,
        decision:
          "No decision recorded; remain in planning and resubmit for an explicit operator decision.",
      });
    },
  });
}
