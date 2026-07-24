// @ts-nocheck

import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

const OBSERVE_COMMAND = "bin/qq-observe";
const VERDICTS = ["accepted", "rejected", "reshaped", "skip"];

function executionReason(execution, fallback) {
  return execution?.stderr?.trim() || execution?.stdout?.trim() || fallback;
}

function notifyNeedsUi(ctx) {
  ctx.ui.notify(
    "The architect flow needs an interactive Pi session.",
    "warning",
  );
}

function parseRounds(stdout) {
  if (typeof stdout !== "string" || stdout.trim() === "") {
    throw new Error("empty output");
  }
  const rows = JSON.parse(stdout);
  if (!Array.isArray(rows)) throw new Error("top level is not an array");

  return rows.map((row) => {
    if (
      row === null ||
      typeof row !== "object" ||
      !Number.isInteger(row.pr) ||
      row.pr <= 0 ||
      (row.variant !== "guided" && row.variant !== "blind") ||
      typeof row.analyzed !== "boolean" ||
      typeof row.failed !== "boolean" ||
      row.analyzed && row.failed ||
      typeof row.discussed !== "boolean" ||
      typeof row.ts !== "string" ||
      row.ts.length === 0
    ) {
      throw new Error("round row has the wrong shape");
    }
    return row;
  });
}

function observerRunsRoot(override) {
  if (override !== undefined) return override;
  const stateHome = process.env.XDG_STATE_HOME;
  if (stateHome !== undefined) {
    if (!isAbsolute(stateHome)) {
      throw new Error("XDG_STATE_HOME is not absolute");
    }
    return join(stateHome, "qq", "observer", "runs");
  }
  return join(homedir(), ".local", "state", "qq", "observer", "runs");
}

function roundDirectory(runsRoot, row) {
  const suffix = row.variant === "blind" ? "-blind" : "";
  return join(runsRoot, `pr-${row.pr}${suffix}`);
}

function roundLabel(row) {
  const status = row.failed ? "failed" : "analyzed";
  const discussed = row.discussed ? " discussed" : "";
  return `pr-${row.pr} [${row.variant}] — ${status}${discussed} ${row.ts}`;
}

async function isRegularFile(path, inspect) {
  try {
    return (await inspect(path)).isFile();
  } catch {
    return false;
  }
}

function parseAnalysis(raw) {
  const analysis = JSON.parse(raw);
  if (analysis === null || typeof analysis !== "object" || !Array.isArray(analysis.episodes)) {
    throw new Error("analysis does not contain an episodes array");
  }
  const seen = new Set();
  for (const episode of analysis.episodes) {
    if (
      episode === null ||
      typeof episode !== "object" ||
      !Number.isInteger(episode.rank) ||
      episode.rank <= 0 ||
      typeof episode.kind !== "string" ||
      episode.kind.length === 0 ||
      typeof episode.title !== "string" ||
      episode.title.length === 0 ||
      typeof episode.recurrence_key !== "string" ||
      episode.recurrence_key.length === 0 ||
      seen.has(episode.recurrence_key)
    ) {
      throw new Error("analysis episode has the wrong shape");
    }
    seen.add(episode.recurrence_key);
  }
  return analysis;
}

export default function register(pi, deps = {}) {
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  const loadFile = deps.readFile ?? readFile;
  const inspectFile = deps.stat ?? stat;
  const makeTemp = deps.mkdtemp ?? mkdtemp;
  const saveFile = deps.writeFile ?? writeFile;
  const setMode = deps.chmod ?? chmod;
  const remove = deps.rm ?? rm;

  async function readRounds(ctx) {
    let execution;
    try {
      execution = await run(OBSERVE_COMMAND, ["rounds"], { cwd: ctx.cwd });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Cannot load observer rounds: ${reason}`, "error");
      return undefined;
    }
    if (execution?.killed || execution?.code !== 0) {
      ctx.ui.notify(
        `Cannot load observer rounds: ${executionReason(execution, "qq-observe rounds failed")}`,
        "error",
      );
      return undefined;
    }
    try {
      return parseRounds(execution.stdout);
    } catch {
      ctx.ui.notify(
        "Cannot load observer rounds: qq-observe rounds returned unreadable JSON.",
        "error",
      );
      return undefined;
    }
  }

  pi.registerCommand("architect", {
    description: "Select an observer round and begin an architect-style discussion.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        notifyNeedsUi(ctx);
        return;
      }

      const rows = await readRounds(ctx);
      if (rows === undefined) return;
      const finalized = rows
        .filter((row) => row.analyzed || row.failed)
        .map((row, index) => ({ row, index }))
        .sort(
          (left, right) =>
            Number(left.row.discussed) - Number(right.row.discussed) ||
            right.row.ts.localeCompare(left.row.ts) ||
            left.index - right.index,
        );
      if (finalized.length === 0) {
        ctx.ui.notify("No finalized observer rounds are available.", "info");
        return;
      }

      const choices = finalized.map(({ row }) => roundLabel(row));
      const selected = await ctx.ui.select("Select an observer round", choices);
      if (selected === undefined) return;
      const position = choices.indexOf(selected);
      if (position < 0) {
        ctx.ui.notify("The selected observer round could not be identified.", "error");
        return;
      }

      let runsRoot;
      try {
        runsRoot = observerRunsRoot(deps.runsRoot);
      } catch (error) {
        ctx.ui.notify(
          `Cannot locate observer rounds: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
        return;
      }
      const row = finalized[position].row;
      const runDir = roundDirectory(runsRoot, row);
      const tracePath = join(runDir, "analyst-trace.jsonl");
      const traceText = (await isRegularFile(tracePath, inspectFile))
        ? tracePath
        : "not present";

      if (row.failed) {
        const failurePath = join(runDir, "analysis_failed.json");
        let failure;
        try {
          failure = JSON.parse(await loadFile(failurePath, "utf8"));
        } catch (error) {
          ctx.ui.notify(
            `Cannot read failed observer round pr-${row.pr}: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
          return;
        }
        if (typeof failure?.reason !== "string" || failure.reason.length === 0) {
          ctx.ui.notify(
            `Cannot read failed observer round pr-${row.pr}: failure reason is missing.`,
            "error",
          );
          return;
        }
        pi.sendUserMessage(
          `Discussing observer round pr-${row.pr}. This run has only analysis_failed.json: ${failurePath}. Failure reason: ${failure.reason}. Analyst trace: ${traceText}. There is no analysis document to walk; help me inspect the failure and decide how to recover architect-style.`,
        );
        return;
      }

      const analysisPath = join(runDir, "analysis.md");
      try {
        await loadFile(analysisPath, "utf8");
      } catch (error) {
        if (error?.code !== "ENOENT") {
          ctx.ui.notify(
            `Cannot read observer analysis for pr-${row.pr}: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
          return;
        }
      }
      pi.sendUserMessage(
        `Discussing observer round pr-${row.pr}. Analysis document: ${analysisPath}. Analyst trace: ${traceText}. Walk it with me architect-style: unpack the episodes, and for each we reach accept, reject, or reshape.`,
      );
    },
  });

  pi.registerCommand("architect-discussed", {
    description: "Record episode outcomes for a guided observer round. Usage: /architect-discussed <pr>",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        notifyNeedsUi(ctx);
        return;
      }

      const selector = args.trim();
      if (!/^[1-9][0-9]*$/.test(selector)) {
        ctx.ui.notify("Usage: /architect-discussed <positive PR number>", "error");
        return;
      }
      const pr = Number(selector);
      const rows = await readRounds(ctx);
      if (rows === undefined) return;
      const row = rows.find(
        (candidate) => candidate.pr === pr && candidate.variant === "guided",
      );
      if (row === undefined) {
        ctx.ui.notify(`Observer round pr-${pr} is not available.`, "error");
        return;
      }
      if (row.discussed) {
        ctx.ui.notify(
          `Observer round pr-${pr} is already discussed; no append-only mark was attempted.`,
          "warning",
        );
        return;
      }

      let runsRoot;
      try {
        runsRoot = observerRunsRoot(deps.runsRoot);
      } catch (error) {
        ctx.ui.notify(
          `Cannot locate observer rounds: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
        return;
      }
      const runDir = roundDirectory(runsRoot, row);
      const outcomes = [];
      if (row.failed) {
        const failurePath = join(runDir, "analysis_failed.json");
        let failure;
        try {
          failure = JSON.parse(await loadFile(failurePath, "utf8"));
        } catch (error) {
          ctx.ui.notify(
            `Cannot read analysis_failed.json for observer round pr-${pr}: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
          return;
        }
        if (typeof failure?.reason !== "string" || failure.reason.length === 0) {
          ctx.ui.notify(
            `Cannot read analysis_failed.json for observer round pr-${pr}: failure reason is missing.`,
            "error",
          );
          return;
        }
        ctx.ui.notify(
          `Observer round pr-${pr} analysis failed: ${failure.reason}`,
          "warning",
        );
        const confirmation = await ctx.ui.select(
          `Mark failed observer round pr-${pr} discussed with no episode outcomes?`,
          ["mark discussed", "cancel"],
        );
        if (confirmation === undefined || confirmation === "cancel") {
          ctx.ui.notify(
            `Discussion marking for pr-${pr} was cancelled; no outcomes were written.`,
            "warning",
          );
          return;
        }
        if (confirmation !== "mark discussed") {
          ctx.ui.notify(`Unsupported discussion confirmation for pr-${pr}.`, "error");
          return;
        }
      } else {
        const analysisPath = join(runDir, "analysis.json");
        let analysis;
        try {
          analysis = parseAnalysis(await loadFile(analysisPath, "utf8"));
        } catch (error) {
          ctx.ui.notify(
            `Cannot read analysis.json for observer round pr-${pr}: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
          return;
        }

        for (const episode of analysis.episodes) {
          ctx.ui.notify(
            `Episode ${episode.rank} — ${episode.kind}: ${episode.title}`,
            "info",
          );
          const verdict = await ctx.ui.select(
            `Verdict for ${episode.recurrence_key}`,
            VERDICTS,
          );
          if (verdict === undefined) {
            ctx.ui.notify(
              `Discussion marking for pr-${pr} was cancelled; no outcomes were written.`,
              "warning",
            );
            return;
          }
          if (!VERDICTS.includes(verdict)) {
            ctx.ui.notify(`Unsupported verdict for ${episode.recurrence_key}.`, "error");
            return;
          }
          if (verdict === "skip") continue;

          const note =
            (await ctx.ui.input(`Optional note for ${episode.recurrence_key}`)) ?? "";
          const refs =
            (await ctx.ui.input(
              `Task refs for ${episode.recurrence_key} (comma-separated)`,
            )) ?? "";
          outcomes.push({
            recurrence_key: episode.recurrence_key,
            verdict,
            task_refs: refs
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            note,
          });
        }
      }

      let temporaryDirectory;
      try {
        temporaryDirectory = await makeTemp(join(tmpdir(), "qq-architect-"));
        const outcomesPath = join(temporaryDirectory, "outcomes.json");
        await saveFile(outcomesPath, `${JSON.stringify(outcomes)}\n`, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
        await setMode(outcomesPath, 0o600);

        let execution;
        try {
          execution = await run(
            OBSERVE_COMMAND,
            ["mark-discussed", "--run", runDir, "--outcomes", outcomesPath],
            { cwd: ctx.cwd },
          );
        } catch (error) {
          ctx.ui.notify(
            `Could not mark observer round pr-${pr} discussed: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
          return;
        }
        if (execution?.killed || execution?.code !== 0) {
          ctx.ui.notify(
            `Could not mark observer round pr-${pr} discussed: ${executionReason(execution, "qq-observe mark-discussed failed")}`,
            "error",
          );
          return;
        }
        ctx.ui.notify(
          `Observer round pr-${pr} discussion result: ${execution.stdout?.trim() || "marked discussed"}`,
          "info",
        );
      } catch (error) {
        ctx.ui.notify(
          `Could not write outcomes for observer round pr-${pr}: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      } finally {
        if (temporaryDirectory !== undefined) {
          await remove(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
        }
      }
    },
  });
}
