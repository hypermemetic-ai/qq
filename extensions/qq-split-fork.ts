// @ts-nocheck
// Adapted from https://github.com/mitsuhiko/agent-stuff, extensions/split-fork.ts (Apache-2.0).

import { existsSync } from "node:fs";
import * as path from "node:path";

function shellQuote(value) {
  if (value.length === 0) return "''";
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function getPiInvocationParts() {
  const currentScript = process.argv[1];
  if (currentScript && existsSync(currentScript)) {
    return [process.execPath, currentScript];
  }

  const execName = path.basename(process.execPath).toLowerCase();
  if (/^(node|bun)(\.exe)?$/.test(execName)) {
    return ["pi"];
  }

  return [process.execPath];
}

function buildPiStartupInput(sessionFile, prompt) {
  // Native forking: pi --fork <path|id> rewrites the session into a new one at
  // startup (stock 0.81.1 dist/cli/args.js). The prompt travels as one
  // positional argument: pi's argument parser rejects a `--` sentinel
  // ("Error: Unknown option: --").
  const commandParts = [...getPiInvocationParts(), "--fork", sessionFile];
  if (prompt.length > 0) {
    commandParts.push(prompt);
  }
  return `${commandParts.map(shellQuote).join(" ")}\n`;
}

function parsePaneId(stdout) {
  if (typeof stdout !== "string") return undefined;

  try {
    const response = JSON.parse(stdout);
    for (const candidate of [
      response?.result?.pane_id,
      response?.result?.pane?.pane_id,
      response?.result?.id,
    ]) {
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    }
  } catch {
    // Fall through to the tolerant text probe.
  }

  return stdout.match(/\b\w+:[A-Za-z0-9]+\b/)?.[0];
}

function executionReason(result, fallback) {
  return result?.stderr?.trim() || result?.stdout?.trim() || fallback;
}

function notifyManualLaunch(ctx, reason, sessionFile, manualCommand) {
  ctx.ui.notify(
    `Failed to launch herdr split: ${reason}. Forked session: ${sessionFile}. Run manually: ${manualCommand}`,
    "error",
  );
}

export default function register(pi, deps = {}) {
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));

  pi.registerCommand("split-fork", {
    description: "Fork this session into a new pi process in a right-hand herdr split (tmux fallback). Usage: /split-fork [optional prompt — may not start with '-' or '@']",
    handler: async (args, ctx) => {
      const wasBusy = !ctx.isIdle();
      const prompt = args.trim();
      // pi's CLI (pi [options] [@files...] [messages...]) has no escape for
      // messages starting with '-' or '@': they parse as options or @files.
      // Refuse instead of launching a fork with a mangled prompt.
      if (prompt.startsWith("-") || prompt.startsWith("@")) {
        ctx.ui.notify(
          "Cannot fork with a prompt starting with '-' or '@': pi's CLI would parse it as an option or @file, not a message. Fork not launched.",
          "error",
        );
        return;
      }
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        ctx.ui.notify("Cannot fork this session because it has no persisted session file.", "warning");
        return;
      }

      const startupInput = buildPiStartupInput(sessionFile, prompt);
      const manualCommand = startupInput.slice(0, -1);
      if (wasBusy) {
        ctx.ui.notify(
          "Forked from current committed state (in-flight turn continues in original session).",
          "info",
        );
      }

      if (process.env.HERDR_PANE_ID !== undefined) {
        let splitResult;
        try {
          splitResult = await run("herdr", [
            "pane",
            "split",
            "--current",
            "--direction",
            "right",
            "--cwd",
            ctx.cwd,
            "--focus",
          ]);
        } catch (error) {
          notifyManualLaunch(
            ctx,
            error instanceof Error ? error.message : String(error),
            sessionFile,
            manualCommand,
          );
          return;
        }

        if (splitResult?.code !== 0) {
          notifyManualLaunch(
            ctx,
            executionReason(splitResult, "unknown herdr split error"),
            sessionFile,
            manualCommand,
          );
          return;
        }

        const paneId = parsePaneId(splitResult.stdout);
        if (!paneId) {
          notifyManualLaunch(
            ctx,
            executionReason(splitResult, "herdr returned no readable pane id"),
            sessionFile,
            manualCommand,
          );
          return;
        }

        const sendTextResult = await run("herdr", [
          "pane",
          "send-text",
          paneId,
          startupInput,
        ]);
        if (sendTextResult?.code !== 0) {
          notifyManualLaunch(
            ctx,
            executionReason(sendTextResult, "unknown herdr send-text error"),
            sessionFile,
            manualCommand,
          );
          return;
        }

        const sendKeysResult = await run("herdr", [
          "pane",
          "send-keys",
          paneId,
          "Enter",
        ]);
        if (sendKeysResult?.code !== 0) {
          notifyManualLaunch(
            ctx,
            executionReason(sendKeysResult, "unknown herdr send-keys error"),
            sessionFile,
            manualCommand,
          );
          return;
        }

        ctx.ui.notify(
          `Forked to ${path.basename(sessionFile)} in herdr pane ${paneId}.`,
          "info",
        );
        return;
      }

      if (process.env.TMUX !== undefined) {
        const tmuxResult = await run("tmux", [
          "split-window",
          "-h",
          "-c",
          ctx.cwd,
          manualCommand,
        ]);
        if (tmuxResult?.code !== 0) {
          notifyManualLaunch(
            ctx,
            executionReason(tmuxResult, "unknown tmux split error"),
            sessionFile,
            manualCommand,
          );
          return;
        }
        ctx.ui.notify(
          `Forked to ${path.basename(sessionFile)} in a right-hand tmux split.`,
          "info",
        );
        return;
      }

      ctx.ui.notify(
        `Forked session: ${sessionFile}. No herdr or tmux session is available; run manually: ${manualCommand}`,
        "warning",
      );
    },
  });
}
