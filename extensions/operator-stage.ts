// @ts-nocheck
// Stage an operator-only command, unexecuted, in a no-focus Herdr pane.
// The agent never sends keys. Low danger: Enter runs it. High danger: Enter, then y.

export function parsePaneId(stdout) {
  let response;
  try { response = JSON.parse(stdout); } catch { throw new Error("Herdr returned malformed JSON"); }
  const paneId = response?.result?.pane?.pane_id;
  if (typeof response?.id !== "string" || response.id.length === 0 ||
      response?.result?.type !== "pane_info" || typeof paneId !== "string" || paneId.length === 0) {
    throw new Error("Herdr returned no created pane id");
  }
  return paneId;
}

export function stagedLine(command, danger) {
  const body = `{ ${command}; } && exit`;
  if (danger === "low") return body;
  return `read -n1 -r -p 'HIGH DANGER — press y to run: ' __qq_c; [ "$__qq_c" = y ] && ${body}`;
}

function executionReason(execution, fallback) {
  return execution?.stderr?.trim() || execution?.stdout?.trim() || fallback;
}

function result(message, details) {
  return { content: [{ type: "text", text: message }], details: { ...details, message } };
}

export default function registerOperatorStage(pi, deps = {}) {
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  const env = deps.env ?? process.env;

  pi.registerTool({
    name: "operator_stage",
    label: "Operator Stage",
    description:
      "Save the operator a copy-paste: stage one command in a no-focus Herdr pane and notify them. They run it from that pane. The pane is a normal interactive shell.",
    promptSnippet: "Stage a command for the operator to run",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["command", "description", "danger"],
      properties: {
        command: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
        danger: { type: "string", enum: ["low", "high"] },
      },
    },
    async execute(_id, params, signal) {
      const command = params?.command;
      const description = params?.description;
      const danger = params?.danger;
      const details = {
        pane_id: "",
        danger: typeof danger === "string" ? danger : "",
        description: typeof description === "string" ? description : "",
        staged_line: "",
      };

      if (typeof command !== "string" || command.length === 0) {
        return result("operator_stage requires a non-empty command.", details);
      }
      if (/[\r\n]/.test(command)) {
        return result("operator_stage refuses commands containing a newline.", details);
      }
      if (typeof description !== "string" || description.length === 0) {
        return result("operator_stage requires a non-empty description.", details);
      }
      if (danger !== "low" && danger !== "high") {
        return result("operator_stage danger must be low or high.", details);
      }
      if (typeof env.HERDR_PANE_ID !== "string" || env.HERDR_PANE_ID.trim() === "") {
        return result("operator_stage requires a herdr session.", details);
      }

      const line = stagedLine(command, danger);
      details.staged_line = line;

      let split;
      try {
        split = await run("qq-herdr-pane-add", ["--current", "--cwd", process.cwd(), "--no-focus"], { signal });
      } catch (error) {
        return result(`operator_stage could not create a pane: ${error instanceof Error ? error.message : String(error)}`, details);
      }
      if (split?.code !== 0) {
        return result(`operator_stage could not create a pane: ${executionReason(split, "unknown herdr split error")}`, details);
      }

      let paneId;
      try {
        paneId = parsePaneId(split.stdout);
      } catch (error) {
        return result(`operator_stage could not read the created pane id: ${error instanceof Error ? error.message : String(error)}`, details);
      }
      details.pane_id = paneId;

      async function failOwnedPane(message) {
        let teardown = "closed";
        try {
          const closed = await run("herdr", ["pane", "close", paneId]);
          if (closed?.code !== 0) teardown = `close-failed: ${executionReason(closed, "unknown herdr close error")}`;
        } catch (error) {
          teardown = `close-failed: ${error instanceof Error ? error.message : String(error)}`;
        }
        details.teardown = teardown;
        const suffix = teardown === "closed" ? "" : ` The staged pane could not be torn down (${teardown}); it may be orphaned — inform the operator.`;
        return result(message + suffix, details);
      }

      let rename;
      try {
        rename = await run("herdr", ["pane", "rename", paneId, `op-stage: ${description.slice(0, 40)}`], { signal });
      } catch (error) {
        return failOwnedPane(`operator_stage could not rename pane ${paneId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (rename?.code !== 0) {
        return failOwnedPane(`operator_stage could not rename pane ${paneId}: ${executionReason(rename, "unknown herdr rename error")}`);
      }

      let ready;
      try {
        ready = await run("herdr", ["pane", "wait-output", paneId, "--source", "recent-unwrapped", "--timeout", "5000", "--regex", String.raw`[$#]\s*$`], { signal });
      } catch (error) {
        return failOwnedPane(`operator_stage timed out waiting for the shell prompt in pane ${paneId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (ready?.code !== 0) {
        return failOwnedPane(`operator_stage timed out waiting for the shell prompt in pane ${paneId}: ${executionReason(ready, "prompt never appeared")}`);
      }

      let sent;
      try {
        sent = await run("herdr", ["pane", "send-text", paneId, line], { signal });
      } catch (error) {
        return failOwnedPane(`operator_stage could not stage in pane ${paneId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (sent?.code !== 0) {
        return failOwnedPane(`operator_stage could not stage in pane ${paneId}: ${executionReason(sent, "unknown herdr send-text error")}`);
      }

      let notified;
      try {
        notified = await run("herdr", [
          "notification", "show", "Operator action ready",
          "--body", `Navigate to pane ${paneId}: ${description.slice(0, 80)}`,
          "--sound", "request",
        ], { signal });
      } catch (error) {
        return failOwnedPane(`operator_stage could not notify the operator about pane ${paneId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (notified?.code !== 0) {
        return failOwnedPane(`operator_stage could not notify the operator about pane ${paneId}: ${executionReason(notified, "unknown herdr notification error")}`);
      }

      const operatorAction = danger === "low"
        ? "Operator: press Enter once to run it."
        : "Operator: press Enter, then press y to run it (two presses); any other key aborts.";
      return result(
        `Command staged, unexecuted, in no-focus pane ${paneId}. A Herdr request notification was sent; navigate to pane ${paneId}. ${operatorAction} ` +
          `Afterwards the agent validates by running \`herdr pane read ${paneId}\`: ` +
          "pane gone means the command succeeded and auto-closed; pane present means failure or abort, so read the visible error. " +
          "The agent never sends keys into the pane.",
        details,
      );
    },
  });
}
