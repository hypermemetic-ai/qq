// @ts-nocheck

const INSPECTION_FAILED =
  "GitHub pull-request inspection failed; no terminal notification was emitted.";
const UNREADABLE_STATE =
  "GitHub did not return a readable pull-request state; no terminal notification was emitted.";
const UNSUPPORTED_STATE =
  "GitHub returned an unsupported pull-request state.";
const INTERVAL_ERROR =
  "--interval must be an integer from 30 through 60 seconds";
const TERMINAL_STATES = new Set(["MERGED", "CLOSED"]);
const KNOWN_STATES = new Set(["OPEN", ...TERMINAL_STATES]);

function terminalMessage(pr, reading) {
  const urlSuffix = reading.url === "" ? "" : ` — ${reading.url}`;
  return `pull request ${pr} reached terminal state ${reading.prState}${urlSuffix}`;
}

function watchFailureMessage(pr, message) {
  return `pull request ${pr} watch failed: ${message}`;
}

function inspectFailureMessage(pr, message) {
  return `pull request ${pr} inspection failed: ${message}`;
}

function result(message, details) {
  return {
    content: [{ type: "text", text: message }],
    details: { ...details, message },
  };
}

export default function register(pi, deps = {}) {
  const setTimer = deps.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer));
  const watches = new Map();
  let sessionAlive = true;

  function details(status, pr, reading, notificationCount) {
    return {
      status,
      pull_request: pr,
      pr_state: reading?.prState ?? "",
      url: reading?.url ?? "",
      notification_count: notificationCount,
    };
  }

  async function readPullRequest(pr, signal) {
    let execution;
    try {
      execution = await pi.exec(
        "gh",
        ["pr", "view", "--json", "state,url", "--", pr],
        { signal },
      );
    } catch {
      return { ok: false, message: INSPECTION_FAILED };
    }

    if (execution?.killed || execution?.code !== 0) {
      return { ok: false, message: INSPECTION_FAILED };
    }
    if (typeof execution.stdout !== "string" || execution.stdout.trim() === "") {
      return { ok: false, message: UNREADABLE_STATE };
    }

    let response;
    try {
      response = JSON.parse(execution.stdout);
    } catch {
      return { ok: false, message: UNREADABLE_STATE };
    }

    if (
      response === null ||
      typeof response !== "object" ||
      typeof response.state !== "string" ||
      response.state.length === 0
    ) {
      return { ok: false, message: UNREADABLE_STATE };
    }

    const reading = {
      ok: true,
      prState: response.state,
      url: typeof response.url === "string" ? response.url : "",
    };
    if (!KNOWN_STATES.has(reading.prState)) {
      return { ...reading, ok: false, message: UNSUPPORTED_STATE };
    }
    return reading;
  }

  function retire(watch) {
    if (!watch.alive) {
      return false;
    }
    watch.alive = false;
    if (watch.timer !== null) {
      clearTimer(watch.timer);
      watch.timer = null;
    }
    if (watches.get(watch.key) === watch) {
      watches.delete(watch.key);
    }
    return true;
  }

  function sendWake(message, wakeDetails) {
    const messageDetails =
      wakeDetails.status === "error"
        ? { ...wakeDetails, message }
        : wakeDetails;
    pi.sendMessage(
      {
        customType: "qq-pr-watch",
        content: message,
        display: true,
        details: messageDetails,
      },
      { triggerTurn: true, deliverAs: "followUp" },
    );
  }

  function schedule(watch) {
    watch.timer = setTimer(async () => {
      const firedTimer = watch.timer;
      watch.timer = null;
      if (firedTimer !== null) {
        clearTimer(firedTimer);
      }
      if (watch.alive) {
        await poll(watch);
      }
    }, watch.interval * 1000);
  }

  async function poll(watch, signal) {
    if (!watch.alive || watch.polling) {
      return { kind: "stopped" };
    }

    watch.polling = true;
    const reading = await readPullRequest(watch.pr, signal);
    watch.polling = false;

    if (!watch.alive) {
      return { kind: "stopped" };
    }
    if (!reading.ok) {
      const message = watchFailureMessage(watch.pr, reading.message);
      const wakeDetails = details("error", watch.pr, reading, 1);
      retire(watch);
      sendWake(message, wakeDetails);
      return { kind: "error", message, details: wakeDetails };
    }
    if (reading.prState === "OPEN") {
      schedule(watch);
      return { kind: "open", reading };
    }

    const message = terminalMessage(watch.pr, reading);
    const wakeDetails = details("done", watch.pr, reading, 1);
    retire(watch);
    sendWake(message, wakeDetails);
    return { kind: "terminal", message, details: wakeDetails };
  }

  pi.registerTool({
    name: "qq_pr_watch",
    label: "Pull Request Watch",
    description:
      "Inspect or watch one exact GitHub pull request for MERGED or CLOSED disposition.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["watch", "inspect"] },
        pr: {
          type: "string",
          minLength: 1,
          description: "One exact pull-request number or URL.",
        },
        interval: {
          type: "integer",
          minimum: 30,
          maximum: 60,
          default: 30,
          description: "Polling interval in seconds.",
        },
      },
      required: ["action", "pr"],
      additionalProperties: false,
    },
    prepareArguments(args) {
      if (args?.interval !== undefined && !Number.isInteger(args.interval)) {
        throw new Error(INTERVAL_ERROR);
      }
      return args;
    },
    async execute(_toolCallId, params, signal) {
      const interval = params.interval ?? 30;
      if (!Number.isInteger(interval) || interval < 30 || interval > 60) {
        const message =
          params.action === "inspect"
            ? inspectFailureMessage(params.pr, INTERVAL_ERROR)
            : watchFailureMessage(params.pr, INTERVAL_ERROR);
        return result(
          message,
          details("error", params.pr, undefined, 0),
        );
      }

      if (params.action === "inspect") {
        const reading = await readPullRequest(params.pr, signal);
        if (!reading.ok) {
          return result(
            inspectFailureMessage(params.pr, reading.message),
            details("error", params.pr, reading, 0),
          );
        }
        if (reading.prState === "OPEN") {
          return result(
            `pull request ${params.pr} is still OPEN; no completion notification was emitted. Leave the watch armed or retry after disposition.`,
            details("refused", params.pr, reading, 0),
          );
        }
        return result(
          `pull request ${params.pr} is already ${reading.prState}; inspection emitted no completion notification`,
          details("done", params.pr, reading, 0),
        );
      }

      const reading = await readPullRequest(params.pr, signal);
      if (!sessionAlive) {
        return result(
          `pull request ${params.pr} watch was not armed because the session shut down.`,
          details("refused", params.pr, undefined, 0),
        );
      }
      if (!reading.ok) {
        const message = watchFailureMessage(params.pr, reading.message);
        const wakeDetails = details("error", params.pr, reading, 1);
        sendWake(message, wakeDetails);
        return result(message, wakeDetails);
      }

      const key = reading.url === "" ? params.pr : reading.url;
      if (watches.has(key)) {
        return result(
          `A watch is already active for pull request ${params.pr}; no new watch was armed.`,
          details("refused", params.pr, undefined, 0),
        );
      }

      if (reading.prState !== "OPEN") {
        const message = terminalMessage(params.pr, reading);
        const wakeDetails = details("done", params.pr, reading, 1);
        sendWake(message, wakeDetails);
        return result(message, wakeDetails);
      }

      const watch = {
        key,
        pr: params.pr,
        interval,
        timer: null,
        alive: true,
        polling: false,
      };
      watches.set(watch.key, watch);
      schedule(watch);
      return result(
        `pull-request watch armed for ${watch.pr}`,
        {
          ...details("done", watch.pr, reading, 0),
          interval_seconds: interval,
        },
      );
    },
  });

  pi.on("session_shutdown", () => {
    sessionAlive = false;
    for (const watch of watches.values()) {
      watch.alive = false;
      if (watch.timer !== null) {
        clearTimer(watch.timer);
        watch.timer = null;
      }
    }
    watches.clear();
  });
}
