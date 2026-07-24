// @ts-nocheck

import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

const OBSERVE_COMMAND = "bin/qq-observe";
const DIGEST_CHOICE = "Discuss current digest";
const DIGEST_TABLE_HEADER = "| Score | Recurrences | Recurrence key | Latest title | Kind | PRs | Confidence history | Disposition |";
const DIGEST_TABLE_DIVIDER = "| ---: | ---: | --- | --- | --- | --- | --- | --- |";
const DIGEST_EMPTY_ROW = ["—", "—", "None", "—", "—", "—", "—", "—"];
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

function digestCells(line) {
  if (!line.startsWith("|") || !line.endsWith("|")) {
    throw new Error("digest table row is not pipe-delimited");
  }
  const cells = [];
  let start = 1;
  function addCell(end) {
    const cell = line.slice(start, end);
    if (!cell.startsWith(" ") || !cell.endsWith(" ")) {
      throw new Error("digest table cell padding is malformed");
    }
    cells.push(cell.slice(1, -1));
    start = end + 1;
  }
  for (let index = 1; index < line.length - 1; index += 1) {
    if (line[index] !== "|") continue;
    let escapes = 0;
    for (let before = index - 1; before >= 0 && line[before] === "\\"; before -= 1) {
      escapes += 1;
    }
    if (escapes % 2 === 0) addCell(index);
  }
  addCell(line.length - 1);
  if (cells.length !== 8) throw new Error("digest table row has the wrong width");
  return cells;
}

function digestText(value) {
  return value.replace(/\\([\\|])/g, "$1");
}

function digestCode(value) {
  if (value.length < 3 || !value.startsWith("`") || !value.endsWith("`")) {
    throw new Error("digest code cell is malformed");
  }
  return digestText(value.slice(1, -1));
}

function parseDigestTable(lines, heading, label) {
  const position = lines.indexOf(heading);
  if (position < 0 || position !== lines.lastIndexOf(heading)) {
    throw new Error("digest table heading is missing or duplicated");
  }
  if (
    lines[position + 1] !== "" ||
    lines[position + 2] !== DIGEST_TABLE_HEADER ||
    lines[position + 3] !== DIGEST_TABLE_DIVIDER
  ) {
    throw new Error("digest table header is malformed");
  }

  const rows = [];
  let index = position + 4;
  while (index < lines.length && lines[index] !== "") {
    rows.push(digestCells(lines[index]));
    index += 1;
  }
  if (rows.length === 0 || index === lines.length) {
    throw new Error("digest table is incomplete");
  }
  if (rows.some((row) => row.every((cell, cellIndex) => cell === DIGEST_EMPTY_ROW[cellIndex]))) {
    if (rows.length !== 1) throw new Error("digest empty sentinel is mixed with findings");
    return { position, end: index, text: `${label}\n- None` };
  }

  const rendered = rows.map((row) => {
    const [score, recurrences, key, title, kind, prs, confidence, disposition] = row;
    if (
      !/^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]+)(?:e[+-]?[0-9]+)?$/i.test(score) ||
      !/^[1-9][0-9]*$/.test(recurrences) ||
      digestText(title).length === 0 ||
      !/^#[1-9][0-9]*(, #[1-9][0-9]*)*$/.test(prs) ||
      !/^(high|medium|low)(, (high|medium|low))*$/.test(confidence) ||
      !/^(none|accepted|rejected|reshaped) \(×(0\.5|1|1\.5)\)$/.test(disposition)
    ) {
      throw new Error("digest finding row has the wrong shape");
    }
    const recurrenceKey = digestCode(key);
    const findingKind = digestCode(kind);
    if (recurrenceKey.length === 0 || findingKind.length === 0) {
      throw new Error("digest finding identity is empty");
    }
    return `- Score: ${score}; Recurrences: ${recurrences}; Recurrence key: ${recurrenceKey}; Latest title: ${digestText(title)}; Kind: ${findingKind}; PRs: ${prs}; Confidence history: ${confidence}; Disposition: ${disposition}`;
  });
  return { position, end: index, text: `${label}\n${rendered.join("\n")}` };
}

function parseDigest(stdout) {
  if (typeof stdout !== "string" || stdout.trim() === "" || stdout.includes("\r")) {
    throw new Error("empty or non-canonical output");
  }
  const lines = stdout.split("\n");
  if (
    lines[0] !== "# qq observer digest" ||
    lines[1] !== "" ||
    !/^Generated: `[^`]+`$/.test(lines[2] ?? "")
  ) {
    throw new Error("digest preamble is malformed");
  }
  const opportunities = parseDigestTable(lines, "## Opportunities ledger", "Opportunities ledger");
  const open = parseDigestTable(lines, "## Open findings", "Open findings");
  if (opportunities.position >= open.position) {
    throw new Error("digest ranked tables are out of order");
  }
  const suffix = lines.slice(open.end + 1).join("\n");
  if (!/^## Signal-tuning candidates\n\n\| PR \| Direction \| Evidence \| Signal kind \| Episode title \| Recurrence key \|\n\| ---: \| --- \| --- \| --- \| --- \| --- \|\n(?:\| .* \|\n)+\nCoverage: [0-9]+ finalized, [0-9]+ failed\.\nUnknown ledger entries: [0-9]+\.\n(?![\s\S])/.test(suffix)) {
    throw new Error("digest suffix is malformed");
  }
  return { markdown: stdout, selectorTitle: `Current observer digest\n\n${opportunities.text}\n\n${open.text}` };
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

  async function readObserver(ctx, type, parse, unreadable) {
    let execution;
    try {
      execution = await run(OBSERVE_COMMAND, [type], { cwd: ctx.cwd });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Cannot load observer ${type}: ${reason}`, "error");
      return undefined;
    }
    if (execution?.killed || execution?.code !== 0) {
      ctx.ui.notify(
        `Cannot load observer ${type}: ${executionReason(execution, `qq-observe ${type} failed`)}`,
        "error",
      );
      return undefined;
    }
    try {
      return parse(execution.stdout);
    } catch {
      ctx.ui.notify(`Cannot load observer ${type}: ${unreadable}`, "error");
      return undefined;
    }
  }

  function readDigest(ctx) {
    return readObserver(ctx, "digest", parseDigest, "qq-observe digest returned unreadable or incomplete Markdown.");
  }

  function readRounds(ctx) {
    return readObserver(ctx, "rounds", parseRounds, "qq-observe rounds returned unreadable JSON.");
  }

  pi.registerCommand("architect", {
    description: "Discuss the observer digest or select a round for a deep dive.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        notifyNeedsUi(ctx);
        return;
      }

      const digest = await readDigest(ctx);
      if (digest === undefined) return;
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

      const choices = [DIGEST_CHOICE, ...finalized.map(({ row }) => roundLabel(row))];
      const selected = await ctx.ui.select(digest.selectorTitle, choices);
      if (selected === undefined) return;
      if (selected === DIGEST_CHOICE) {
        pi.sendUserMessage(
          `Discussing the current observer digest:\n\n${digest.markdown}\n\nWalk the whole ranked ledger with me architect-style: identify cross-finding themes, priorities, and useful round deep dives while still examining each promoted and open finding. Keep digest/theme-level disposition writing parked; do not record or propose a digest-level verdict.`,
        );
        return;
      }
      const position = choices.indexOf(selected) - 1;
      if (position < 0 || position >= finalized.length) {
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
      let analysisSource = `Analysis document: ${analysisPath}.`;
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
        const jsonPath = join(runDir, "analysis.json");
        try {
          await loadFile(jsonPath, "utf8");
        } catch (jsonError) {
          ctx.ui.notify(
            `Cannot read observer analysis for pr-${row.pr}: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`,
            "error",
          );
          return;
        }
        analysisSource = `Readable analysis source: ${jsonPath}. analysis.md was not produced.`;
      }
      pi.sendUserMessage(
        `Discussing observer round pr-${row.pr}. ${analysisSource} Analyst trace: ${traceText}. Walk it with me architect-style: unpack the episodes, and for each we reach accept, reject, or reshape.`,
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
      const blindRow = rows.find(
        (candidate) => candidate.pr === pr && candidate.variant === "blind",
      );
      const blindReady =
        blindRow !== undefined && (blindRow.analyzed || blindRow.failed);
      const completingTwin = row.discussed && blindReady && !blindRow.discussed;
      if (row.discussed && blindRow !== undefined && !blindRow.discussed && !blindReady) {
        ctx.ui.notify(
          `Observer round pr-${pr} is discussed; its blind twin is not yet analyzed — nothing to complete.`,
          "warning",
        );
        return;
      }
      if (row.discussed && !completingTwin) {
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
      if (completingTwin) {
        const confirmation = await ctx.ui.select(
          `Observer round pr-${pr} is discussed; complete its blind twin mark?`,
          ["mark blind twin discussed", "cancel"],
        );
        if (confirmation === undefined || confirmation === "cancel") {
          ctx.ui.notify(
            `Blind twin discussion marking for pr-${pr} was cancelled.`,
            "warning",
          );
          return;
        }
        if (confirmation !== "mark blind twin discussed") {
          ctx.ui.notify(`Unsupported blind twin confirmation for pr-${pr}.`, "error");
          return;
        }
        try {
          const discussed = JSON.parse(
            await loadFile(join(runDir, "discussed.json"), "utf8"),
          );
          if (!Array.isArray(discussed?.outcomes)) {
            throw new Error("outcomes are missing");
          }
          outcomes.push(...discussed.outcomes);
        } catch (error) {
          ctx.ui.notify(
            `Cannot read discussed.json for observer round pr-${pr}: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
          return;
        }
      } else if (row.failed) {
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

        const markArguments = [
          "mark-discussed", "--run", runDir, "--outcomes", outcomesPath,
        ];
        const blindDir = roundDirectory(runsRoot, { pr, variant: "blind" });
        if (
          completingTwin
          || await isRegularFile(join(blindDir, "analysis.json"), inspectFile)
          || await isRegularFile(join(blindDir, "analysis_failed.json"), inspectFile)
        ) {
          markArguments.push("--twin", blindDir);
        }

        let execution;
        try {
          execution = await run(
            OBSERVE_COMMAND,
            markArguments,
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
