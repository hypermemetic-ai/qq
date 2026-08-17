// @ts-nocheck
import {
  captureShots,
  DEFAULT_MEASURE_SELECTORS,
  measureBoxes,
  readState,
  seedPrompt,
  startFixture,
  stopLoop,
} from "../bin/lib/frontend-design-loop.mjs";

function result(message, details = {}) {
  return { content: [{ type: "text", text: message }], details: { ...details, message } };
}

function reason(error) {
  return error instanceof Error ? error.message : String(error);
}

export default function registerFrontendDesignLoop(pi, deps = {}) {
  const env = deps.env ?? process.env;
  const start = deps.startFixture ?? startFixture;
  const stop = deps.stopLoop ?? stopLoop;
  const capture = deps.captureShots ?? captureShots;
  const measure = deps.measureBoxes ?? measureBoxes;
  const seed = deps.seedPrompt ?? seedPrompt;
  const stateOf = deps.readState ?? readState;

  pi.registerTool({
    name: "design_loop_start",
    label: "Design Loop Start",
    promptSnippet: "Start the live-asset dsh-console fixture",
    description:
      "Start the dsh-console browser fixture with live CSS/JS assets and return the origin plus session URL.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        live: { type: "boolean" },
      },
    },
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const started = await start({
          root: ctx.cwd,
          env,
          live: params?.live !== false,
        });
        return result(
          `Design-loop fixture listening at ${started.origin}. Open ${started.sessionUrl}. Live assets: ${started.live ? "on" : "off"}.`,
          started,
        );
      } catch (error) {
        return result(`design_loop_start refused: ${reason(error)}`);
      }
    },
  });

  pi.registerTool({
    name: "design_loop_capture",
    label: "Design Loop Capture",
    promptSnippet: "Reload and shoot desktop plus phone",
    description:
      "Reload the fixture session, shoot desktop 1280x800 and Pixel 10 412x915 (optional 412x520 short), and measure default boxes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        label: { type: "string" },
        short: { type: "boolean" },
      },
    },
    async execute(_id, params) {
      try {
        const captured = await capture({
          env,
          label: params?.label,
          short: params?.short === true,
        });
        const shotList = Object.entries(captured.shots).map(([name, path]) => `${name}=${path}`).join(" ");
        return result(`Captured ${captured.label}: ${shotList}`, captured);
      } catch (error) {
        return result(`design_loop_capture refused: ${reason(error)}`);
      }
    },
  });

  pi.registerTool({
    name: "design_loop_measure",
    label: "Design Loop Measure",
    promptSnippet: "Measure selected console boxes and styles",
    description:
      "Read get box and get styles for console selectors on the dedicated design-loop browser session.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        selectors: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    async execute(_id, params) {
      try {
        const measured = await measure({
          env,
          selectors: Array.isArray(params?.selectors) && params.selectors.length
            ? params.selectors
            : DEFAULT_MEASURE_SELECTORS,
        });
        return result("Measured design-loop selectors.", measured);
      } catch (error) {
        return result(`design_loop_measure refused: ${reason(error)}`);
      }
    },
  });

  pi.registerTool({
    name: "design_loop_seed",
    label: "Design Loop Seed",
    promptSnippet: "Post a sample prompt so the fixture transcript is not empty",
    description:
      "POST a sample prompt to the running design-loop fixture so user and assistant cards exist.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        prompt: { type: "string" },
      },
    },
    async execute(_id, params) {
      try {
        const seeded = await seed({ env, prompt: params?.prompt });
        return result(`Seeded ${seeded.sessionId}.`, seeded);
      } catch (error) {
        return result(`design_loop_seed refused: ${reason(error)}`);
      }
    },
  });

  pi.registerTool({
    name: "design_loop_stop",
    label: "Design Loop Stop",
    promptSnippet: "Stop the fixture and close the design-loop browser session",
    description: "Kill the design-loop fixture and close the dedicated agent-browser session.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async execute() {
      try {
        const stopped = await stop({ env });
        return result(
          `Design-loop stopped (fixture ${stopped.fixture}, browser ${stopped.browser}).`,
          stopped,
        );
      } catch (error) {
        return result(`design_loop_stop refused: ${reason(error)}`);
      }
    },
  });

  return { readState: stateOf };
}
