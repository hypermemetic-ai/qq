// @ts-nocheck

function shellQuote(value) {
  if (value.length === 0) return "''";
  return `'${value.replace(/'/g, `'"'"'`)}'`;
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

function executionReason(execution, fallback) {
  return execution?.stderr?.trim() || execution?.stdout?.trim() || fallback;
}

function result(message, details) {
  return {
    content: [{ type: "text", text: message }],
    details: { ...details, message },
  };
}

function stagedLine(command, description, danger) {
  if (danger === "low") {
    return `${command}; __qq_s=$?; [ $__qq_s -eq 0 ] && exit`;
  }

  const prompt = shellQuote(
    `HIGH DANGER — ${description} — press y to run: `,
  );
  return `read -n1 -r -p ${prompt} __qq_c; [ "$__qq_c" = y ] && { ${command}; __qq_s=$?; [ $__qq_s -eq 0 ] && exit; }`;
}

export default function register(pi, deps = {}) {
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));

  pi.registerTool({
    name: "operator_stage",
    label: "Operator Stage",
    description:
      "Stage an operator-only command, unexecuted, in a focused guarded herdr pane.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
        danger: { type: "string", enum: ["low", "high"] },
      },
      required: ["command", "description", "danger"],
      additionalProperties: false,
    },
    prepareArguments(args) {
      return args;
    },
    async execute(_toolCallId, params, signal) {
      const command = params?.command;
      const description = params?.description;
      const danger = params?.danger;
      const baseDetails = {
        pane_id: "",
        danger: typeof danger === "string" ? danger : "",
        description: typeof description === "string" ? description : "",
        staged_line: "",
        readback: "",
      };

      if (typeof command !== "string" || command.length === 0) {
        return result("operator_stage requires a non-empty command.", baseDetails);
      }
      if (/[\r\n]/.test(command)) {
        return result("operator_stage refuses commands containing a newline.", baseDetails);
      }
      if (typeof description !== "string" || description.length === 0) {
        return result("operator_stage requires a non-empty description.", baseDetails);
      }
      if (danger !== "low" && danger !== "high") {
        return result("operator_stage danger must be low or high.", baseDetails);
      }
      if (process.env.HERDR_PANE_ID === undefined) {
        return result("operator_stage requires a herdr session.", baseDetails);
      }

      const line = stagedLine(command, description, danger);
      const details = { ...baseDetails, staged_line: line };
      let split;
      try {
        split = await run(
          "herdr",
          [
            "pane",
            "split",
            "--current",
            "--direction",
            "right",
            "--cwd",
            process.cwd(),
            "--focus",
          ],
          { signal },
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return result(`operator_stage could not create a pane: ${reason}`, details);
      }
      if (split?.code !== 0) {
        return result(
          `operator_stage could not create a pane: ${executionReason(split, "unknown herdr split error")}`,
          details,
        );
      }

      const paneId = parsePaneId(split.stdout);
      if (!paneId) {
        return result(
          `operator_stage could not read the created pane id: ${executionReason(split, "herdr returned no readable pane id")}`,
          details,
        );
      }
      details.pane_id = paneId;

      async function failOwnedPane(message, readback = "") {
        details.readback = readback;
        try {
          await run("herdr", ["pane", "close", paneId]);
        } catch {
          // The primary failure remains the reported outcome after one teardown attempt.
        }
        return result(message, details);
      }

      let rename;
      try {
        rename = await run(
          "herdr",
          ["pane", "rename", paneId, `op-stage: ${description.slice(0, 40)}`],
          { signal },
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return failOwnedPane(`operator_stage could not rename pane ${paneId}: ${reason}`);
      }
      if (rename?.code !== 0) {
        return failOwnedPane(
          `operator_stage could not rename pane ${paneId}: ${executionReason(rename, "unknown herdr rename error")}`,
        );
      }

      let sent;
      try {
        sent = await run(
          "herdr",
          ["pane", "send-text", paneId, line],
          { signal },
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return failOwnedPane(`operator_stage could not stage in pane ${paneId}: ${reason}`);
      }
      if (sent?.code !== 0) {
        return failOwnedPane(
          `operator_stage could not stage in pane ${paneId}: ${executionReason(sent, "unknown herdr send-text error")}`,
        );
      }

      let reading;
      try {
        reading = await run("herdr", ["pane", "read", paneId], { signal });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return failOwnedPane(`operator_stage could not verify pane ${paneId}: ${reason}`);
      }
      const readback = typeof reading?.stdout === "string" ? reading.stdout : "";
      details.readback = readback;
      if (reading?.code !== 0) {
        return failOwnedPane(
          `operator_stage could not verify pane ${paneId}: ${executionReason(reading, "unknown herdr read error")}`,
          readback,
        );
      }
      if (!readback.includes(command)) {
        return failOwnedPane(
          `operator_stage could not verify that pane ${paneId} contains the staged command.`,
          readback,
        );
      }

      const operatorAction =
        danger === "low"
          ? "Operator: press Enter once to run it."
          : "Operator: press Enter, then press y to run it (two presses); any other key aborts.";
      const message =
        `Command staged, unexecuted, in pane ${paneId}. ${operatorAction} ` +
        `Afterwards the agent validates by running \`herdr pane read ${paneId}\`: ` +
        "pane gone means the command succeeded and auto-closed; pane present means failure or abort, so read the visible error. " +
        "The agent never sends keys into the pane.";
      return result(message, details);
    },
  });
}
