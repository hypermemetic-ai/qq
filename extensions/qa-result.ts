// @ts-nocheck
import { randomUUID } from "node:crypto";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname, join } from "node:path";

import { readHandoff } from "../bin/lib/run.mjs";

async function writePrivate(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
  finally { await handle.close(); }
  await rename(temporary, path);
}

export default function registerQaResult(pi, deps = {}) {
  const env = deps.env ?? process.env;
  let submitted = false;
  pi.registerTool({
    name: "qa_verdict", label: "QA verdict",
    description: "Submit the one final qa verdict. Call exactly once, after reviewing code and tests.",
    parameters: {
      type: "object", additionalProperties: false, required: ["verdict", "summary", "feedback", "tests_modified"],
      properties: {
        verdict: { type: "string", enum: ["pass", "fail"] },
        summary: { type: "string", minLength: 1, maxLength: 240 },
        feedback: { type: "string", maxLength: 8000 },
        tests_modified: { type: "boolean" },
      },
    },
    async execute(_id, params, _signal, _update, ctx) {
      if (submitted) return { content: [{ type: "text", text: "qa_verdict was already submitted." }], details: { status: "refused" } };
      let resultPath = env.QQ_QA_RESULT;
      if (!resultPath && env.QQ_RUN_STATE) {
        try {
          const state = await readHandoff(env.QQ_RUN_STATE);
          if (state.look === 1 || state.look === 2) resultPath = join(dirname(env.QQ_RUN_STATE), `qa-look-${state.look}.json`);
        } catch {}
      }
      if (!resultPath) return { content: [{ type: "text", text: "qa result path is unavailable." }], details: { status: "refused" } };
      submitted = true;
      const value = { schema: "qq.qa-verdict/v1", version: 1, ...params, createdAt: new Date().toISOString() };
      await (deps.write ?? writePrivate)(resultPath, value);
      setTimeout(() => { try { ctx?.shutdown?.(); } catch {} }, 25).unref?.();
      return { content: [{ type: "text", text: `qa verdict recorded: ${params.verdict}` }], details: value };
    },
  });
}
