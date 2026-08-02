// @ts-nocheck

import { appendFile, chmod, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DOCTRINE_PATH = fileURLToPath(
  new URL("./qq-communication-doctrine.md", import.meta.url),
);
const DEFAULT_LOG_PATH = join(
  process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
  "qq",
  "communication-moments.jsonl",
);
const DESCRIPTION_LEAD =
  "Ask the operator at a communication moment; the governing doctrine follows in full.";
const DIALOG_GUIDANCE =
  "A `Type something.` row is appended to every question automatically; Esc abandons the moment.";
const ALIGNMENT_LEAD =
  "Communication-moments doctrine — governs alignment, realignment, operator-action asks, and judgment-reserved delivery.";
const TYPE_SOMETHING = "Type something.";
const DONE_SELECTING = "Done selecting";

const MOMENT_SECTIONS = {
  alignment: ["## Alignment — once per ticket, before work"],
  realignment: ["## Realignment — when alignment's basis reopens"],
  "operator-action-ask": ["## Operator-action ask"],
  "judgment-reserved-delivery": [
    "## Judgment-reserved delivery — only if marked at alignment",
    "## Default delivery — everything else",
  ],
};
const EVERY_MOMENT_SECTIONS = ["## Every moment", "## What carries stakes"];

function defaultDoctrineReader(path) {
  return readFileSync(path, "utf8");
}

function warningMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function section(text, header) {
  const marker = `${header}\n`;
  const start = text.indexOf(marker);
  if (start < 0 || (start > 0 && text[start - 1] !== "\n")) {
    throw new Error(`missing exact doctrine section: ${header}`);
  }
  const next = text.indexOf("\n## ", start + marker.length);
  return text.slice(start, next < 0 ? text.length : next).trimEnd();
}

function followUpDoctrine(doctrine, moment) {
  try {
    const headers = [...EVERY_MOMENT_SECTIONS, ...(MOMENT_SECTIONS[moment] ?? [])];
    if (headers.length === EVERY_MOMENT_SECTIONS.length) {
      throw new Error(`unknown communication moment: ${moment}`);
    }
    return {
      text: headers.map((header) => section(doctrine, header)).join("\n\n"),
      full: false,
    };
  } catch (error) {
    return { text: doctrine, full: true, error };
  }
}

function displayOption(option) {
  return option.description
    ? `${option.label} — ${option.description}`
    : option.label;
}

function questionTitle(question) {
  return `${question.header}: ${question.question}`;
}

function answerRecord(question, selections) {
  return {
    header: question.header,
    question: question.question,
    multiSelect: question.multiSelect === true,
    selections,
  };
}

function chosenOption(choice, options, rows) {
  let index = rows.indexOf(choice);
  if (index < 0) {
    index = options.findIndex((option) => option.label === choice);
  }
  if (index < 0) {
    throw new Error("dialog returned an option that was not presented");
  }
  const option = options[index];
  return {
    index,
    selection: {
      label: option.label,
      description: option.description,
      custom: false,
    },
  };
}

async function customAnswer(ui, question) {
  const value = await ui.input(
    `${question.header}: ${TYPE_SOMETHING}`,
    question.question,
  );
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }
  return {
    label: String(value).trim(),
    description: "",
    custom: true,
  };
}

async function askSingle(ui, question) {
  const rows = question.options.map(displayOption);
  const choice = await ui.select(questionTitle(question), [
    ...rows,
    TYPE_SOMETHING,
  ]);
  if (choice === undefined || choice === null) return undefined;
  if (choice === TYPE_SOMETHING) {
    const custom = await customAnswer(ui, question);
    return custom === undefined ? undefined : answerRecord(question, [custom]);
  }
  const { selection } = chosenOption(choice, question.options, rows);
  return answerRecord(question, [selection]);
}

async function askMultiple(ui, question) {
  const remaining = question.options.map((option, index) => ({ option, index }));
  const selections = [];

  while (true) {
    const options = remaining.map(({ option }) => option);
    const rows = options.map(displayOption);
    const choice = await ui.select(questionTitle(question), [
      ...rows,
      TYPE_SOMETHING,
      DONE_SELECTING,
    ]);
    if (choice === undefined || choice === null) return undefined;
    if (choice === DONE_SELECTING) {
      return selections.length === 0
        ? undefined
        : answerRecord(question, selections);
    }
    if (choice === TYPE_SOMETHING) {
      const custom = await customAnswer(ui, question);
      if (custom === undefined) return undefined;
      selections.push(custom);
      continue;
    }

    const { index, selection } = chosenOption(choice, options, rows);
    selections.push(selection);
    remaining.splice(index, 1);
  }
}

function toolResult(moment, outcome, answers, doctrineResult, error) {
  const payload = {
    moment,
    outcome,
    answers,
    ...(error === undefined ? {} : { error: warningMessage(error) }),
  };
  const doctrineText = doctrineResult.text || "[Communication doctrine unavailable.]";
  const text = `${JSON.stringify(payload, null, 2)}\n\nFollow-up doctrine:\n\n${doctrineText}`;
  return {
    content: [{ type: "text", text }],
    details: {
      ...payload,
      follow_up_doctrine: doctrineText,
      full_doctrine_fallback: doctrineResult.full,
    },
  };
}

export default function register(pi, deps = {}) {
  const doctrinePath = deps.doctrinePath ?? DEFAULT_DOCTRINE_PATH;
  const logPath = deps.logPath ?? DEFAULT_LOG_PATH;
  const readDoctrine = deps.readDoctrine ?? defaultDoctrineReader;
  const now = deps.now ?? (() => new Date().toISOString());
  const pane = Object.hasOwn(deps, "pane")
    ? deps.pane
    : (process.env.HERDR_PANE_ID ?? null);
  let doctrine = "";
  let alignmentPending = false;

  function warn(message, ctx) {
    const text = `Communication moments: ${message}`;
    for (const ui of [deps.ui, ctx?.ui]) {
      if (typeof ui?.notify !== "function") continue;
      try {
        ui.notify(text, "warning");
        return;
      } catch {
        // Fall through to the next local warning surface.
      }
    }
    try {
      (deps.warn ?? console.warn)(text);
    } catch {
      // Warning failures must not break the interactive session.
    }
  }

  try {
    doctrine = readDoctrine(doctrinePath);
    if (typeof doctrine !== "string" || doctrine === "") {
      throw new Error("doctrine file was empty or unreadable");
    }
  } catch (error) {
    doctrine = "";
    warn(`could not read doctrine: ${warningMessage(error)}`);
  }

  async function appendMarker(moment, questionCount, outcome, ctx) {
    try {
      const record = {
        ts: now(),
        moment,
        question_count: questionCount,
        pane: typeof pane === "string" ? pane : null,
        outcome,
      };
      if (deps.appendMarker) {
        await deps.appendMarker(record, logPath);
        return;
      }
      await mkdir(dirname(logPath), { recursive: true, mode: 0o700 });
      await appendFile(logPath, `${JSON.stringify(record)}\n`, {
        encoding: "utf8",
        flag: "a",
        mode: 0o600,
      });
      await chmod(logPath, 0o600);
    } catch (error) {
      warn(`could not append phase marker: ${warningMessage(error)}`, ctx);
    }
  }

  pi.registerTool({
    name: "operator_ask",
    label: "Operator ask",
    description: `${DESCRIPTION_LEAD}\n${DIALOG_GUIDANCE}\n\n${doctrine}`,
    executionMode: "sequential",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        moment: {
          type: "string",
          enum: [
            "alignment",
            "realignment",
            "operator-action-ask",
            "judgment-reserved-delivery",
          ],
        },
        questions: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              header: { type: "string", maxLength: 16 },
              question: { type: "string" },
              multiSelect: { type: "boolean" },
              options: {
                type: "array",
                minItems: 2,
                maxItems: 4,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    label: { type: "string", maxLength: 60 },
                    description: { type: "string" },
                  },
                  required: ["label", "description"],
                },
              },
            },
            required: ["header", "question", "options"],
          },
        },
      },
      required: ["moment", "questions"],
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const answers = [];
      let outcome = "answered";
      let executionError;
      const ui = deps.ui ?? ctx?.ui;

      try {
        if (typeof ui?.select !== "function" || typeof ui?.input !== "function") {
          throw new Error("operator dialogs are unavailable");
        }
        for (const question of params.questions) {
          const answer = question.multiSelect === true
            ? await askMultiple(ui, question)
            : await askSingle(ui, question);
          if (answer === undefined) {
            outcome = "abandoned";
            break;
          }
          answers.push(answer);
        }
      } catch (error) {
        outcome = "error";
        executionError = error;
        warn(`dialog failed: ${warningMessage(error)}`, ctx);
      }

      const doctrineResult = followUpDoctrine(doctrine, params.moment);
      if (doctrineResult.error) {
        warn(`doctrine section fallback: ${warningMessage(doctrineResult.error)}`, ctx);
      }
      const result = toolResult(
        params.moment,
        outcome,
        answers,
        doctrineResult,
        executionError,
      );
      await appendMarker(params.moment, params.questions.length, outcome, ctx);
      return result;
    },
  });

  pi.on("session_start", () => {
    alignmentPending = true;
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (!alignmentPending) return undefined;
    alignmentPending = false;
    if (doctrine === "") {
      warn("alignment doctrine injection skipped because the doctrine is unavailable", ctx);
      return undefined;
    }
    return {
      systemPrompt: `${event.systemPrompt}\n\n${ALIGNMENT_LEAD}\n\n${doctrine}`,
    };
  });
}
